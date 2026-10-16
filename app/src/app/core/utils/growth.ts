import { GrowthMeasurement } from '../models/models';
import { DAY_MS } from './dates';
import { round } from './dose-schedule';

/**
 * Descriptive growth arithmetic only (no percentiles, no clinical interpretation).
 */

/** BMI = kg / m². Returns null when either value is missing. */
export function bmi(heightCm: number | null | undefined, weightKg: number | null | undefined): number | null {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

export type Metric = 'height_cm' | 'weight_kg' | 'bmi' | 'head_circumference_cm';

export function series(list: GrowthMeasurement[], metric: Metric): { date: string; value: number }[] {
  return list
    .filter((m) => m[metric] != null)
    .map((m) => ({ date: m.measured_at, value: m[metric] as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Change between the latest value and the previous one. */
export function lastChange(list: GrowthMeasurement[], metric: Metric): { delta: number; days: number } | null {
  const s = series(list, metric);
  if (s.length < 2) return null;
  const a = s[s.length - 2];
  const b = s[s.length - 1];
  return { delta: round(b.value - a.value, 2), days: Math.round((Date.parse(b.date) - Date.parse(a.date)) / DAY_MS) };
}

/** Change over the last N months (latest vs. the newest point at least N months older). */
export function changeOver(list: GrowthMeasurement[], metric: Metric, months: number): { delta: number; days: number } | null {
  const s = series(list, metric);
  if (s.length < 2) return null;
  const last = s[s.length - 1];
  const cutoff = new Date(last.date);
  cutoff.setMonth(cutoff.getMonth() - months);
  const base = [...s].reverse().find((p) => new Date(p.date) <= cutoff) ?? s[0];
  if (base === last) return null;
  return { delta: round(last.value - base.value, 2), days: Math.round((Date.parse(last.date) - Date.parse(base.date)) / DAY_MS) };
}

/** Growth velocity in cm/year between two height measurements (needs ≥ 28 days to be meaningful). */
export function velocityCmPerYear(a: { date: string; value: number }, b: { date: string; value: number }): number | null {
  const days = (Date.parse(b.date) - Date.parse(a.date)) / DAY_MS;
  if (days < 28) return null;
  return round(((b.value - a.value) / days) * 365.25, 1);
}

export interface VelocityRow {
  from: string;
  to: string;
  delta: number;
  days: number;
  perYear: number | null;
}

export function velocities(list: GrowthMeasurement[]): VelocityRow[] {
  const s = series(list, 'height_cm');
  const out: VelocityRow[] = [];
  for (let i = 1; i < s.length; i++) {
    out.push({
      from: s[i - 1].date,
      to: s[i].date,
      delta: round(s[i].value - s[i - 1].value, 1),
      days: Math.round((Date.parse(s[i].date) - Date.parse(s[i - 1].date)) / DAY_MS),
      perYear: velocityCmPerYear(s[i - 1], s[i]),
    });
  }
  return out.reverse();
}

export function formatSigned(n: number, unit: string, digits = 1): string {
  const v = round(n, digits).toLocaleString('sr-Latn', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  return `${n > 0 ? '+' : ''}${v} ${unit}`;
}
