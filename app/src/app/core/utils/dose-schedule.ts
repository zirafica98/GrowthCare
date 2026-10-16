import { Injection, InjectionStatus, Medication } from '../models/models';
import { addDays, combineLocal, isoWeekday, startOfDay, startOfWeek, toLocalDate } from './dates';

/**
 * Scheduling + descriptive statistics for recorded doses.
 * Nothing here recommends or derives a dose — the scheduled dose is always
 * the dose the parent recorded on the medication.
 */

export function parseFrequency(freq: string): { kind: 'daily' } | { kind: 'weekly'; days: number[] } {
  if (freq?.startsWith('weekly:')) {
    const days = freq.slice(7).split(',').map(Number).filter((d) => d >= 1 && d <= 7);
    return { kind: 'weekly', days };
  }
  return { kind: 'daily' };
}

export function frequencyLabel(freq: string): string {
  const f = parseFrequency(freq);
  if (f.kind === 'daily') return 'Svaki dan';
  const names = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];
  return f.days.map((d) => names[d - 1]).join(', ');
}

export function isScheduledOn(med: Medication, day: Date): boolean {
  const d = toLocalDate(day);
  if (!med.active && !med.end_date) return false;
  if (med.start_date && d < med.start_date) return false;
  if (med.end_date && d > med.end_date) return false;
  const f = parseFrequency(med.frequency);
  return f.kind === 'daily' || f.days.includes(isoWeekday(day));
}

/** Deterministic slot timestamp → both parents' devices compute the same value (unique key). */
export function slotFor(med: Medication, day: Date): string {
  return combineLocal(toLocalDate(day), med.scheduled_time).toISOString();
}

export interface DoseSlot {
  medication: Medication;
  scheduledFor: string;
  record: Injection | null;
  /** Effective status: recorded status, or 'missed'/'pending' derived from time. */
  status: InjectionStatus;
}

export function slotStatus(record: Injection | null, scheduledFor: string, now: Date): InjectionStatus {
  if (record) return record.status;
  // Not recorded: before the end of that day it is pending; afterwards it is shown as missed.
  const endOfDay = addDays(startOfDay(new Date(scheduledFor)), 1);
  return now >= endOfDay ? 'missed' : 'pending';
}

/** All expected slots in [from, to] (inclusive days) for the given medications. */
export function expectedSlots(meds: Medication[], injections: Injection[], from: Date, to: Date, now = new Date()): DoseSlot[] {
  const byKey = new Map(injections.map((i) => [`${i.medication_id}|${i.scheduled_for}`, i]));
  const out: DoseSlot[] = [];
  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    for (const m of meds) {
      if (!isScheduledOn(m, day)) continue;
      const scheduledFor = slotFor(m, day);
      const record = byKey.get(`${m.id}|${scheduledFor}`) ?? null;
      out.push({ medication: m, scheduledFor, record, status: slotStatus(record, scheduledFor, now) });
    }
  }
  return out;
}

export interface DoseStats {
  expected: number;
  given: number;
  skipped: number;
  missed: number;
  pending: number;
  /** given / (expected - pending), 0–100, or null when nothing is due yet. */
  adherence: number | null;
  /** Sum of recorded given doses, grouped by unit. */
  totals: Record<string, number>;
}

export function doseStats(slots: DoseSlot[]): DoseStats {
  const s: DoseStats = { expected: slots.length, given: 0, skipped: 0, missed: 0, pending: 0, adherence: null, totals: {} };
  for (const slot of slots) {
    s[slot.status] += 1;
    if (slot.status === 'given' && slot.record?.dose != null) {
      const unit = slot.record.dose_unit;
      s.totals[unit] = round((s.totals[unit] ?? 0) + slot.record.dose, 3);
    }
  }
  const due = s.expected - s.pending;
  s.adherence = due > 0 ? Math.round((s.given / due) * 100) : null;
  return s;
}

export interface WeekStats extends DoseStats {
  weekStart: string;
}

export function weeklyStats(slots: DoseSlot[]): WeekStats[] {
  const groups = new Map<string, DoseSlot[]>();
  for (const s of slots) {
    const k = toLocalDate(startOfWeek(new Date(s.scheduledFor)));
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([weekStart, list]) => ({ weekStart, ...doseStats(list) }));
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export const STATUS_LABEL: Record<InjectionStatus, string> = {
  given: 'Dato',
  skipped: 'Nije dato',
  missed: 'Propušteno',
  pending: 'Čeka',
};
