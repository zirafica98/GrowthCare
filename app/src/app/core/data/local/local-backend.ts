import { Injectable } from '@angular/core';
import { AuditLog, Child, Family, FamilyInvitation, FamilyMember, LabTest, TableName } from '../../models/models';
import { addDays } from '../../utils/dates';
import { randomToken, uuid } from '../../utils/uuid';
import { DataBackend } from '../data-backend';
import { appError } from '../errors';
import { applyQuery, Query } from '../query';
import { LocalDb } from './local-db';

type Row = Record<string, unknown> & { id: string };

/** Tables whose rows carry a child_id and are authorised through the child's family. */
const CHILD_SCOPED: TableName[] = [
  'medications', 'therapy_changes', 'medication_stock', 'injections', 'growth_measurements',
  'doctor_visits', 'lab_tests', 'lab_results', 'document_extractions', 'reminders',
];
/** Tables whose rows carry a family_id. */
const FAMILY_SCOPED: TableName[] = ['family_members', 'family_invitations', 'children', 'doctors', 'documents', 'audit_logs'];

/** Tables recorded in the audit trail (mirrors the Postgres audit triggers). */
const AUDITED: TableName[] = [
  'injections', 'medications', 'therapy_changes', 'medication_stock', 'growth_measurements', 'documents',
  'family_members', 'family_invitations', 'children', 'doctor_visits', 'lab_tests', 'lab_results', 'document_extractions',
];

/** Unique constraints (mirrors the database). */
const UNIQUE: Partial<Record<TableName, string[]>> = {
  injections: ['medication_id', 'scheduled_for'],
  family_members: ['family_id', 'user_id'],
  notification_preferences: ['user_id'],
};

/** Rows that must be deleted when a parent row is deleted (ON DELETE CASCADE). */
const CASCADE: Partial<Record<TableName, { table: TableName; fk: string }[]>> = {
  families: [
    { table: 'family_members', fk: 'family_id' }, { table: 'family_invitations', fk: 'family_id' },
    { table: 'children', fk: 'family_id' }, { table: 'doctors', fk: 'family_id' }, { table: 'documents', fk: 'family_id' },
  ],
  children: CHILD_SCOPED.map((t) => ({ table: t, fk: 'child_id' })).concat([{ table: 'documents', fk: 'child_id' }]),
  medications: [{ table: 'therapy_changes', fk: 'medication_id' }, { table: 'injections', fk: 'medication_id' }, { table: 'medication_stock', fk: 'medication_id' }],
  lab_tests: [{ table: 'lab_results', fk: 'lab_test_id' }],
  documents: [{ table: 'document_extractions', fk: 'document_id' }],
};

/**
 * Demo backend. Everything is stored in IndexedDB on this device.
 * Authorisation rules emulate the Postgres RLS policies so that the
 * application behaves identically against Supabase.
 */
@Injectable()
export class LocalBackend extends DataBackend {
  readonly kind = 'local' as const;
  constructor(private readonly db: LocalDb) {
    super();
  }

  // ---------------------------------------------------------------- policies

  private uid(): string {
    if (!this.db.currentUserId) throw appError('auth');
    return this.db.currentUserId;
  }

  memberFamilyIds(userId: string): Set<string> {
    return new Set(
      this.db.rows<FamilyMember>('family_members').filter((m) => m.user_id === userId && m.status === 'active').map((m) => m.family_id),
    );
  }

  private childFamily(childId: unknown): string | null {
    const c = this.db.table('children').get(String(childId)) as unknown as Child | undefined;
    return c?.family_id ?? null;
  }

  private rowFamily(table: TableName, row: Row): string | null {
    if (table === 'families') return row.id;
    if (FAMILY_SCOPED.includes(table)) return (row['family_id'] as string) ?? null;
    if (CHILD_SCOPED.includes(table)) return this.childFamily(row['child_id']);
    return null;
  }

  private canRead(table: TableName, row: Row, uid: string): boolean {
    const fams = this.memberFamilyIds(uid);
    if (table === 'profiles') {
      if (row.id === uid) return true;
      return this.db.rows<FamilyMember>('family_members').some((m) => m.user_id === row.id && m.status === 'active' && fams.has(m.family_id));
    }
    if (table === 'notification_preferences') return row['user_id'] === uid;
    if (table === 'family_members' && row['user_id'] === uid) return true; // own membership, even if revoked
    const fam = this.rowFamily(table, row);
    return fam !== null && fams.has(fam);
  }

  private canWrite(table: TableName, row: Row, uid: string, op: 'insert' | 'update' | 'delete'): boolean {
    if (table === 'audit_logs') return false; // written by the system only
    if (table === 'profiles') return row.id === uid;
    if (table === 'notification_preferences') return row['user_id'] === uid;
    if (table === 'families') {
      if (op === 'insert') return false; // via create_family RPC
      return this.isOwner(row.id, uid) || (op === 'update' && this.memberFamilyIds(uid).has(row.id));
    }
    if (table === 'family_members') {
      if (op === 'insert') return false; // via RPCs
      return this.isOwner(row['family_id'] as string, uid) || row['user_id'] === uid;
    }
    if (table === 'family_invitations' && op !== 'insert') return this.memberFamilyIds(uid).has(row['family_id'] as string);
    const fam = this.rowFamily(table, row);
    return fam !== null && this.memberFamilyIds(uid).has(fam);
  }

  private isOwner(familyId: string, uid: string): boolean {
    return this.db.rows<FamilyMember>('family_members').some((m) => m.family_id === familyId && m.user_id === uid && m.role === 'owner' && m.status === 'active');
  }

  // ---------------------------------------------------------------- CRUD

  async list<T>(table: TableName, query?: Partial<Query>): Promise<T[]> {
    await this.db.load();
    const uid = this.uid();
    const visible = this.db.rows<Row>(table).filter((r) => this.canRead(table, r, uid));
    return structuredClone(applyQuery(visible, query)) as unknown as T[];
  }

  async get<T>(table: TableName, id: string): Promise<T | null> {
    await this.db.load();
    const row = this.db.table(table).get(id);
    if (!row || !this.canRead(table, row, this.uid())) return null;
    return structuredClone(row) as unknown as T;
  }

  async insert<T extends { id: string }>(table: TableName, row: T): Promise<T> {
    await this.db.load();
    const uid = this.uid();
    const t = this.db.table(table);
    const existing = t.get(row.id);
    if (existing) {
      // Idempotent replay of the same insert (offline queue) → no duplicate.
      if (!this.canRead(table, existing, uid)) throw appError('permission');
      return structuredClone(existing) as unknown as T;
    }
    const now = new Date().toISOString();
    const full: Row = { created_at: now, ...(row as unknown as Row) };
    if ('updated_at' in full || ['children', 'medications', 'injections', 'doctor_visits', 'documents', 'families', 'profiles'].includes(table)) {
      full['updated_at'] = full['updated_at'] ?? now;
    }
    if (!this.canWrite(table, full, uid, 'insert')) throw appError('permission');
    this.checkUnique(table, full);
    this.checkParent(table, full);
    t.set(full.id, full);
    await this.db.persist(table);
    await this.audit(table, 'insert', null, full);
    return structuredClone(full) as unknown as T;
  }

  async update<T>(table: TableName, id: string, patch: Partial<T>): Promise<T> {
    await this.db.load();
    const uid = this.uid();
    const t = this.db.table(table);
    const existing = t.get(id);
    if (!existing || !this.canRead(table, existing, uid)) throw appError('not_found');
    if (!this.canWrite(table, existing, uid, 'update')) throw appError('permission');
    const next: Row = { ...existing, ...(patch as Row), id };
    if ('updated_at' in existing) next['updated_at'] = new Date().toISOString();
    // A row may not be moved into a family the user does not belong to.
    if (!this.canWrite(table, next, uid, 'update')) throw appError('permission');
    this.checkUnique(table, next);
    t.set(id, next);
    await this.db.persist(table);
    await this.audit(table, 'update', existing, next);
    return structuredClone(next) as unknown as T;
  }

  async remove(table: TableName, id: string): Promise<void> {
    await this.db.load();
    const uid = this.uid();
    const existing = this.db.table(table).get(id);
    if (!existing) return;
    if (!this.canRead(table, existing, uid) || !this.canWrite(table, existing, uid, 'delete')) throw appError('permission');
    await this.audit(table, 'delete', existing, null);
    await this.cascadeDelete(table, id);
  }

  private async cascadeDelete(table: TableName, id: string): Promise<void> {
    for (const c of CASCADE[table] ?? []) {
      for (const r of this.db.rows<Row>(c.table).filter((x) => x[c.fk] === id)) await this.cascadeDelete(c.table, r.id);
    }
    const row = this.db.table(table).get(id);
    if (table === 'documents' && row?.['storage_path']) await this.db.kv.delete('files', String(row['storage_path']));
    this.db.table(table).delete(id);
    await this.db.persist(table);
  }

  private checkUnique(table: TableName, row: Row): void {
    const cols = UNIQUE[table];
    if (!cols) return;
    const clash = this.db.rows<Row>(table).find((r) => r.id !== row.id && cols.every((c) => r[c] === row[c]));
    if (clash) throw appError('conflict', { code: '23505', existingId: clash.id });
  }

  /** Denormalised child_id on child rows must match the parent row (DB trigger equivalent). */
  private checkParent(table: TableName, row: Row): void {
    if (table === 'lab_results') {
      const test = this.db.table('lab_tests').get(String(row['lab_test_id'])) as unknown as LabTest | undefined;
      if (!test || test.child_id !== row['child_id']) throw appError('permission');
    }
  }

  private async audit(table: TableName, action: string, oldRow: Row | null, newRow: Row | null): Promise<void> {
    if (!AUDITED.includes(table)) return;
    const ref = (newRow ?? oldRow)!;
    const familyId = this.rowFamily(table, ref);
    if (!familyId) return;
    const log: AuditLog = {
      id: uuid(),
      family_id: familyId,
      child_id: table === 'children' ? ref.id : ((ref['child_id'] as string) ?? null),
      user_id: this.db.currentUserId,
      entity_type: table,
      entity_id: ref.id,
      action,
      old_data: oldRow,
      new_data: newRow,
      created_at: new Date().toISOString(),
    };
    this.db.table('audit_logs').set(log.id, log as unknown as Row);
    await this.db.persist('audit_logs');
  }

  // ---------------------------------------------------------------- RPC

  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    await this.db.load();
    const uid = this.uid();
    const now = new Date().toISOString();
    switch (fn) {
      case 'create_family': {
        const family: Family = { id: uuid(), name: String(args['p_name']), created_by: uid, settings: {}, created_at: now, updated_at: now };
        this.db.table('families').set(family.id, family as unknown as Row);
        await this.db.persist('families');
        await this.addMember(family.id, uid, 'owner');
        return family as unknown as T;
      }
      case 'create_invitation': {
        const familyId = String(args['p_family_id']);
        if (!this.memberFamilyIds(uid).has(familyId)) throw appError('permission');
        const inv: FamilyInvitation = {
          id: uuid(), family_id: familyId, email: String(args['p_email']).trim().toLowerCase(), role: 'parent',
          token: randomToken(), status: 'pending', expires_at: addDays(new Date(), 7).toISOString(),
          accepted_at: null, created_by: uid, created_at: now,
        };
        this.db.table('family_invitations').set(inv.id, inv as unknown as Row);
        await this.db.persist('family_invitations');
        await this.audit('family_invitations', 'insert', null, inv as unknown as Row);
        return inv as unknown as T;
      }
      case 'get_invitation': {
        const inv = this.findInvitation(String(args['p_token']));
        if (!inv) return null as T;
        const fam = this.db.table('families').get(inv.family_id) as unknown as Family | undefined;
        const inviter = this.db.user(inv.created_by);
        return { family_name: fam?.name ?? '', invited_by: inviter?.full_name ?? '', email: inv.email, status: inv.status, expires_at: inv.expires_at } as T;
      }
      case 'accept_invitation': {
        const inv = this.findInvitation(String(args['p_token']));
        const me = this.db.user(uid);
        if (!inv || inv.status !== 'pending' || new Date(inv.expires_at) < new Date()) throw appError('not_found', null, 'Pozivnica nije važeća ili je istekla.');
        if (!me || me.email !== inv.email) throw appError('permission', null, 'Pozivnica je poslata na drugu e-mail adresu.');
        const existing = this.db.rows<FamilyMember>('family_members').find((m) => m.family_id === inv.family_id && m.user_id === uid);
        if (existing) {
          const reactivated = { ...existing, status: 'active' as const };
          this.db.table('family_members').set(existing.id, reactivated as unknown as Row);
          await this.db.persist('family_members');
          await this.audit('family_members', 'update', existing as unknown as Row, reactivated as unknown as Row);
        } else {
          await this.addMember(inv.family_id, uid, inv.role);
        }
        const accepted = { ...inv, status: 'accepted', accepted_at: now };
        this.db.table('family_invitations').set(inv.id, accepted as unknown as Row);
        await this.db.persist('family_invitations');
        return inv.family_id as T;
      }
      default:
        throw appError('unknown', null, `Nepoznata operacija: ${fn}`);
    }
  }

  private findInvitation(token: string): FamilyInvitation | undefined {
    return this.db.rows<FamilyInvitation>('family_invitations').find((i) => i.token === token);
  }

  private async addMember(familyId: string, userId: string, role: 'owner' | 'parent'): Promise<void> {
    const u = this.db.user(userId);
    const m: FamilyMember = { id: uuid(), family_id: familyId, user_id: userId, role, status: 'active', display_name: u?.full_name ?? null, created_at: new Date().toISOString() };
    this.db.table('family_members').set(m.id, m as unknown as Row);
    await this.db.persist('family_members');
    await this.audit('family_members', 'insert', null, m as unknown as Row);
  }

  // ---------------------------------------------------------------- storage

  /** First path segment is the family id — storage policy equivalent. */
  private assertPathAccess(path: string): void {
    const familyId = path.split('/')[0];
    if (!this.memberFamilyIds(this.uid()).has(familyId)) throw appError('permission');
  }

  async upload(path: string, file: Blob): Promise<void> {
    await this.db.load();
    this.assertPathAccess(path);
    await this.db.kv.set('files', path, file);
  }

  async signedUrl(path: string): Promise<string> {
    const blob = await this.download(path);
    return URL.createObjectURL(blob);
  }

  async download(path: string): Promise<Blob> {
    await this.db.load();
    this.assertPathAccess(path);
    const blob = await this.db.kv.get<Blob>('files', path);
    if (!blob) throw appError('not_found');
    return blob;
  }

  async removeFile(path: string): Promise<void> {
    await this.db.load();
    this.assertPathAccess(path);
    await this.db.kv.delete('files', path);
  }
}
