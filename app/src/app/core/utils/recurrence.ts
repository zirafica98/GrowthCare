import { Reminder } from '../models/models';
import { addDays, addMonths, isoWeekday } from './dates';

/**
 * Subset of RFC 5545 RRULE used by reminders:
 *   FREQ=DAILY|WEEKLY|MONTHLY [;INTERVAL=n] [;BYDAY=MO,TU,...] [;UNTIL=yyyy-mm-dd]
 * The first occurrence is `scheduled_for`; its time of day is reused.
 */
export interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  byDay: number[]; // ISO weekdays
  until: Date | null;
}

const DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function parseRule(rule: string | null | undefined): Rule | null {
  if (!rule) return null;
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]));
  const freq = parts['FREQ'];
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null;
  return {
    freq,
    interval: Math.max(1, Number(parts['INTERVAL'] ?? 1) || 1),
    byDay: (parts['BYDAY'] ?? '').split(',').filter(Boolean).map((c) => DAY_CODES.indexOf(c) + 1).filter((d) => d > 0),
    until: parts['UNTIL'] ? new Date(`${parts['UNTIL']}T23:59:59`) : null,
  };
}

export function buildRule(freq: Rule['freq'] | 'NONE', interval = 1, byDay: number[] = []): string | null {
  if (freq === 'NONE') return null;
  let r = `FREQ=${freq}`;
  if (interval > 1) r += `;INTERVAL=${interval}`;
  if (freq === 'WEEKLY' && byDay.length) r += `;BYDAY=${byDay.map((d) => DAY_CODES[d - 1]).join(',')}`;
  return r;
}

export function ruleLabel(rule: string | null | undefined): string {
  const r = parseRule(rule);
  if (!r) return 'Jednom';
  const every = r.interval > 1 ? `Svakih ${r.interval} ` : '';
  if (r.freq === 'DAILY') return r.interval > 1 ? `${every}dana` : 'Svaki dan';
  if (r.freq === 'MONTHLY') return r.interval > 1 ? `${every}meseci` : 'Svakog meseca';
  const names = ['pon', 'uto', 'sre', 'čet', 'pet', 'sub', 'ned'];
  const days = r.byDay.length ? ` (${r.byDay.map((d) => names[d - 1]).join(', ')})` : '';
  return (r.interval > 1 ? `${every}nedelja` : 'Nedeljno') + days;
}

/** Occurrences of a reminder within [from, to]. Hard cap protects against runaway loops. */
export function occurrences(reminder: Pick<Reminder, 'scheduled_for' | 'recurrence_rule'>, from: Date, to: Date, cap = 500): Date[] {
  const start = new Date(reminder.scheduled_for);
  const rule = parseRule(reminder.recurrence_rule);
  if (!rule) return start >= from && start <= to ? [start] : [];

  const out: Date[] = [];
  const end = rule.until && rule.until < to ? rule.until : to;
  let i = 0;

  if (rule.freq === 'WEEKLY' && rule.byDay.length) {
    // Walk day by day, honouring the week interval relative to the start week.
    const startWeekMonday = addDays(start, 1 - isoWeekday(start));
    for (let d = new Date(start); d <= end && i < cap * 7; d = addDays(d, 1), i++) {
      const weekIndex = Math.floor((addDays(d, 1 - isoWeekday(d)).getTime() - startWeekMonday.getTime()) / (7 * 86_400_000) + 0.5);
      if (weekIndex % rule.interval === 0 && rule.byDay.includes(isoWeekday(d)) && d >= from) out.push(new Date(d));
      if (out.length >= cap) break;
    }
    return out;
  }

  for (let n = 0; n < cap * 50; n++) {
    const d =
      rule.freq === 'DAILY' ? addDays(start, n * rule.interval)
      : rule.freq === 'WEEKLY' ? addDays(start, n * 7 * rule.interval)
      : addMonths(start, n * rule.interval);
    if (d > end) break;
    if (d >= from) out.push(d);
    if (out.length >= cap) break;
  }
  return out;
}

export function nextOccurrence(reminder: Pick<Reminder, 'scheduled_for' | 'recurrence_rule'>, after = new Date()): Date | null {
  const horizon = addDays(after, 400);
  return occurrences(reminder, after, horizon, 1)[0] ?? null;
}

/** True when `at` (HH:mm) falls into quiet hours [start, end) — handles overnight windows. */
export function inQuietHours(at: Date, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false;
  const minutes = at.getHours() * 60 + at.getMinutes();
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const s = toMin(start);
  const e = toMin(end);
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}
