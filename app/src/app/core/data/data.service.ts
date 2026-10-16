import { inject, Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { TableName } from '../models/models';
import { OfflineSyncService } from '../sync/offline-sync.service';
import { DataBackend } from './data-backend';
import { isNetworkError, toAppError } from './errors';
import { applyQuery, matchesFilter, Query } from './query';

type Row = Record<string, unknown> & { id: string };

/**
 * Single gateway between feature services and the backend.
 *  - Reads: network first; successful results are cached in IndexedDB so the
 *    last-seen data is viewable offline. Pending offline writes are merged in.
 *  - Writes: sent immediately when online; queued in the outbox when offline
 *    or on network failure. Non-network errors (permission, conflict) are
 *    thrown so the UI can react.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly backend = inject(DataBackend);
  private readonly sync = inject(OfflineSyncService);

  /** Emits the table name after any local write — pages use it to refresh. */
  readonly changes$ = new Subject<TableName>();

  get kind() {
    return this.backend.kind;
  }

  async list<T>(table: TableName, query?: Partial<Query>): Promise<T[]> {
    const key = `${table}:${JSON.stringify(query ?? {})}`;
    let rows: Row[];
    try {
      rows = await this.backend.list<Row>(table, query);
      void this.sync.store.set('queries', key, rows);
    } catch (err) {
      if (!isNetworkError(err)) throw toAppError(err);
      this.sync.online.set(false);
      rows = (await this.sync.store.get<Row[]>('queries', key)) ?? [];
    }
    return this.mergePending(table, rows, query) as unknown as T[];
  }

  async get<T>(table: TableName, id: string): Promise<T | null> {
    try {
      const row = await this.backend.get<T>(table, id);
      if (row) void this.sync.store.set('queries', `${table}#${id}`, row);
      return row;
    } catch (err) {
      if (!isNetworkError(err)) throw toAppError(err);
      return (await this.sync.store.get<T>('queries', `${table}#${id}`)) ?? null;
    }
  }

  async insert<T extends { id: string }>(table: TableName, row: T): Promise<T> {
    return this.write(table, 'insert', row.id, row as unknown as Row, () => this.backend.insert(table, row)) as Promise<T>;
  }

  async update<T>(table: TableName, id: string, patch: Partial<T>): Promise<T> {
    return this.write(table, 'update', id, patch as Row, () => this.backend.update<T>(table, id, patch)) as Promise<T>;
  }

  async remove(table: TableName, id: string): Promise<void> {
    await this.write(table, 'delete', id, null, () => this.backend.remove(table, id).then(() => null));
  }

  /** RPCs are never queued (they need a server answer). */
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    return this.backend.rpc<T>(fn, args).catch((e) => Promise.reject(toAppError(e)));
  }

  upload(path: string, file: Blob, contentType: string) {
    return this.backend.upload(path, file, contentType).catch((e) => Promise.reject(toAppError(e)));
  }
  signedUrl(path: string, seconds = 300) {
    return this.backend.signedUrl(path, seconds).catch((e) => Promise.reject(toAppError(e)));
  }
  download(path: string) {
    return this.backend.download(path).catch((e) => Promise.reject(toAppError(e)));
  }
  removeFile(path: string) {
    return this.backend.removeFile(path).catch((e) => Promise.reject(toAppError(e)));
  }

  private async write(
    table: TableName,
    op: 'insert' | 'update' | 'delete',
    id: string,
    payload: Row | null,
    send: () => Promise<unknown>,
  ): Promise<unknown> {
    const offline = !this.sync.online() || (typeof navigator !== 'undefined' && navigator.onLine === false);
    // Keep FIFO ordering: if something is already queued, queue behind it.
    if (offline || this.sync.pendingCount() > 0) {
      await this.sync.enqueue(table, op, id, payload);
      this.changes$.next(table);
      if (!offline) void this.sync.flush();
      return payload ? { ...payload, id } : null;
    }
    try {
      const result = await send();
      this.changes$.next(table);
      return result;
    } catch (err) {
      if (!isNetworkError(err)) throw toAppError(err);
      this.sync.online.set(false);
      await this.sync.enqueue(table, op, id, payload);
      this.changes$.next(table);
      return payload ? { ...payload, id } : null;
    }
  }

  /** Overlay queued writes on top of server/cached rows so offline edits are visible. */
  private mergePending(table: TableName, rows: Row[], query?: Partial<Query>): Row[] {
    const pending = this.sync.pending(table);
    if (!pending.length) return rows;
    const byId = new Map(rows.map((r) => [r.id, { ...r }]));
    for (const p of pending) {
      if (p.op === 'delete') byId.delete(p.rowId);
      else if (p.op === 'update' && byId.has(p.rowId)) byId.set(p.rowId, { ...byId.get(p.rowId)!, ...p.payload, _pending: true });
      else if (p.op === 'insert' && p.payload) {
        const row = { ...(p.payload as Row), _pending: true };
        if ((query?.filters ?? []).every((f) => matchesFilter(row, f))) byId.set(p.rowId, row);
      }
    }
    return applyQuery([...byId.values()], { ...query, filters: [] });
  }
}
