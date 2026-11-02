-- GrowthCare — Web Push delivery log.
-- The send-reminders Edge Function runs every 5 minutes; each occurrence of a
-- reminder gets exactly one row here, so a notification is never sent twice
-- (even if the schedule overlaps or the function is triggered manually).

create table if not exists public.push_log (
  key text primary key,            -- '<reminder_id>|<local date>|<kind>'
  sent_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists push_log_created_idx on public.push_log (created_at);

-- Server-only table: RLS on, no policies → clients cannot read or write it.
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;
