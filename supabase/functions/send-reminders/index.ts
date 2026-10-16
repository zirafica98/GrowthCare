// Supabase Edge Function: delivers due reminders as Web Push notifications.
// Schedule it every 5 minutes (Supabase Cron → HTTP request to this function
// with the header `x-cron-secret: $CRON_SECRET`).
//
// Secrets: SUPABASE_SERVICE_ROLE_KEY (server only), VAPID_PUBLIC_KEY,
//          VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), CRON_SECRET.
//
// Payloads are minimal ("Vreme je za dozu — Luka"); no lab values, documents
// or diagnoses are ever sent through push services.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const WINDOW_MIN = 5;
const TYPE_PREF: Record<string, string> = {
  dose: 'dose_enabled', missed_dose: 'missed_dose_enabled', appointment: 'appointment_enabled', laboratory: 'laboratory_enabled',
  measurement: 'measurement_enabled', stock: 'stock_enabled', custom: 'custom_enabled',
};

/** True if an occurrence of the reminder falls into (from, to]. */
function isDue(scheduledFor: string, rule: string | null, from: Date, to: Date): boolean {
  const start = new Date(scheduledFor);
  if (!rule) return start > from && start <= to;
  const parts: Record<string, string> = Object.fromEntries(rule.split(';').map((p) => p.split('=')));
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1));
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  // Candidate occurrences: start's time-of-day on the days of `from` and `to` (window may cross midnight).
  for (const day of [from, to]) {
    const c = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), start.getUTCHours(), start.getUTCMinutes()));
    if (c <= from || c > to || c < start) continue;
    const daysSince = Math.round((c.getTime() - start.getTime()) / 86_400_000);
    if (parts.FREQ === 'DAILY' && daysSince % interval === 0) return true;
    if (parts.FREQ === 'WEEKLY') {
      const byDay = parts.BYDAY ? parts.BYDAY.split(',') : [codes[start.getUTCDay()]];
      if (byDay.includes(codes[c.getUTCDay()]) && Math.floor(daysSince / 7) % interval === 0) return true;
    }
    if (parts.FREQ === 'MONTHLY' && c.getUTCDate() === start.getUTCDate()) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_MIN * 60_000);
  const { data: reminders } = await admin.from('reminders').select('id, child_id, type, title, scheduled_for, recurrence_rule').eq('enabled', true);
  let sent = 0;

  for (const r of reminders ?? []) {
    if (!isDue(r.scheduled_for, r.recurrence_rule, from, to)) continue;
    const { data: child } = await admin.from('children').select('first_name, family_id').eq('id', r.child_id).single();
    if (!child) continue;
    const { data: members } = await admin.from('family_members').select('user_id').eq('family_id', child.family_id).eq('status', 'active');
    for (const m of members ?? []) {
      const { data: prefs } = await admin.from('notification_preferences').select('*').eq('user_id', m.user_id).maybeSingle();
      if (prefs && prefs[TYPE_PREF[r.type]] === false) continue;
      const { data: subs } = await admin.from('push_subscriptions').select('id, subscription').eq('user_id', m.user_id);
      const title = r.type === 'dose' ? `Vreme je za dozu — ${child.first_name}` : `${r.title} — ${child.first_name}`;
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(s.subscription, JSON.stringify({ notification: { title, icon: '/icons/icon-192x192.png', data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/app/dashboard' } } } } }));
          sent++;
        } catch (e) {
          if ((e as { statusCode?: number }).statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'content-type': 'application/json' } });
});
