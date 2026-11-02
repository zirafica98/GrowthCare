// Supabase Edge Function: delivers due reminders as Web Push notifications.
//
// Triggered every 5 minutes by pg_cron (see migration 006). Safe to trigger
// more often or manually: every occurrence is recorded in public.push_log, so
// nothing is ever sent twice.
//
//   POST {}              → process due reminders (cron)
//   POST {"test": true}  → send a test notification to the CALLER's devices
//
// Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, APP_TIMEZONE
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
//
// Payloads are minimal ("Vreme je za dozu — Vuk"); no lab values, documents or
// diagnoses are ever sent through push services.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const TZ = Deno.env.get('APP_TIMEZONE') ?? 'Europe/Belgrade';
const WINDOW_MIN = 6; // cron runs every 5 min; 1 min overlap, de-duplicated by push_log
const DEFAULT_MISSED_AFTER = 60;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Reminder = { id: string; child_id: string; type: string; title: string; scheduled_for: string; recurrence_rule: string | null; related_entity_type: string | null; related_entity_id: string | null };
type Local = { date: string; minutes: number };

const TYPE_PREF: Record<string, string> = {
  dose: 'dose_enabled', missed_dose: 'missed_dose_enabled', appointment: 'appointment_enabled', laboratory: 'laboratory_enabled',
  measurement: 'measurement_enabled', stock: 'stock_enabled', custom: 'custom_enabled',
};

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Wall-clock date and minute-of-day in the family's timezone (DST-safe). */
function local(d: Date): Local {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const dayNum = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Does the reminder have an occurrence on local date `date`? */
function occursOn(r: Reminder, start: Local, date: string): boolean {
  if (date < start.date) return false;
  if (!r.recurrence_rule) return date === start.date;
  const parts: Record<string, string> = Object.fromEntries(r.recurrence_rule.split(';').map((x) => x.split('=')));
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1) || 1);
  if (parts.UNTIL && date > parts.UNTIL) return false;
  const days = dayNum(date) - dayNum(start.date);
  if (parts.FREQ === 'DAILY') return days % interval === 0;
  if (parts.FREQ === 'WEEKLY') {
    const byDay = parts.BYDAY ? parts.BYDAY.split(',') : [CODES[weekday(start.date)]];
    return byDay.includes(CODES[weekday(date)]) && Math.floor(days / 7) % interval === 0;
  }
  if (parts.FREQ === 'MONTHLY') return date.slice(8) === start.date.slice(8);
  return false;
}

/** Local dates (0–2) on which minute-of-day `m` fell inside the window (from, to]. */
function datesInWindow(m: number, from: Local, to: Local): string[] {
  if (from.date === to.date) return m > from.minutes && m <= to.minutes ? [to.date] : [];
  const out: string[] = [];
  if (m > from.minutes) out.push(from.date);
  if (m <= to.minutes) out.push(to.date);
  return out;
}

function inQuiet(minutes: number, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false;
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const s = toMin(start), e = toMin(end);
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

const payload = (title: string, body: string, url = '/app/dashboard', tag?: string) => JSON.stringify({
  notification: {
    title, body, tag, icon: '/icons/icon-192x192.png', badge: '/icons/icon-72x72.png', renotify: true,
    data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } } },
  },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return json({ error: 'VAPID keys not configured' }, 500);
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  let sent = 0;
  let failed = 0;

  async function sendTo(userId: string, data: string): Promise<void> {
    const { data: subs } = await admin.from('push_subscriptions').select('id, subscription').eq('user_id', userId);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(s.subscription, data, { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id); // expired device
      }
    }
  }

  // ---- test notification for the signed-in caller
  if (body?.test) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: 'sign in required' }, 401);
    await sendTo(u.user.id, payload('GrowthCare', 'Probno obaveštenje — push radi na ovom uređaju. 🎉', '/app/settings', 'test'));
    return json({ sent, failed });
  }

  // ---- scheduled run
  const now = new Date();
  const to = local(now);
  const from = local(new Date(now.getTime() - WINDOW_MIN * 60_000));
  const { data: reminders, error } = await admin.from('reminders')
    .select('id, child_id, type, title, scheduled_for, recurrence_rule, related_entity_type, related_entity_id').eq('enabled', true);
  if (error) return json({ error: 'query failed' }, 500);

  let due = 0;
  for (const r of (reminders ?? []) as Reminder[]) {
    const start = local(new Date(r.scheduled_for));
    const jobs: { kind: 'main' | 'missed'; date: string }[] = [];
    for (const d of datesInWindow(start.minutes, from, to)) if (occursOn(r, start, d)) jobs.push({ kind: 'main', date: d });
    if (r.type === 'dose') {
      // "Not recorded yet" follow-up, DEFAULT_MISSED_AFTER minutes after the dose time (same local day).
      const m = start.minutes + DEFAULT_MISSED_AFTER;
      if (m < 1440) for (const d of datesInWindow(m, from, to)) if (occursOn(r, start, d)) jobs.push({ kind: 'missed', date: d });
    }
    if (!jobs.length) continue;

    const { data: child } = await admin.from('children').select('first_name, family_id').eq('id', r.child_id).single();
    if (!child) continue;

    for (const job of jobs) {
      // Dose reminders: skip if the dose for that local day is already recorded (given or skipped).
      if (r.type === 'dose' && r.related_entity_id) {
        const dayStart = new Date(Date.parse(`${job.date}T00:00:00Z`) - 36 * 3600_000).toISOString();
        const dayEnd = new Date(Date.parse(`${job.date}T00:00:00Z`) + 36 * 3600_000).toISOString();
        const { data: inj } = await admin.from('injections').select('scheduled_for, status').eq('medication_id', r.related_entity_id)
          .gte('scheduled_for', dayStart).lte('scheduled_for', dayEnd);
        if ((inj ?? []).some((i) => local(new Date(i.scheduled_for)).date === job.date && i.status !== 'pending')) continue;
      }
      const key = `${r.id}|${job.date}|${job.kind}`;
      const { error: dup } = await admin.from('push_log').insert({ key });
      if (dup) continue; // already sent
      due++;

      const prefType = job.kind === 'missed' ? 'missed_dose' : r.type;
      const { data: members } = await admin.from('family_members').select('user_id').eq('family_id', child.family_id).eq('status', 'active');
      for (const m of members ?? []) {
        const { data: prefs } = await admin.from('notification_preferences').select('*').eq('user_id', m.user_id).maybeSingle();
        if (prefs && prefs[TYPE_PREF[prefType]] === false) continue;
        if (prefs && r.type !== 'dose' && inQuiet(to.minutes, prefs.quiet_hours_start, prefs.quiet_hours_end)) continue;
        const title = job.kind === 'missed'
          ? `Doza još nije zabeležena — ${child.first_name}`
          : r.type === 'dose' ? `Vreme je za dozu — ${child.first_name}` : `${r.title} — ${child.first_name}`;
        const text = job.kind === 'missed' ? 'Otvorite GrowthCare i zabeležite da li je doza data.' : r.type === 'dose' ? r.title : 'Podsetnik iz GrowthCare';
        await sendTo(m.user_id, payload(title, text, r.type === 'appointment' && r.related_entity_id ? `/app/doctors/${r.related_entity_id}` : '/app/dashboard', key));
      }
      await admin.from('push_log').update({ sent_count: sent }).eq('key', key);
    }
  }
  // Keep the log small.
  await admin.from('push_log').delete().lt('created_at', new Date(now.getTime() - 14 * 86_400_000).toISOString());
  return json({ due, sent, failed, window: [from, to] });
});
