import { AppError } from '../errors';
import { Child, FamilyInvitation, Injection } from '../../models/models';
import { createWorld, World } from '../../testing/test-world';
import { slotFor } from '../../utils/dose-schedule';
import { uuid } from '../../utils/uuid';
import { q } from '../query';

/**
 * Family isolation in the on-device backend mirrors the Postgres RLS policies
 * (the same scenarios are covered against Postgres in supabase/tests/rls_isolation_test.sql).
 */
describe('LocalBackend authorisation (RLS emulation)', () => {
  let w: World;
  beforeEach(async () => (w = await createWorld()));

  const injection = (day = new Date('2026-10-16T12:00:00')): Injection => ({
    id: uuid(), child_id: w.child.id, medication_id: w.med.id, scheduled_for: slotFor(w.med, day), administered_at: new Date().toISOString(),
    dose: 0.8, dose_unit: 'mg', status: 'given', administered_by: w.ids.a, injection_site: null, reaction: null, skip_reason: null, note: null,
    created_at: '', updated_at: '',
  });

  async function expectError(p: Promise<unknown>, kind: string): Promise<void> {
    try {
      await p;
      fail(`expected ${kind} error`);
    } catch (e) {
      expect((e as AppError).kind).toBe(kind);
    }
  }

  it('lets the owner read their child, but an unrelated user sees nothing', async () => {
    expect((await w.backend.list<Child>('children')).length).toBe(1);
    w.as('c');
    expect((await w.backend.list('children')).length).toBe(0);
    expect(await w.backend.get('children', w.child.id)).toBeNull();
    expect((await w.backend.list('medications', q().eq('child_id', w.child.id))).length).toBe(0);
  });

  it('rejects writes into another family even with a known child_id', async () => {
    w.as('c');
    await expectError(w.backend.insert('injections', injection()), 'permission');
    await expectError(w.backend.update('children', w.child.id, { first_name: 'X' }), 'not_found');
    await expectError(w.backend.insert('children', { ...w.child, id: uuid() }), 'permission');
  });

  it('never allows moving a row into a foreign family', async () => {
    w.as('c');
    const other = await w.backend.rpc<{ id: string }>('create_family', { p_name: 'C family' });
    w.as('a');
    await expectError(w.backend.update('children', w.child.id, { family_id: other.id }), 'permission');
  });

  it('invitation: only the invited e-mail can accept; then both parents share data', async () => {
    const inv = await w.backend.rpc<FamilyInvitation>('create_invitation', { p_family_id: w.family.id, p_email: 'b@test.local' });
    w.as('c');
    await expectError(w.backend.rpc('accept_invitation', { p_token: inv.token }), 'permission');
    w.as('b');
    expect((await w.backend.list('children')).length).toBe(0);
    await w.backend.rpc('accept_invitation', { p_token: inv.token });
    expect((await w.backend.list('children')).length).toBe(1);
  });

  it('revoked members lose access immediately', async () => {
    const inv = await w.backend.rpc<FamilyInvitation>('create_invitation', { p_family_id: w.family.id, p_email: 'b@test.local' });
    w.as('b');
    await w.backend.rpc('accept_invitation', { p_token: inv.token });
    w.as('a');
    const m = (await w.backend.list<{ id: string; user_id: string }>('family_members')).find((x) => x.user_id === w.ids.b)!;
    await w.backend.update('family_members', m.id, { status: 'revoked' });
    w.as('b');
    expect((await w.backend.list('children')).length).toBe(0);
  });

  it('inserts are idempotent on id and one record per scheduled dose is enforced', async () => {
    const row = injection();
    await w.backend.insert('injections', row);
    await w.backend.insert('injections', row); // replay
    expect((await w.backend.list('injections')).length).toBe(1);
    await expectError(w.backend.insert('injections', { ...row, id: uuid() }), 'conflict');
  });

  it('writes an audit trail with before/after values', async () => {
    const row = await w.backend.insert('injections', injection());
    await w.backend.update<Injection>('injections', row.id, { dose: 0.7 });
    const logs = (await w.backend.list<{ entity_id: string; action: string; old_data: Injection | null; new_data: Injection | null }>('audit_logs'))
      .filter((l) => l.entity_id === row.id);
    expect(logs.map((l) => l.action).sort()).toEqual(['insert', 'update']);
    const upd = logs.find((l) => l.action === 'update')!;
    expect(upd.old_data!.dose).toBe(0.8);
    expect(upd.new_data!.dose).toBe(0.7);
    w.as('c');
    expect((await w.backend.list('audit_logs')).length).toBe(0);
  });

  it('protects private document storage by family path', async () => {
    const path = `${w.family.id}/${w.child.id}/${uuid()}/x.pdf`;
    await w.backend.upload(path, new Blob(['%PDF'], { type: 'application/pdf' }));
    expect((await w.backend.download(path)).size).toBe(4);
    w.as('c');
    await expectError(w.backend.download(path), 'permission');
    await expectError(w.backend.upload(`${w.family.id}/${w.child.id}/${uuid()}/y.pdf`, new Blob(['x'])), 'permission');
  });

  it('cascades child deletion to its records', async () => {
    await w.backend.insert('injections', injection());
    await w.backend.remove('children', w.child.id);
    expect((await w.backend.list('injections')).length).toBe(0);
    expect((await w.backend.list('medications')).length).toBe(0);
  });
});
