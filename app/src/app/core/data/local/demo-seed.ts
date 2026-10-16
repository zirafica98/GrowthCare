import {
  Child, Doctor, DoctorVisit, Family, FamilyMember, GrowthMeasurement, Injection, LabResult, LabTest, MedicalDocument,
  Medication, MedicationStock, NotificationPreferences, Reminder, TherapyChange,
} from '../../models/models';
import { addDays, addMonths, combineLocal, startOfDay, toLocalDate } from '../../utils/dates';
import { slotFor } from '../../utils/dose-schedule';
import { bmi } from '../../utils/growth';
import { uuid } from '../../utils/uuid';
import { LocalAuthBackend } from './local-auth';
import { LocalDb } from './local-db';

/**
 * Fictional demo data (names from the design mock-ups). Contains NO real
 * patient data. Test credentials for the local demo backend only.
 */
export const DEMO_ACCOUNTS = [
  { key: 'a', email: 'roditelj.a@demo.growthcare', password: 'growthcare1', name: 'Milica Marković', label: 'Roditelj A' },
  { key: 'b', email: 'roditelj.b@demo.growthcare', password: 'growthcare1', name: 'Stefan Marković', label: 'Roditelj B' },
  { key: 'c', email: 'druga.porodica@demo.growthcare', password: 'growthcare1', name: 'Jelena Petrović', label: 'Nepovezana porodica' },
] as const;

type Row = Record<string, unknown> & { id: string };

export async function seedDemo(db: LocalDb, auth: LocalAuthBackend): Promise<void> {
  await db.load();
  if (await db.isSeeded()) return;

  const today = startOfDay(new Date());
  const iso = (d: Date) => d.toISOString();
  const nowIso = new Date().toISOString();
  const put = (table: Parameters<LocalDb['table']>[0], row: object) => db.table(table).set((row as Row).id, row as Row);

  const users: Record<string, string> = {};
  for (const a of DEMO_ACCOUNTS) users[a.key] = (await auth.createUser(a.email, a.password, a.name)).id;

  // ---------------------------------------------------------------- family 1
  const fam: Family = { id: uuid(), name: 'Porodica Marković', created_by: users['a'], settings: {}, created_at: nowIso, updated_at: nowIso };
  put('families', fam);
  const members: FamilyMember[] = [
    { id: uuid(), family_id: fam.id, user_id: users['a'], role: 'owner', status: 'active', display_name: DEMO_ACCOUNTS[0].name, created_at: nowIso },
    { id: uuid(), family_id: fam.id, user_id: users['b'], role: 'parent', status: 'active', display_name: DEMO_ACCOUNTS[1].name, created_at: nowIso },
  ];
  members.forEach((m) => put('family_members', m));

  const dobFrom = (years: number, months: number) => toLocalDate(addDays(addMonths(today, -(years * 12 + months)), -3));
  const child = (first: string, years: number, months: number, sex: 'male' | 'female', color: string): Child => ({
    id: uuid(), family_id: fam.id, first_name: first, last_name: 'Marković', date_of_birth: dobFrom(years, months), sex, photo_url: null,
    avatar_color: color, birth_weight_g: 3200, birth_length_cm: 51, notes: null, created_at: nowIso, updated_at: nowIso,
  });
  const luka = child('Luka', 8, 4, 'male', '#DCEBFF');
  const ana = child('Ana', 5, 2, 'female', '#FDE7EF');
  const marko = child('Marko', 2, 8, 'male', '#E3F6EC');
  [luka, ana, marko].forEach((c) => put('children', c));

  const doctors: Doctor[] = [
    { id: uuid(), family_id: fam.id, name: 'Dr Jovan Jovanović', specialty: 'Dečja endokrinologija', clinic: 'Univerzitetska dečja klinika', phone: null, email: null, notes: null, created_at: nowIso },
    { id: uuid(), family_id: fam.id, name: 'Dr Marija Novak', specialty: 'Pedijatrija', clinic: 'Dom zdravlja', phone: null, email: null, notes: null, created_at: nowIso },
  ];
  doctors.forEach((d) => put('doctors', d));

  // Therapy: started 0.6 mg, changed to 0.8 mg ~46 days ago.
  const startDate = addMonths(today, -7);
  const changeDate = addDays(today, -46);
  const med: Medication = {
    id: uuid(), child_id: luka.id, name: 'Norditropin', substance: 'Somatropin', strength: '10 mg/1,5 ml', unit: null, active: true,
    start_date: toLocalDate(startDate), end_date: null, current_dose: 0.8, dose_unit: 'mg', frequency: 'daily', scheduled_time: '21:30',
    prescribing_doctor: doctors[0].name, notes: null, created_at: iso(startDate), updated_at: nowIso,
  };
  put('medications', med);

  const pastVisit: DoctorVisit = {
    id: uuid(), child_id: luka.id, doctor_id: doctors[0].id, scheduled_at: iso(combineLocal(toLocalDate(changeDate), '10:15')),
    completed_at: iso(combineLocal(toLocalDate(changeDate), '11:00')), status: 'completed', reason: 'Redovna kontrola',
    notes: 'Lekar je propisao novu dozu.', follow_up_date: toLocalDate(addDays(today, 39)), tasks: [], created_by: users['a'],
    created_at: nowIso, updated_at: nowIso,
  };
  const changes: TherapyChange[] = [
    { id: uuid(), medication_id: med.id, child_id: luka.id, previous_dose: null, new_dose: 0.6, dose_unit: 'mg', changed_at: toLocalDate(startDate), source_type: 'manual', source_document_id: null, doctor_visit_id: null, note: 'Početak terapije', created_by: users['a'], created_at: iso(startDate) },
    { id: uuid(), medication_id: med.id, child_id: luka.id, previous_dose: 0.6, new_dose: 0.8, dose_unit: 'mg', changed_at: toLocalDate(changeDate), source_type: 'doctor_visit', source_document_id: null, doctor_visit_id: pastVisit.id, note: 'Prema izveštaju lekara.', created_by: users['a'], created_at: iso(changeDate) },
  ];
  changes.forEach((c) => put('therapy_changes', c));

  // Injections for the last 120 days (today stays pending).
  const sites = ['Butina (levo)', 'Butina (desno)', 'Stomak (levo)', 'Stomak (desno)', 'Nadlaktica (levo)', 'Nadlaktica (desno)'];
  for (let n = 120; n >= 1; n--) {
    const day = addDays(today, -n);
    const scheduled = slotFor(med, day);
    const dose = day < changeDate ? 0.6 : 0.8;
    const by = n % 3 === 0 ? users['b'] : users['a'];
    let inj: Injection;
    if (n === 17 || n === 58) {
      inj = { id: uuid(), child_id: luka.id, medication_id: med.id, scheduled_for: scheduled, administered_at: null, dose: null, dose_unit: 'mg', status: 'skipped', administered_by: by, injection_site: null, reaction: null, skip_reason: n === 17 ? 'Bolest' : 'Dete nije bilo dostupno', note: null, created_at: scheduled, updated_at: scheduled };
    } else if (n === 33) {
      continue; // nothing recorded → shown as missed
    } else {
      const at = new Date(new Date(scheduled).getTime() + ((n * 7) % 25) * 60_000);
      inj = { id: uuid(), child_id: luka.id, medication_id: med.id, scheduled_for: scheduled, administered_at: iso(at), dose, dose_unit: 'mg', status: 'given', administered_by: by, injection_site: sites[n % sites.length], reaction: n % 11 === 0 ? 'redness' : 'great', skip_reason: null, note: null, created_at: iso(at), updated_at: iso(at) };
    }
    put('injections', inj);
  }

  const stock: MedicationStock = {
    id: uuid(), medication_id: med.id, child_id: luka.id, package_name: 'Norditropin FlexPro 10 mg/1,5 ml', strength: '10 mg/1,5 ml',
    total_amount: 10, quantity: 2, opened_at: toLocalDate(addDays(today, -6)), refill_date: null,
    expires_at: toLocalDate(addMonths(today, 10)), reminder_threshold_days: 7, note: null, created_at: nowIso,
  };
  put('medication_stock', stock);

  // Growth measurements (descriptive demo values).
  const heights: [number, number, number][] = [
    [-24, 118.2, 21.4], [-21, 119.0, 21.9], [-18, 119.9, 22.6], [-15, 120.6, 23.2], [-12, 121.5, 23.9],
    [-9, 122.6, 24.8], [-7, 123.4, 25.3], [-5, 124.9, 25.9], [-3, 126.3, 26.6], [-1, 127.7, 27.0],
  ];
  heights.forEach(([mo, h, w]) => {
    const at = combineLocal(toLocalDate(addMonths(today, mo)), '08:00');
    const m: GrowthMeasurement = { id: uuid(), child_id: luka.id, measured_at: iso(at), height_cm: h, weight_kg: w, bmi: bmi(h, w), head_circumference_cm: null, source: mo === -7 || mo === -1 ? 'doctor' : 'home', note: null, created_by: users['a'], created_at: iso(at) };
    put('growth_measurements', m);
  });
  const recent = combineLocal(toLocalDate(addDays(today, -4)), '08:00');
  put('growth_measurements', { id: uuid(), child_id: luka.id, measured_at: iso(recent), height_cm: 128.4, weight_kg: 27.2, bmi: bmi(128.4, 27.2), head_circumference_cm: null, source: 'home', note: null, created_by: users['b'], created_at: iso(recent) });
  [[-12, 104.1, 17.2], [-6, 106.9, 18.0], [-1, 108.8, 18.6]].forEach(([mo, h, w]) => {
    const at = combineLocal(toLocalDate(addMonths(today, mo)), '09:00');
    put('growth_measurements', { id: uuid(), child_id: ana.id, measured_at: iso(at), height_cm: h, weight_kg: w, bmi: bmi(h, w), head_circumference_cm: null, source: 'home', note: null, created_by: users['a'], created_at: iso(at) });
  });

  // Visits.
  put('doctor_visits', pastVisit);
  const nextVisit: DoctorVisit = {
    id: uuid(), child_id: luka.id, doctor_id: doctors[0].id, scheduled_at: iso(combineLocal(toLocalDate(addDays(today, 39)), '16:30')),
    completed_at: null, status: 'scheduled', reason: 'Kontrola terapije', notes: 'Poneti rezultate laboratorije.', follow_up_date: null,
    tasks: [{ id: uuid(), text: 'Uraditi laboratoriju (IGF-1, TSH, FT4)', done: false }, { id: uuid(), text: 'Poneti dnevnik doza', done: true }],
    created_by: users['a'], created_at: nowIso, updated_at: nowIso,
  };
  put('doctor_visits', nextVisit);
  put('doctor_visits', { ...nextVisit, id: uuid(), doctor_id: doctors[1].id, scheduled_at: iso(combineLocal(toLocalDate(addDays(today, 91)), '10:00')), reason: 'Sistematski pregled', notes: null, tasks: [] });

  // Labs.
  const labDoc = makeDocument(fam.id, luka.id, users['a'], 'laboratory', 'Laboratorija — hormoni', addDays(today, -5), [
    'BIOHEMIJSKA LABORATORIJA (DEMO)',
    `Datum uzorkovanja: ${fmt(addDays(today, -5))}`,
    'IGF-1 245.6 [100-400] (ng/mL)', 'TSH 2.1 [0.4-4.0] (mIU/L)', 'FT4 16.8 [12-22] (pmol/L)',
  ]);
  const lab1: LabTest = { id: uuid(), child_id: luka.id, collected_at: iso(combineLocal(toLocalDate(addDays(today, -5)), '08:00')), laboratory: 'Biohemijska laboratorija', document_id: labDoc.row.id, notes: null, created_by: users['a'], created_at: nowIso };
  const lab0: LabTest = { id: uuid(), child_id: luka.id, collected_at: iso(combineLocal(toLocalDate(addDays(today, -42)), '08:00')), laboratory: 'Biohemijska laboratorija', document_id: null, notes: null, created_by: users['a'], created_at: nowIso };
  const labPrev: LabTest = { id: uuid(), child_id: luka.id, collected_at: iso(combineLocal(toLocalDate(addMonths(today, -4)), '08:00')), laboratory: 'Biohemijska laboratorija', document_id: null, notes: null, created_by: users['a'], created_at: nowIso };
  [lab1, lab0, labPrev].forEach((t) => put('lab_tests', t));
  const res = (t: LabTest, name: string, v: string, unit: string, range: string, flag: string | null = null): LabResult => ({
    id: uuid(), lab_test_id: t.id, child_id: luka.id, test_name: name, result_value: v, result_numeric: Number(v), unit,
    reference_range: range, flag, clinician_note: null, source_text: null, verified: true, created_at: nowIso,
  });
  [
    res(lab1, 'IGF-1', '245.6', 'ng/mL', '100-400'), res(lab1, 'TSH', '2.1', 'mIU/L', '0.4-4.0'), res(lab1, 'FT4', '16.8', 'pmol/L', '12-22'),
    res(lab0, 'GH', '1.2', 'ng/mL', '0.1-10'), res(lab0, 'IGF-BP3', '4.8', 'mg/L', '2.8-6.3'), res(lab0, 'IGF-1', '212.0', 'ng/mL', '100-400'),
    res(labPrev, 'IGF-1', '168.3', 'ng/mL', '100-400'), res(labPrev, 'TSH', '2.4', 'mIU/L', '0.4-4.0'), res(labPrev, 'FT4', '15.9', 'pmol/L', '12-22'),
  ].forEach((r) => put('lab_results', r));

  // Documents (generated demo PDFs).
  const docs = [
    labDoc,
    makeDocument(fam.id, luka.id, users['a'], 'doctor_report', 'Izveštaj lekara — Endokrinologija', changeDate, [
      'IZVEŠTAJ LEKARA (DEMO)', `Datum i vreme pregleda: ${fmt(changeDate)} 10:15`, 'Th: Norditropin 10 mg/1,5 ml, 0,8 mg / 24 h, svake večeri u 21:30 h',
      'Kontrola kod dečjeg endokrinologa za 6 nedelja.', 'Dr med. Jovan Jovanović',
    ]),
    makeDocument(fam.id, luka.id, users['b'], 'prescription', 'Recept — Norditropin', addDays(today, -12), ['RECEPT (DEMO)', 'Norditropin FlexPro 10 mg/1,5 ml', '2 uloška']),
    makeDocument(fam.id, luka.id, users['a'], 'referral', 'Uput — Endokrinologija', addMonths(today, -1), ['UPUT (DEMO)', 'Dečja endokrinologija']),
  ];
  for (const d of docs) {
    put('documents', d.row);
    await db.kv.set('files', d.row.storage_path, d.blob);
  }

  // Reminders.
  const rem = (r: Partial<Reminder> & Pick<Reminder, 'type' | 'title' | 'scheduled_for'>): Reminder => ({
    id: uuid(), child_id: luka.id, description: null, recurrence_rule: null, related_entity_type: null, related_entity_id: null,
    enabled: true, created_by: users['a'], created_at: nowIso, ...r,
  });
  [
    rem({ type: 'dose', title: 'Norditropin — 0.8 mg', scheduled_for: iso(combineLocal(toLocalDate(today), '21:30')), recurrence_rule: 'FREQ=DAILY', related_entity_type: 'medication', related_entity_id: med.id }),
    rem({ type: 'appointment', title: 'Kontrola — 7 dana ranije', scheduled_for: iso(addDays(new Date(nextVisit.scheduled_at), -7)), related_entity_type: 'doctor_visit', related_entity_id: nextVisit.id, description: '7d' }),
    rem({ type: 'appointment', title: 'Kontrola — 1 dan ranije', scheduled_for: iso(addDays(new Date(nextVisit.scheduled_at), -1)), related_entity_type: 'doctor_visit', related_entity_id: nextVisit.id, description: '1d' }),
    rem({ type: 'laboratory', title: 'Laboratorija pre kontrole', scheduled_for: iso(combineLocal(toLocalDate(addDays(today, 32)), '07:30')) }),
    rem({ type: 'measurement', title: 'Merenje visine/težine', scheduled_for: iso(combineLocal(toLocalDate(addDays(today, 3)), '08:00')), recurrence_rule: 'FREQ=WEEKLY;BYDAY=SU' }),
    rem({ type: 'stock', title: 'Nabavka terapije', scheduled_for: iso(combineLocal(toLocalDate(addDays(today, 7)), '10:00')), description: 'Proverite zalihu uložaka.' }),
  ].forEach((r) => put('reminders', r));

  const prefs = (uid: string): NotificationPreferences => ({
    id: uuid(), user_id: uid, dose_enabled: true, missed_dose_enabled: true, missed_dose_after_minutes: 60, appointment_enabled: true,
    laboratory_enabled: true, measurement_enabled: true, stock_enabled: true, custom_enabled: true, push_enabled: false,
    quiet_hours_start: null, quiet_hours_end: null,
  });
  put('notification_preferences', prefs(users['a']));
  put('notification_preferences', prefs(users['b']));

  // ---------------------------------------------------------------- unrelated family (isolation demo)
  const fam2: Family = { id: uuid(), name: 'Porodica Petrović', created_by: users['c'], settings: {}, created_at: nowIso, updated_at: nowIso };
  put('families', fam2);
  put('family_members', { id: uuid(), family_id: fam2.id, user_id: users['c'], role: 'owner', status: 'active', display_name: DEMO_ACCOUNTS[2].name, created_at: nowIso });
  put('children', { id: uuid(), family_id: fam2.id, first_name: 'Mila', last_name: 'Petrović', date_of_birth: dobFrom(6, 1), sex: 'female', photo_url: null, avatar_color: '#EDE7FF', birth_weight_g: null, birth_length_cm: null, notes: null, created_at: nowIso, updated_at: nowIso });

  for (const t of ['families', 'family_members', 'children', 'doctors', 'medications', 'therapy_changes', 'injections', 'medication_stock', 'growth_measurements', 'doctor_visits', 'lab_tests', 'lab_results', 'documents', 'reminders', 'notification_preferences'] as const) {
    await db.persist(t);
  }
  await db.markSeeded();
  db.setSession(null);
}

function fmt(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;
}

function makeDocument(familyId: string, childId: string, userId: string, category: MedicalDocument['category'], title: string, date: Date, lines: string[]) {
  const id = uuid();
  const filename = `${title.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
  const blob = makePdf(lines);
  const now = new Date().toISOString();
  const row: MedicalDocument = {
    id, child_id: childId, family_id: familyId, storage_path: `${familyId}/${childId}/${id}/${filename}`, original_filename: filename,
    mime_type: 'application/pdf', size_bytes: blob.size, category, document_date: toLocalDate(date), title, tags: ['demo'],
    doctor_visit_id: null, medication_id: null, ocr_status: 'completed', ocr_text: lines.join('\n'), created_by: userId, created_at: now, updated_at: now,
  };
  return { row, blob };
}

/** Builds a tiny valid one-page PDF with the given text lines (ASCII-folded). */
export function makePdf(lines: string[]): Blob {
  const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj').replace(/Đ/g, 'Dj').replace(/[^\x20-\x7e]/g, '').replace(/([()\\])/g, '\\$1');
  const content = ['BT', '/F1 13 Tf', '50 780 Td', '18 TL', ...lines.map((l) => `(${ascii(l)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
