-- GrowthCare — run the send-reminders Edge Function every 5 minutes.
-- Uses the PUBLIC anon key only to pass the function gateway; the function is
-- idempotent (push_log) and only sends reminders that are actually due.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('growthcare-send-reminders')
where exists (select 1 from cron.job where jobname = 'growthcare-send-reminders');

select cron.schedule(
  'growthcare-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://gdqgskrlmxczrjppfoko.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWdza3JsbXhjenJqcHBmb2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODMwNzQsImV4cCI6MjEwNzc1OTA3NH0.JoFvjaRQst_h5GXDxmuYkRGDt_7Fudn9K7hii5_mxKU'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
