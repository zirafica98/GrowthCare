import { TestBed } from '@angular/core/testing';
import { DataService } from '../data/data.service';
import { appError } from '../data/errors';
import { Injection } from '../models/models';
import { createWorld, provideWorld, World } from '../testing/test-world';
import { slotFor } from '../utils/dose-schedule';
import { uuid } from '../utils/uuid';
import { OfflineSyncService } from './offline-sync.service';

describe('Offline synchronisation', () => {
  let w: World;
  let data: DataService;
  let sync: OfflineSyncService;

  const dose = (): Injection => ({
    id: uuid(), child_id: w.child.id, medication_id: w.med.id, scheduled_for: slotFor(w.med, new Date('2026-10-16T12:00:00')),
    administered_at: new Date().toISOString(), dose: 0.8, dose_unit: 'mg', status: 'given', administered_by: w.ids.a,
    injection_site: null, reaction: null, skip_reason: null, note: null, created_at: '', updated_at: '',
  });

  beforeEach(async () => {
    w = await createWorld();
    provideWorld(w);
    data = TestBed.inject(DataService);
    sync = TestBed.inject(OfflineSyncService);
    await sync.clearAll();
    await sync.init(w.backend);
  });

  it('queues writes while offline, shows them locally, and syncs once on reconnect', async () => {
    sync.online.set(false);
    const row = dose();
    await data.insert('injections', row);
    expect(sync.pendingCount()).toBe(1);
    expect(sync.state()).toBe('offline');
    // visible locally (merged into reads) but not yet on the server
    expect((await data.list<Injection>('injections')).some((i) => i.id === row.id)).toBeTrue();
    expect((await w.backend.list('injections')).length).toBe(0);

    sync.online.set(true);
    await sync.flush();
    await sync.flush(); // second replay must not duplicate
    expect(sync.pendingCount()).toBe(0);
    expect((await w.backend.list('injections')).length).toBe(1);
  });

  it('folds an update into a pending insert and cancels insert+delete', async () => {
    sync.online.set(false);
    const row = dose();
    await data.insert('injections', row);
    await data.update<Injection>('injections', row.id, { note: 'edited' });
    expect(sync.pendingCount()).toBe(1);
    const other = { ...dose(), scheduled_for: slotFor(w.med, new Date('2026-10-15T12:00:00')) };
    await data.insert('injections', other);
    await data.remove('injections', other.id);
    expect(sync.pendingCount()).toBe(1);
    sync.online.set(true);
    await sync.flush();
    const saved = await w.backend.get<Injection>('injections', row.id);
    expect(saved!.note).toBe('edited');
  });

  it('surfaces a conflict when the other parent recorded the same dose meanwhile (no duplicate)', async () => {
    sync.online.set(false);
    await data.insert('injections', dose());
    // other phone records the same scheduled dose directly on the server
    await w.backend.insert('injections', dose());
    sync.online.set(true);
    await sync.flush();
    expect(sync.problems().length).toBe(1);
    expect(sync.problems()[0].error.kind).toBe('conflict');
    expect((await w.backend.list('injections')).length).toBe(1);
  });

  it('keeps items queued on network errors and retries later', async () => {
    const realInsert = w.backend.insert.bind(w.backend);
    let fail = true;
    spyOn(w.backend, 'insert').and.callFake(((t: never, r: never) => (fail ? Promise.reject(appError('network')) : realInsert(t, r))) as never);
    await data.insert('injections', dose());
    expect(sync.pendingCount()).toBe(1);
    fail = false;
    sync.online.set(true);
    await sync.flush();
    expect(sync.pendingCount()).toBe(0);
  });

  it('clears cached data and the outbox on logout', async () => {
    sync.online.set(false);
    await data.insert('injections', dose());
    await sync.clearAll();
    expect(sync.pendingCount()).toBe(0);
    expect(await sync.store.entries('queries')).toEqual([]);
  });
});
