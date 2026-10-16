import { computed, Injectable, signal } from '@angular/core';
import { TableName } from '../models/models';
import { DataBackend } from '../data/data-backend';
import { AppError, isNetworkError, toAppError } from '../data/errors';
import { KvStore } from '../data/idb';
import { uuid } from '../utils/uuid';

export type OutboxOp = 'insert' | 'update' | 'delete';

export interface OutboxItem {
  id: string;
  table: TableName;
  op: OutboxOp;
  rowId: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  attempts: number;
}

export type SyncState = 'synced' | 'pending' | 'syncing' | 'offline' | 'error';

export interface SyncProblem {
  item: OutboxItem;
  error: AppError;
}

/**
 * Durable outbox for writes made while offline.
 *
 * Guarantees:
 *  - Writes survive reloads (IndexedDB).
 *  - Replays are idempotent: inserts carry the client-generated UUID and the
 *    backend upserts on it, so reconnecting never duplicates a dose record.
 *  - Ordering is preserved (FIFO); an update to a still-pending insert is
 *    folded into the insert, a delete cancels a pending insert.
 *  - Conflicts (e.g. the other parent recorded the same scheduled dose) are
 *    surfaced, never silently overwritten.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  readonly store = new KvStore('growthcare-cache', ['queries', 'outbox']);

  private readonly items = signal<OutboxItem[]>([]);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly syncing = signal(false);
  readonly lastError = signal<AppError | null>(null);
  readonly problems = signal<SyncProblem[]>([]);
  readonly lastSyncedAt = signal<Date | null>(null);

  readonly pendingCount = computed(() => this.items().length);
  readonly state = computed<SyncState>(() => {
    if (this.syncing()) return 'syncing';
    if (!this.online()) return 'offline';
    if (this.lastError() && this.items().length) return 'error';
    return this.items().length ? 'pending' : 'synced';
  });

  private backend: DataBackend | null = null;
  private loaded: Promise<void> | null = null;
  private flushing: Promise<void> | null = null;
  private onFlushed: (() => void)[] = [];

  init(backend: DataBackend): Promise<void> {
    this.backend = backend;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.online.set(true);
        void this.flush();
      });
      window.addEventListener('offline', () => this.online.set(false));
    }
    return this.load().then(() => this.flush());
  }

  /** Register a callback run after a successful flush (services reload data). */
  afterFlush(cb: () => void): void {
    this.onFlushed.push(cb);
  }

  load(): Promise<void> {
    return (this.loaded ??= this.store.entries<OutboxItem>('outbox').then((entries) => {
      this.items.set(entries.map(([, v]) => v).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    }));
  }

  pending(table?: TableName): OutboxItem[] {
    return table ? this.items().filter((i) => i.table === table) : this.items();
  }

  async enqueue(table: TableName, op: OutboxOp, rowId: string, payload: Record<string, unknown> | null): Promise<void> {
    await this.load();
    const current = this.items();
    const pendingInsert = current.find((i) => i.table === table && i.rowId === rowId && i.op === 'insert');

    if (pendingInsert && op === 'update') {
      const merged = { ...pendingInsert, payload: { ...pendingInsert.payload, ...payload } };
      await this.save(current.map((i) => (i.id === merged.id ? merged : i)));
      return;
    }
    if (pendingInsert && op === 'delete') {
      await this.save(current.filter((i) => !(i.table === table && i.rowId === rowId)));
      return;
    }
    const item: OutboxItem = { id: uuid(), table, op, rowId, payload, createdAt: new Date().toISOString(), attempts: 0 };
    await this.save([...current, item]);
  }

  private async save(next: OutboxItem[]): Promise<void> {
    const prev = new Set(this.items().map((i) => i.id));
    const keep = new Set(next.map((i) => i.id));
    for (const id of prev) if (!keep.has(id)) await this.store.delete('outbox', id);
    for (const i of next) await this.store.set('outbox', i.id, i);
    this.items.set(next);
  }

  /** Replay the outbox in order. Safe to call repeatedly. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    await this.load();
    if (!this.backend || !this.items().length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.online.set(false);
      return;
    }
    this.syncing.set(true);
    let flushedAny = false;
    try {
      for (const item of [...this.items()]) {
        try {
          await this.apply(item);
          flushedAny = true;
          await this.save(this.items().filter((i) => i.id !== item.id));
        } catch (err) {
          const e = toAppError(err);
          if (isNetworkError(e)) {
            this.lastError.set(e);
            const bumped = { ...item, attempts: item.attempts + 1 };
            await this.save(this.items().map((i) => (i.id === item.id ? bumped : i)));
            return; // stop; retry on next reconnect
          }
          // Conflict / permission / validation: drop the item and surface it.
          this.problems.update((p) => [...p, { item, error: e }]);
          await this.save(this.items().filter((i) => i.id !== item.id));
        }
      }
      this.lastError.set(null);
      this.lastSyncedAt.set(new Date());
    } finally {
      this.syncing.set(false);
      if (flushedAny) this.onFlushed.forEach((cb) => cb());
    }
  }

  private async apply(item: OutboxItem): Promise<void> {
    const b = this.backend!;
    switch (item.op) {
      case 'insert':
        await b.insert(item.table, item.payload as { id: string });
        break;
      case 'update':
        await b.update(item.table, item.rowId, item.payload ?? {});
        break;
      case 'delete':
        await b.remove(item.table, item.rowId);
        break;
    }
  }

  dismissProblem(p: SyncProblem): void {
    this.problems.update((list) => list.filter((x) => x !== p));
  }

  /** Logout cleanup: remove cached medical data and the outbox from this device. */
  async clearAll(): Promise<void> {
    await this.store.clear('queries');
    await this.store.clear('outbox');
    this.items.set([]);
    this.problems.set([]);
    this.lastError.set(null);
  }
}
