/** Date helpers. All "local" helpers use the device timezone. */

export const DAY_MS = 86_400_000;

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** yyyy-mm-dd in local time. */
export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** HH:mm in local time. */
export function toLocalTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combine a local yyyy-mm-dd and HH:mm into a Date. */
export function combineLocal(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export function parseLocalDate(date: string): Date {
  return combineLocal(date, '00:00');
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

/** ISO weekday 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), 1 - isoWeekday(d));
}

export const MONTHS_SR = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
export const MONTHS_SR_GEN = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
export const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export const WEEKDAYS_SHORT_SR = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

/** 16.10.2026. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? (value.length === 10 ? parseLocalDate(value) : new Date(value)) : value;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`;
}

/** 16.10.2026. 21:30 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${formatDate(d)} ${toLocalTime(d)}`;
}

/** Serbian plural: 1 godina, 2–4 godine, 5+ godina (11–14 → godina). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Age as whole years and months on a given date. */
export function ageParts(dob: string, at: Date = new Date()): { years: number; months: number } {
  const b = parseLocalDate(dob);
  let months = (at.getFullYear() - b.getFullYear()) * 12 + (at.getMonth() - b.getMonth());
  if (at.getDate() < b.getDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** "8 godina, 4 meseca" */
export function formatAge(dob: string, at: Date = new Date()): string {
  const { years, months } = ageParts(dob, at);
  const y = `${years} ${plural(years, 'godina', 'godine', 'godina')}`;
  const m = `${months} ${plural(months, 'mesec', 'meseca', 'meseci')}`;
  if (years === 0) return m;
  if (months === 0) return y;
  return `${y}, ${m}`;
}

/** "za 5 dana", "danas", "sutra", "pre 3 dana" */
export function relativeDays(target: Date, now: Date = new Date()): string {
  const n = daysBetween(now, target);
  if (n === 0) return 'danas';
  if (n === 1) return 'sutra';
  if (n === -1) return 'juče';
  if (n > 0) return `za ${n} ${plural(n, 'dan', 'dana', 'dana')}`;
  const m = -n;
  return `pre ${m} ${plural(m, 'dan', 'dana', 'dana')}`;
}

export function monthLabel(d: Date): string {
  const m = MONTHS_SR[d.getMonth()];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}`;
}
