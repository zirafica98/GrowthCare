-- GrowthCare — authorisation (RLS), integrity triggers, audit trail, RPCs.
-- Principle: a user can reach a row only through an ACTIVE membership of the
-- row's family. Ids supplied by the client never grant access by themselves.

-- ---------------------------------------------------------------- membership helpers
-- SECURITY DEFINER so policies on family_members do not recurse.
create or replace function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members
    where family_id = fid and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_family_owner(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members
    where family_id = fid and user_id = auth.uid() and status = 'active' and role = 'owner'
  );
$$;

create or replace function public.child_family(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from children where id = cid;
$$;

create or replace function public.is_child_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_family_member(public.child_family(cid));
$$;

-- Storage paths are "{family_id}/{child_id}/{document_id}/{filename}".
create or replace function public.can_access_document_path(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(path, '/');
  fid uuid;
  cid uuid;
begin
  if array_length(parts, 1) < 4 then return false; end if;
  begin
    fid := parts[1]::uuid;
    cid := parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.is_family_member(fid) and public.child_family(cid) = fid;
end $$;

grant execute on function public.is_family_member(uuid), public.is_family_owner(uuid), public.child_family(uuid),
  public.is_child_member(uuid), public.can_access_document_path(text) to authenticated;

-- ---------------------------------------------------------------- integrity triggers
-- Denormalised child_id must always match the parent row (prevents cross-child / cross-family linking).
create or replace function public.check_child_consistency() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_child uuid;
begin
  case tg_table_name
    when 'therapy_changes', 'injections', 'medication_stock' then
      select child_id into parent_child from medications where id = new.medication_id;
    when 'lab_results' then
      select child_id into parent_child from lab_tests where id = new.lab_test_id;
    when 'document_extractions' then
      select child_id into parent_child from documents where id = new.document_id;
    else
      parent_child := new.child_id;
  end case;
  if parent_child is distinct from new.child_id then
    raise exception 'child_id does not match parent row' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['therapy_changes', 'injections', 'medication_stock', 'lab_results', 'document_extractions'] loop
    execute format('create trigger check_child_consistency before insert or update on public.%I for each row execute function public.check_child_consistency()', t);
  end loop;
end $$;

create or replace function public.check_document_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.child_family(new.child_id) is distinct from new.family_id then
    raise exception 'document family mismatch' using errcode = '42501';
  end if;
  if new.storage_path not like new.family_id::text || '/' || new.child_id::text || '/' || new.id::text || '/%' then
    raise exception 'invalid storage path' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger check_document_family before insert or update on public.documents
  for each row execute function public.check_document_family();

create or replace function public.check_visit_doctor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.doctor_id is not null and (select family_id from doctors where id = new.doctor_id) is distinct from public.child_family(new.child_id) then
    raise exception 'doctor belongs to another family' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger check_visit_doctor before insert or update on public.doctor_visits
  for each row execute function public.check_visit_doctor();

-- A child (and its rows) can never be moved to another family.
create or replace function public.prevent_family_move() returns trigger
language plpgsql as $$
begin
  if new.family_id is distinct from old.family_id then
    raise exception 'family_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger prevent_family_move before update on public.children for each row execute function public.prevent_family_move();
create trigger prevent_family_move before update on public.documents for each row execute function public.prevent_family_move();

-- ---------------------------------------------------------------- audit trail
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  fid uuid;
  cid uuid;
begin
  if tg_table_name in ('family_members', 'family_invitations', 'documents') then
    fid := (rec ->> 'family_id')::uuid;
  elsif tg_table_name = 'children' then
    fid := (rec ->> 'family_id')::uuid;
    cid := (rec ->> 'id')::uuid;
  else
    cid := (rec ->> 'child_id')::uuid;
    fid := public.child_family(cid);
  end if;
  if cid is null and rec ? 'child_id' then cid := (rec ->> 'child_id')::uuid; end if;
  -- Parent family already deleted (cascade) → nothing to log.
  if fid is null or not exists (select 1 from families where id = fid) then return coalesce(new, old); end if;

  insert into audit_logs (family_id, child_id, user_id, entity_type, entity_id, action, old_data, new_data)
  values (
    fid, cid, auth.uid(), tg_table_name, (rec ->> 'id')::uuid, lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['injections', 'medications', 'therapy_changes', 'medication_stock', 'growth_measurements', 'documents',
    'document_extractions', 'family_members', 'family_invitations', 'children', 'doctor_visits', 'lab_tests', 'lab_results'] loop
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Deleting a family removes its audit trail as well (data deletion request).
create or replace function public.purge_family_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from audit_logs where family_id = old.id;
  return old;
end $$;
create trigger purge_family_audit after delete on public.families for each row execute function public.purge_family_audit();

-- ---------------------------------------------------------------- new user → profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;
alter table public.children enable row level security;
alter table public.medications enable row level security;
alter table public.therapy_changes enable row level security;
alter table public.medication_stock enable row level security;
alter table public.injections enable row level security;
alter table public.growth_measurements enable row level security;
alter table public.doctors enable row level security;
alter table public.doctor_visits enable row level security;
alter table public.documents enable row level security;
alter table public.document_extractions enable row level security;
alter table public.lab_tests enable row level security;
alter table public.lab_results enable row level security;
alter table public.reminders enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_logs enable row level security;

-- Nothing is reachable without a session.
revoke all on all tables in schema public from anon;

-- profiles: self, and co-members of my families (names only matter).
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from family_members m where m.user_id = profiles.id and m.status = 'active' and public.is_family_member(m.family_id)
  )
);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- families: via membership; created only through create_family().
create policy families_select on public.families for select to authenticated using (public.is_family_member(id));
create policy families_update on public.families for update to authenticated using (public.is_family_member(id)) with check (public.is_family_member(id));
create policy families_delete on public.families for delete to authenticated using (public.is_family_owner(id));

-- family_members: members see the family's members; own row always visible.
create policy members_select on public.family_members for select to authenticated using (user_id = auth.uid() or public.is_family_member(family_id));
create policy members_owner_update on public.family_members for update to authenticated using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));
create policy members_self_leave on public.family_members for update to authenticated
  using (user_id = auth.uid() and status = 'active') with check (user_id = auth.uid() and status = 'revoked');
revoke update on public.family_members from authenticated;
grant update (status) on public.family_members to authenticated; -- role can never be changed by a client

-- invitations: created/accepted through RPCs; members can list and revoke.
create policy invitations_select on public.family_invitations for select to authenticated using (public.is_family_member(family_id));
create policy invitations_update on public.family_invitations for update to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
revoke update on public.family_invitations from authenticated;
grant update (status) on public.family_invitations to authenticated;

-- family-scoped tables
create policy children_all on public.children for all to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy doctors_all on public.doctors for all to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy documents_all on public.documents for all to authenticated using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy audit_select on public.audit_logs for select to authenticated using (public.is_family_member(family_id));
revoke insert, update, delete on public.audit_logs from authenticated;

-- child-scoped tables
do $$
declare t text;
begin
  foreach t in array array['medications', 'therapy_changes', 'medication_stock', 'injections', 'growth_measurements',
    'doctor_visits', 'document_extractions', 'lab_tests', 'lab_results', 'reminders'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_child_member(child_id)) with check (public.is_child_member(child_id))', t || '_all', t);
  end loop;
end $$;

-- user-scoped tables
create policy prefs_all on public.notification_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_all on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- RPCs
create or replace function public.create_family(p_name text) returns public.families
language plpgsql security definer set search_path = public as $$
declare f families;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required' using errcode = '22023'; end if;
  insert into families (name, created_by) values (trim(p_name), auth.uid()) returning * into f;
  insert into family_members (family_id, user_id, role, display_name)
  values (f.id, auth.uid(), 'owner', (select full_name from profiles where id = auth.uid()));
  return f;
end $$;

create or replace function public.create_invitation(p_family_id uuid, p_email text) returns public.family_invitations
language plpgsql security definer set search_path = public as $$
declare inv family_invitations;
begin
  if not public.is_family_member(p_family_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  -- Revoke older pending invitations for the same address.
  update family_invitations set status = 'revoked' where family_id = p_family_id and lower(email) = lower(trim(p_email)) and status = 'pending';
  insert into family_invitations (family_id, email, token, expires_at, created_by)
  values (p_family_id, lower(trim(p_email)), encode(gen_random_bytes(24), 'hex'), now() + interval '7 days', auth.uid())
  returning * into inv;
  return inv;
end $$;

-- Minimal public info for the acceptance screen (needs the secret token).
create or replace function public.get_invitation(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'family_name', f.name,
    'invited_by', coalesce(p.full_name, ''),
    'email', i.email,
    'status', case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status end,
    'expires_at', i.expires_at)
  from family_invitations i
  join families f on f.id = i.family_id
  left join profiles p on p.id = i.created_by
  where i.token = p_token and auth.uid() is not null;
$$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv family_invitations;
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  select * into inv from family_invitations where token = p_token for update;
  if inv.id is null or inv.status <> 'pending' or inv.expires_at < now() then
    raise exception 'invitation not valid' using errcode = 'P0002';
  end if;
  if inv.email <> my_email then
    raise exception 'invitation was sent to another address' using errcode = '42501';
  end if;
  insert into family_members (family_id, user_id, role, display_name)
  values (inv.family_id, auth.uid(), inv.role, (select full_name from profiles where id = auth.uid()))
  on conflict (family_id, user_id) do update set status = 'active';
  update family_invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  return inv.family_id;
end $$;

create or replace function public.save_push_subscription(p_subscription jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into push_subscriptions (user_id, endpoint, subscription)
  values (auth.uid(), p_subscription ->> 'endpoint', p_subscription)
  on conflict (endpoint) do update set user_id = excluded.user_id, subscription = excluded.subscription;
end $$;

revoke execute on function public.create_family(text), public.create_invitation(uuid, text), public.get_invitation(text),
  public.accept_invitation(text), public.save_push_subscription(jsonb) from public, anon;
grant execute on function public.create_family(text), public.create_invitation(uuid, text), public.get_invitation(text),
  public.accept_invitation(text), public.save_push_subscription(jsonb) to authenticated;
