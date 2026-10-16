-- GrowthCare — schema
-- All ids are UUIDs (client-generated where idempotency matters).
-- Child-owned rows carry child_id; consistency with parent rows is enforced by triggers (002).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- families
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'parent')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  display_name text,
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);
create index family_members_user_idx on public.family_members (user_id) where status = 'active';

create table public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  email text not null,
  role text not null default 'parent' check (role in ('parent')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index family_invitations_family_idx on public.family_invitations (family_id);

-- ---------------------------------------------------------------- children
create table public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 50),
  last_name text,
  date_of_birth date not null,
  sex text check (sex in ('male', 'female')),
  photo_url text,
  avatar_color text,
  birth_weight_g integer,
  birth_length_cm numeric(5,1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index children_family_idx on public.children (family_id);

-- ---------------------------------------------------------------- therapy
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  name text not null,
  substance text,
  strength text,
  unit text,
  active boolean not null default true,
  start_date date,
  end_date date,
  current_dose numeric(10,4) not null check (current_dose > 0),
  dose_unit text not null default 'mg',
  frequency text not null default 'daily' check (frequency ~ '^(daily|weekly:[1-7](,[1-7])*)$'),
  scheduled_time text not null check (scheduled_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  prescribing_doctor text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medications_child_idx on public.medications (child_id);

create table public.therapy_changes (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  previous_dose numeric(10,4),
  new_dose numeric(10,4) not null check (new_dose > 0),
  dose_unit text not null,
  changed_at date not null,
  source_type text not null default 'manual' check (source_type in ('doctor_visit', 'document', 'manual')),
  source_document_id uuid,
  doctor_visit_id uuid,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index therapy_changes_child_idx on public.therapy_changes (child_id, changed_at desc);

create table public.medication_stock (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  package_name text not null,
  strength text,
  total_amount numeric(10,4) not null check (total_amount > 0),
  quantity integer not null default 1 check (quantity >= 1),
  opened_at date,
  refill_date date,
  expires_at date,
  reminder_threshold_days integer not null default 7,
  note text,
  created_at timestamptz not null default now()
);
create index medication_stock_child_idx on public.medication_stock (child_id);

create table public.injections (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  scheduled_for timestamptz not null,
  administered_at timestamptz,
  dose numeric(10,4),
  dose_unit text not null,
  status text not null check (status in ('pending', 'given', 'skipped', 'missed')),
  administered_by uuid references auth.users (id) on delete set null,
  injection_site text,
  reaction text check (reaction in ('great', 'redness', 'other')),
  skip_reason text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One record per scheduled dose: two parents (or an offline replay) can never duplicate it.
  constraint injections_one_per_slot unique (medication_id, scheduled_for),
  constraint injections_skip_reason check (status <> 'skipped' or skip_reason is not null),
  constraint injections_given_dose check (status <> 'given' or (dose is not null and administered_at is not null))
);
create index injections_child_scheduled_idx on public.injections (child_id, scheduled_for desc);

-- ---------------------------------------------------------------- growth
create table public.growth_measurements (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  measured_at timestamptz not null,
  height_cm numeric(5,1) check (height_cm between 30 and 230),
  weight_kg numeric(5,2) check (weight_kg between 1 and 200),
  bmi numeric(4,1),
  head_circumference_cm numeric(4,1),
  source text not null default 'home' check (source in ('home', 'doctor', 'document', 'other')),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (height_cm is not null or weight_kg is not null or head_circumference_cm is not null)
);
create index growth_child_measured_idx on public.growth_measurements (child_id, measured_at);

-- ---------------------------------------------------------------- doctors & visits
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  specialty text,
  clinic text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);
create index doctors_family_idx on public.doctors (family_id);

create table public.doctor_visits (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  doctor_id uuid references public.doctors (id) on delete set null,
  scheduled_at timestamptz not null,
  completed_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  reason text,
  notes text,
  follow_up_date date,
  tasks jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index doctor_visits_child_scheduled_idx on public.doctor_visits (child_id, scheduled_at);

-- ---------------------------------------------------------------- documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  category text not null default 'other' check (category in ('doctor_report', 'laboratory', 'prescription', 'referral', 'imaging', 'therapy', 'other')),
  document_date date,
  title text not null,
  tags text[] not null default '{}',
  doctor_visit_id uuid references public.doctor_visits (id) on delete set null,
  medication_id uuid references public.medications (id) on delete set null,
  ocr_status text not null default 'none' check (ocr_status in ('none', 'pending', 'processing', 'review', 'completed', 'failed')),
  ocr_text text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_child_date_idx on public.documents (child_id, document_date desc);

create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  field_name text not null,
  extracted_value text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  verified boolean not null default false,
  verified_value text,
  created_at timestamptz not null default now()
);
create index document_extractions_doc_idx on public.document_extractions (document_id);

alter table public.therapy_changes
  add constraint therapy_changes_document_fk foreign key (source_document_id) references public.documents (id) on delete set null,
  add constraint therapy_changes_visit_fk foreign key (doctor_visit_id) references public.doctor_visits (id) on delete set null;

-- ---------------------------------------------------------------- laboratory
create table public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  collected_at timestamptz not null,
  laboratory text,
  document_id uuid references public.documents (id) on delete set null,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index lab_tests_child_collected_idx on public.lab_tests (child_id, collected_at desc);

create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  lab_test_id uuid not null references public.lab_tests (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  test_name text not null,
  result_value text not null,
  result_numeric numeric,
  unit text,
  reference_range text,
  flag text, -- copied as printed on the source; never computed
  clinician_note text,
  source_text text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index lab_results_test_idx on public.lab_results (lab_test_id);
create index lab_results_child_idx on public.lab_results (child_id);

-- ---------------------------------------------------------------- reminders & notifications
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  type text not null check (type in ('dose', 'missed_dose', 'appointment', 'laboratory', 'measurement', 'stock', 'custom')),
  title text not null,
  description text,
  scheduled_for timestamptz not null,
  recurrence_rule text,
  related_entity_type text,
  related_entity_id uuid,
  enabled boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index reminders_child_idx on public.reminders (child_id, scheduled_for);
create index reminders_related_idx on public.reminders (related_entity_type, related_entity_id);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  dose_enabled boolean not null default true,
  missed_dose_enabled boolean not null default true,
  missed_dose_after_minutes integer not null default 60,
  appointment_enabled boolean not null default true,
  laboratory_enabled boolean not null default true,
  measurement_enabled boolean not null default true,
  stock_enabled boolean not null default true,
  custom_enabled boolean not null default true,
  push_enabled boolean not null default false,
  quiet_hours_start text,
  quiet_hours_end text
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_id uuid,
  user_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_family_created_idx on public.audit_logs (family_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_id);

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles', 'families', 'children', 'medications', 'injections', 'doctor_visits', 'documents'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
