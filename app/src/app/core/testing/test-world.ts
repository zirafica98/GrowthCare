import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthBackend, DataBackend } from '../data/data-backend';
import { LocalAuthBackend } from '../data/local/local-auth';
import { LocalBackend } from '../data/local/local-backend';
import { LocalDb } from '../data/local/local-db';
import { Child, Family, Medication } from '../models/models';
import { OCR_PROVIDER } from '../ocr/ocr-provider';
import { MockOcrProvider } from '../ocr/providers';
import { uuid } from '../utils/uuid';

export const USERS = {
  a: { email: 'a@test.local', password: 'testpass1', name: 'Parent A' },
  b: { email: 'b@test.local', password: 'testpass1', name: 'Parent B' },
  c: { email: 'c@test.local', password: 'testpass1', name: 'Outsider C' },
};

export interface World {
  db: LocalDb;
  backend: LocalBackend;
  auth: LocalAuthBackend;
  ids: { a: string; b: string; c: string };
  family: Family;
  child: Child;
  med: Medication;
  as(user: 'a' | 'b' | 'c'): void;
}

/**
 * Fresh on-device backend with parent A (owner, family + child + medication),
 * parent B (registered, not yet a member) and an unrelated user C.
 */
export async function createWorld(): Promise<World> {
  const db = new LocalDb();
  await db.load();
  await db.reset();
  const auth = new LocalAuthBackend(db);
  const backend = new LocalBackend(db);
  const ids = {
    a: (await auth.createUser(USERS.a.email, USERS.a.password, USERS.a.name)).id,
    b: (await auth.createUser(USERS.b.email, USERS.b.password, USERS.b.name)).id,
    c: (await auth.createUser(USERS.c.email, USERS.c.password, USERS.c.name)).id,
  };
  const as = (u: 'a' | 'b' | 'c') => db.setSession(ids[u]);
  as('a');
  const family = await backend.rpc<Family>('create_family', { p_name: 'Test family' });
  const now = new Date().toISOString();
  const child = await backend.insert<Child>('children', {
    id: uuid(), family_id: family.id, first_name: 'Child1', last_name: null, date_of_birth: '2018-05-01', sex: null, photo_url: null,
    avatar_color: null, birth_weight_g: null, birth_length_cm: null, notes: null, created_at: now, updated_at: now,
  });
  const med = await backend.insert<Medication>('medications', {
    id: uuid(), child_id: child.id, name: 'Somatropin', substance: null, strength: null, unit: null, active: true,
    start_date: '2026-01-01', end_date: null, current_dose: 0.8, dose_unit: 'mg', frequency: 'daily', scheduled_time: '21:30',
    prescribing_doctor: null, notes: null, created_at: now, updated_at: now,
  });
  return { db, backend, auth, ids, family, child, med, as };
}

/** Configure TestBed with the local backend of a world (services resolve against it). */
export function provideWorld(w: World, ocrText?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LocalDb, useValue: w.db },
      { provide: DataBackend, useValue: w.backend },
      { provide: AuthBackend, useValue: w.auth },
      { provide: LocalAuthBackend, useValue: w.auth },
      { provide: OCR_PROVIDER, useValue: new MockOcrProvider(ocrText) },
    ],
  });
}
