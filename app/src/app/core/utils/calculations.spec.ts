import { GrowthMeasurement, Injection, Medication } from '../models/models';
import { addDays, combineLocal, formatAge, plural, toLocalDate } from './dates';
import { doseStats, expectedSlots, isScheduledOn, slotFor, weeklyStats } from './dose-schedule';
import { bmi, changeOver, lastChange, velocities, velocityCmPerYear } from './growth';

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'm1', child_id: 'c1', name: 'Somatropin', substance: null, strength: null, unit: null, active: true, start_date: '2026-01-01',
  end_date: null, current_dose: 0.8, dose_unit: 'mg', frequency: 'daily', scheduled_time: '21:30', prescribing_doctor: null, notes: null,
  created_at: '', updated_at: '', ...over,
});

const given = (m: Medication, day: Date, dose = 0.8): Injection => ({
  id: `i${day.getTime()}`, child_id: m.child_id, medication_id: m.id, scheduled_for: slotFor(m, day), administered_at: slotFor(m, day),
  dose, dose_unit: 'mg', status: 'given', administered_by: 'u', injection_site: null, reaction: null, skip_reason: null, note: null, created_at: '', updated_at: '',
});

describe('dose schedule (descriptive only)', () => {
  const d = (s: string) => new Date(`${s}T12:00:00`);

  it('computes a deterministic slot so both parents share the same key', () => {
    expect(slotFor(med(), d('2026-10-16'))).toBe(combineLocal('2026-10-16', '21:30').toISOString());
  });

  it('respects start/end dates and weekday schedules', () => {
    expect(isScheduledOn(med({ start_date: '2026-10-17' }), d('2026-10-16'))).toBeFalse();
    expect(isScheduledOn(med({ frequency: 'weekly:1,3,5' }), d('2026-10-19'))).toBeTrue(); // Monday
    expect(isScheduledOn(med({ frequency: 'weekly:1,3,5' }), d('2026-10-20'))).toBeFalse(); // Tuesday
    expect(isScheduledOn(med({ active: false }), d('2026-10-16'))).toBeFalse();
  });

  it('derives missed (past, unrecorded) and pending (today, unrecorded) slots', () => {
    const m = med();
    const now = combineLocal('2026-10-16', '10:00');
    const slots = expectedSlots([m], [given(m, d('2026-10-14'))], d('2026-10-14'), d('2026-10-16'), now);
    expect(slots.map((s) => s.status)).toEqual(['given', 'missed', 'pending']);
  });

  it('computes adherence over due slots only and sums recorded doses', () => {
    const m = med();
    const now = combineLocal('2026-10-16', '10:00');
    const recs = [given(m, d('2026-10-13'), 0.6), given(m, d('2026-10-14'))];
    const s = doseStats(expectedSlots([m], recs, d('2026-10-13'), d('2026-10-16'), now));
    expect(s.expected).toBe(4);
    expect(s.pending).toBe(1);
    expect(s.missed).toBe(1);
    expect(s.adherence).toBe(67); // 2 of 3 due
    expect(s.totals['mg']).toBeCloseTo(1.4, 5);
  });

  it('groups weekly statistics (Monday weeks)', () => {
    const m = med();
    const now = combineLocal('2026-10-21', '23:59');
    const recs = [given(m, d('2026-10-12')), given(m, d('2026-10-19'))];
    const weeks = weeklyStats(expectedSlots([m], recs, d('2026-10-12'), d('2026-10-21'), now));
    expect(weeks.length).toBe(2);
    expect(weeks[0].weekStart).toBe('2026-10-19');
    expect(weeks[0].given).toBe(1);
  });
});

describe('growth calculations', () => {
  const m = (date: string, h: number | null, w: number | null): GrowthMeasurement => ({
    id: date, child_id: 'c', measured_at: `${date}T08:00:00Z`, height_cm: h, weight_kg: w, bmi: null, head_circumference_cm: null,
    source: 'home', note: null, created_by: 'u', created_at: '',
  });

  it('computes BMI as kg/m² and handles missing values', () => {
    expect(bmi(128.4, 27.2)).toBe(16.5);
    expect(bmi(null, 27)).toBeNull();
  });

  it('computes growth velocity only for intervals ≥ 28 days', () => {
    expect(velocityCmPerYear({ date: '2026-01-01', value: 120 }, { date: '2026-07-02', value: 124 })).toBeCloseTo(8.0, 0);
    expect(velocityCmPerYear({ date: '2026-01-01', value: 120 }, { date: '2026-01-10', value: 121 })).toBeNull();
  });

  it('reports last change and change over a period', () => {
    const list = [m('2026-01-01', 120, 24), m('2026-04-01', 121.5, null), m('2026-07-01', 123, 25)];
    expect(lastChange(list, 'height_cm')!.delta).toBe(1.5);
    expect(changeOver(list, 'height_cm', 3)!.delta).toBe(1.5);
    expect(lastChange(list, 'weight_kg')!.delta).toBe(1);
    expect(velocities(list).length).toBe(2);
  });
});

describe('dates', () => {
  it('formats Serbian ages with correct plurals', () => {
    const at = new Date('2026-10-16T12:00:00');
    expect(formatAge('2018-06-10', at)).toBe('8 godina, 4 meseca');
    expect(formatAge('2024-02-01', at)).toBe('2 godine, 8 meseci');
    expect(plural(21, 'godina', 'godine', 'godina')).toBe('godina');
    expect(plural(12, 'dan', 'dana', 'dana')).toBe('dana');
  });

  it('adds days across month boundaries', () => {
    expect(toLocalDate(addDays(new Date('2026-10-31T12:00:00'), 1))).toBe('2026-11-01');
  });
});
