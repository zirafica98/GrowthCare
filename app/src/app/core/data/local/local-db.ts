import { TableName } from '../../models/models';
import { KvStore } from '../idb';

export interface LocalUserRecord {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  salt: string;
  created_at: string;
}

type Row = Record<string, unknown> & { id: string };

const TABLES: TableName[] = [
  'profiles', 'families', 'family_members', 'family_invitations', 'children', 'medications',
  'therapy_changes', 'medication_stock', 'injections', 'growth_measurements', 'doctors',
  'doctor_visits', 'lab_tests', 'lab_results', 'documents', 'document_extractions', 'reminders',
  'notification_preferences', 'audit_logs',
];

/**
 * In-browser database used by the demo/local backend. It stands in for both
 * Postgres (tables) and Supabase Auth (users) so the whole app is usable
 * without any server. Data lives in IndexedDB under "growthcare-demo".
 */
export class LocalDb {
  private static instance: LocalDb | null = null;
  static shared(): LocalDb {
    return (this.instance ??= new LocalDb());
  }

  readonly kv = new KvStore('growthcare-demo', ['tables', 'users', 'files', 'meta']);
  private tables = new Map<TableName, Map<string, Row>>();
  private users = new Map<string, LocalUserRecord>();
  private loaded: Promise<void> | null = null;
  currentUserId: string | null = null;

  load(): Promise<void> {
    return (this.loaded ??= (async () => {
      for (const t of TABLES) this.tables.set(t, new Map());
      const stored = await this.kv.entries<Row[]>('tables');
      for (const [name, rows] of stored) {
        const m = this.tables.get(name as TableName);
        if (m) rows.forEach((r) => m.set(r.id, r));
      }
      const users = await this.kv.entries<LocalUserRecord>('users');
      users.forEach(([, u]) => this.users.set(u.id, u));
      this.currentUserId = localStorage.getItem('gc.local.session');
    })());
  }

  table(name: TableName): Map<string, Row> {
    const t = this.tables.get(name);
    if (!t) throw new Error(`Unknown table ${name}`);
    return t;
  }

  rows<T = Row>(name: TableName): T[] {
    return [...this.table(name).values()] as unknown as T[];
  }

  async persist(name: TableName): Promise<void> {
    await this.kv.set('tables', name, [...this.table(name).values()]);
  }

  findUserByEmail(email: string): LocalUserRecord | undefined {
    const e = email.trim().toLowerCase();
    return [...this.users.values()].find((u) => u.email === e);
  }

  user(id: string): LocalUserRecord | undefined {
    return this.users.get(id);
  }

  async saveUser(u: LocalUserRecord): Promise<void> {
    this.users.set(u.id, u);
    await this.kv.set('users', u.id, u);
  }

  setSession(userId: string | null): void {
    this.currentUserId = userId;
    if (userId) localStorage.setItem('gc.local.session', userId);
    else localStorage.removeItem('gc.local.session');
  }

  async isSeeded(): Promise<boolean> {
    return (await this.kv.get<boolean>('meta', 'seeded')) === true;
  }

  async markSeeded(): Promise<void> {
    await this.kv.set('meta', 'seeded', true);
  }

  /** Wipe everything (used by "reset demo"). */
  async reset(): Promise<void> {
    for (const t of TABLES) {
      this.table(t).clear();
      await this.kv.delete('tables', t);
    }
    this.users.clear();
    await this.kv.clear('users');
    await this.kv.clear('files');
    await this.kv.clear('meta');
    this.setSession(null);
  }
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
