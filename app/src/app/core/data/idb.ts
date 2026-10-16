/**
 * Minimal promise wrapper around IndexedDB key/value stores.
 * Falls back to an in-memory map when IndexedDB is unavailable (tests, private mode).
 */
export class KvStore {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memory = new Map<string, Map<string, unknown>>();

  constructor(
    private readonly dbName: string,
    private readonly stores: string[],
    private readonly version = 1,
  ) {}

  private open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      try {
        const req = indexedDB.open(this.dbName, this.version);
        req.onupgradeneeded = () => {
          for (const s of this.stores) {
            if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  private mem(store: string): Map<string, unknown> {
    let m = this.memory.get(store);
    if (!m) this.memory.set(store, (m = new Map()));
    return m;
  }

  private async tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await this.open();
    if (!db) return undefined;
    return new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async get<T>(store: string, key: string): Promise<T | undefined> {
    const db = await this.open();
    if (!db) return this.mem(store).get(key) as T | undefined;
    return this.tx<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>);
  }

  async set(store: string, key: string, value: unknown): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.mem(store).set(key, value);
      return;
    }
    await this.tx(store, 'readwrite', (s) => { s.put(value, key); });
  }

  async delete(store: string, key: string): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.mem(store).delete(key);
      return;
    }
    await this.tx(store, 'readwrite', (s) => { s.delete(key); });
  }

  async entries<T>(store: string): Promise<[string, T][]> {
    const db = await this.open();
    if (!db) return [...this.mem(store).entries()] as [string, T][];
    return new Promise((resolve, reject) => {
      const out: [string, T][] = [];
      const t = db.transaction(store, 'readonly');
      const req = t.objectStore(store).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          out.push([String(c.key), c.value as T]);
          c.continue();
        }
      };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
    });
  }

  async clear(store: string): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.mem(store).clear();
      return;
    }
    await this.tx(store, 'readwrite', (s) => { s.clear(); });
  }
}
