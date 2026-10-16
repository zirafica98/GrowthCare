import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../data/errors';
import { Injection, LabResult, TherapyChange } from '../models/models';
import { createWorld, provideWorld, USERS, World } from '../testing/test-world';
import { OfflineSyncService } from '../sync/offline-sync.service';
import { ChildService } from './child.service';
import { DocumentService, safeFilename } from './document.service';
import { DoseService } from './dose.service';
import { FamilyService } from './family.service';
import { OcrService } from './ocr.service';
import { TherapyService } from './therapy.service';
import { MOCK_LAB_TEXT } from '../ocr/providers';

async function boot(w: World): Promise<void> {
  provideWorld(w, MOCK_LAB_TEXT);
  await TestBed.inject(OfflineSyncService).clearAll();
  await TestBed.inject(AuthService).init();
  await TestBed.inject(FamilyService).load();
  await TestBed.inject(ChildService).load();
}

describe('Authentication', () => {
  let w: World;
  beforeEach(async () => {
    w = await createWorld();
    w.db.setSession(null);
    await boot(w);
  });

  it('signs in with correct credentials and rejects wrong ones', async () => {
    const auth = TestBed.inject(AuthService);
    await expectAsync(auth.signIn(USERS.a.email, 'wrong-pass1')).toBeRejected();
    await auth.signIn(USERS.a.email, USERS.a.password);
    expect(auth.user()?.id).toBe(w.ids.a);
  });

  it('enforces the password policy on sign-up', async () => {
    const auth = TestBed.inject(AuthService);
    await expectAsync(auth.signUp('new@test.local', 'short', 'N')).toBeRejected();
    await expectAsync(auth.signUp('new@test.local', 'longenough', 'N')).toBeRejected(); // no digit
    const res = await auth.signUp('new@test.local', 'longenough1', 'New Parent');
    expect(res.user?.email).toBe('new@test.local');
  });

  it('clears session state on logout', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.signIn(USERS.a.email, USERS.a.password);
    await TestBed.inject(FamilyService).load();
    await auth.signOut();
    expect(auth.user()).toBeNull();
    expect(TestBed.inject(FamilyService).families().length).toBe(0);
    expect(TestBed.inject(ChildService).children().length).toBe(0);
  });
});

describe('Child switching', () => {
  it('only selects children visible to the user and scopes data to the selection', async () => {
    const w = await createWorld();
    await boot(w);
    const children = TestBed.inject(ChildService);
    const second = await children.add({ first_name: 'Child2', date_of_birth: '2021-01-01' });
    expect(children.selected()?.id).toBe(second.id); // newly added child becomes selected
    children.select(w.child.id);
    expect(children.selected()?.id).toBe(w.child.id);
    children.select('00000000-0000-4000-8000-000000000000'); // unknown id is ignored
    expect(children.selected()?.id).toBe(w.child.id);
  });
});

describe('Dose recording', () => {
  let w: World;
  let doses: DoseService;
  beforeEach(async () => {
    w = await createWorld();
    await boot(w);
    doses = TestBed.inject(DoseService);
  });

  it('records a given dose for today with the prefilled values', async () => {
    const [slot] = await doses.todaySlots(w.child.id);
    expect(slot.status).toBe('pending');
    await doses.give(slot, { dose: 0.8, administeredAt: new Date(), site: 'Butina (levo)', reaction: 'great', note: null, administeredBy: null }, w.child.id);
    const [after] = await doses.todaySlots(w.child.id);
    expect(after.status).toBe('given');
    expect(after.record!.administered_by).toBe(w.ids.a);
  });

  it('records a missed/skipped dose only with a reason', async () => {
    const [slot] = await doses.todaySlots(w.child.id);
    await expectAsync(doses.skip(slot, '', null, w.child.id)).toBeRejected();
    await doses.skip(slot, 'Bolest', null, w.child.id);
    const [after] = await doses.todaySlots(w.child.id);
    expect(after.status).toBe('skipped');
    expect(after.record!.skip_reason).toBe('Bolest');
  });

  it('refuses to record a dose when the selected child changed (cross-child guard)', async () => {
    const [slot] = await doses.todaySlots(w.child.id);
    await expectAsync(doses.give(slot, { dose: 0.8, administeredAt: new Date(), site: null, reaction: null, note: null, administeredBy: null }, 'other-child'))
      .toBeRejected();
  });

  it('reports who already recorded the dose instead of duplicating it', async () => {
    const [slot] = await doses.todaySlots(w.child.id);
    await doses.give(slot, { dose: 0.8, administeredAt: new Date(), site: null, reaction: null, note: null, administeredBy: null }, w.child.id);
    try {
      await doses.give({ ...slot, record: null }, { dose: 0.8, administeredAt: new Date(), site: null, reaction: null, note: null, administeredBy: null }, w.child.id);
      fail('expected conflict');
    } catch (e) {
      expect((e as AppError).kind).toBe('conflict');
    }
    expect((await w.backend.list<Injection>('injections')).length).toBe(1);
  });
});

describe('Therapy changes', () => {
  it('records explicit dose changes with previous and new values, never automatically', async () => {
    const w = await createWorld();
    await boot(w);
    const therapy = TestBed.inject(TherapyService);
    await expectAsync(therapy.changeDose(w.med, { newDose: 0.8, changedAt: '2026-10-16', source: 'manual' })).toBeRejected(); // same dose
    await therapy.changeDose(w.med, { newDose: 1.0, changedAt: '2026-10-16', source: 'manual', note: 'Lekar' });
    const [change] = await w.backend.list<TherapyChange>('therapy_changes');
    expect(change.previous_dose).toBe(0.8);
    expect(change.new_dose).toBe(1.0);
    expect((await w.backend.get<{ current_dose: number }>('medications', w.med.id))!.current_dose).toBe(1.0);
    // updateMedication cannot change the dose silently
    await therapy.updateMedication(w.med.id, { current_dose: 5, scheduled_time: '20:00' } as never);
    expect((await w.backend.get<{ current_dose: number }>('medications', w.med.id))!.current_dose).toBe(1.0);
  });
});

describe('Documents & OCR review', () => {
  let w: World;
  beforeEach(async () => {
    w = await createWorld();
    await boot(w);
  });

  it('sanitises storage file names', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('Nalaz š đ ž.pdf')).toBe('Nalaz_s_z.pdf');
  });

  it('rejects unsupported files', () => {
    const docs = TestBed.inject(DocumentService);
    expect(() => docs.validate(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))).toThrow();
  });

  it('stores OCR output only as unverified candidates until the parent confirms', async () => {
    const docs = TestBed.inject(DocumentService);
    const ocr = TestBed.inject(OcrService);
    const file = new File(['fake image'], 'lab.png', { type: 'image/png' });
    let doc = await docs.upload(w.child.id, file, { category: 'laboratory' });
    doc = await ocr.process(doc, file);
    expect(doc.ocr_status).toBe('review');
    expect((await w.backend.list<LabResult>('lab_results')).length).toBe(0); // nothing silently written

    const model = await ocr.reviewModel(doc);
    expect(model.labs.length).toBe(4);
    model.labs[3].include = false; // parent unticks one
    model.labs[0].result_value = '250.0'; // and corrects one
    await ocr.confirm(doc, {
      title: 'Lab', category: 'laboratory', documentDate: '2026-10-12', fields: model.fields, labs: model.labs,
      saveLabs: true, saveMeasurement: false, createFollowUp: false,
    });
    const results = await w.backend.list<LabResult>('lab_results');
    expect(results.length).toBe(3);
    expect(results.every((r) => r.verified)).toBeTrue();
    expect(results.find((r) => r.test_name === 'IGF-1')!.result_value).toBe('250.0');
    expect((await docs.get(doc.id))!.ocr_status).toBe('completed');
  });

  it('keeps documents private to the family', async () => {
    const docs = TestBed.inject(DocumentService);
    const doc = await docs.upload(w.child.id, new File(['%PDF-1.4'], 'r.pdf', { type: 'application/pdf' }), { category: 'doctor_report' });
    expect((await docs.file(doc)).size).toBeGreaterThan(0);
    w.as('c');
    expect(await docs.get(doc.id)).toBeNull();
    await expectAsync(docs.file(doc)).toBeRejected();
  });
});
