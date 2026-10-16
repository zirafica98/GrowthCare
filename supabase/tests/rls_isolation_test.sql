-- GrowthCare — RLS / family-isolation test.
-- Runs entirely inside a transaction and ROLLS BACK: safe to run on any project
-- (SQL editor or `psql`). Fails loudly with "FAIL: …" on the first violation.
--
-- Actors: parent A (owner), parent B (invited), C (unrelated family).

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'rls.parent.a@test.invalid', '{"full_name":"Test A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'rls.parent.b@test.invalid', '{"full_name":"Test B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'rls.other.c@test.invalid', '{"full_name":"Test C"}', now(), now());

create function pg_temp.login(uid uuid, mail text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', mail, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
end $$;

set local role authenticated;

-- ---------------------------------------------------------------- A creates family, child, therapy, dose
select pg_temp.login('a0000000-0000-4000-8000-00000000000a', 'rls.parent.a@test.invalid');
do $$
declare fid uuid; cid uuid := gen_random_uuid(); mid uuid := gen_random_uuid(); tok text;
begin
  fid := (public.create_family('RLS Family A')).id;
  insert into public.children (id, family_id, first_name, date_of_birth) values (cid, fid, 'Child1', '2018-01-01');
  insert into public.medications (id, child_id, name, current_dose, dose_unit, scheduled_time) values (mid, cid, 'Somatropin', 0.8, 'mg', '21:30');
  insert into public.injections (child_id, medication_id, scheduled_for, administered_at, dose, dose_unit, status, administered_by)
    values (cid, mid, '2026-10-16 19:30+00', now(), 0.8, 'mg', 'given', auth.uid());
  tok := (public.create_invitation(fid, 'rls.parent.b@test.invalid')).token;
  perform set_config('test.fid', fid::text, false);
  perform set_config('test.cid', cid::text, false);
  perform set_config('test.mid', mid::text, false);
  perform set_config('test.tok', tok, false);
  if (select count(*) from public.children where id = cid) <> 1 then raise exception 'FAIL: owner cannot read own child'; end if;
  if (select count(*) from public.audit_logs where entity_id = cid) < 1 then raise exception 'FAIL: audit log missing for child insert'; end if;
end $$;

-- ---------------------------------------------------------------- C (unrelated) must see and change nothing
select pg_temp.login('c0000000-0000-4000-8000-00000000000c', 'rls.other.c@test.invalid');
do $$
declare fid uuid := current_setting('test.fid')::uuid; cid uuid := current_setting('test.cid')::uuid; mid uuid := current_setting('test.mid')::uuid; n int;
begin
  if (select count(*) from public.families where id = fid) <> 0 then raise exception 'FAIL: outsider sees family'; end if;
  if (select count(*) from public.children where id = cid) <> 0 then raise exception 'FAIL: outsider sees child'; end if;
  if (select count(*) from public.injections where child_id = cid) <> 0 then raise exception 'FAIL: outsider sees doses'; end if;
  if (select count(*) from public.audit_logs where family_id = fid) <> 0 then raise exception 'FAIL: outsider sees audit log'; end if;
  update public.injections set dose = 9 where child_id = cid; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: outsider updated a dose'; end if;
  delete from public.children where id = cid; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: outsider deleted a child'; end if;
  begin
    insert into public.children (family_id, first_name, date_of_birth) values (fid, 'Intruder', '2019-01-01');
    raise exception 'FAIL: outsider inserted child into foreign family';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.injections (child_id, medication_id, scheduled_for, dose_unit, status, skip_reason)
      values (cid, mid, '2026-10-17 19:30+00', 'mg', 'skipped', 'x');
    raise exception 'FAIL: outsider inserted dose for foreign child';
  exception when insufficient_privilege then null; end;
  begin
    perform public.accept_invitation(current_setting('test.tok'));
    raise exception 'FAIL: outsider accepted invitation for another e-mail';
  exception when insufficient_privilege then null; end;
  if public.can_access_document_path(fid || '/' || cid || '/' || gen_random_uuid() || '/x.pdf') then raise exception 'FAIL: outsider storage path access'; end if;
end $$;

-- ---------------------------------------------------------------- B accepts invitation, sees the same child, cannot duplicate the dose
select pg_temp.login('b0000000-0000-4000-8000-00000000000b', 'rls.parent.b@test.invalid');
do $$
declare cid uuid := current_setting('test.cid')::uuid; mid uuid := current_setting('test.mid')::uuid;
begin
  if (select count(*) from public.children where id = cid) <> 0 then raise exception 'FAIL: B sees child before accepting'; end if;
  perform public.accept_invitation(current_setting('test.tok'));
  if (select count(*) from public.children where id = cid) <> 1 then raise exception 'FAIL: B cannot see child after accepting'; end if;
  if (select count(*) from public.injections where child_id = cid) <> 1 then raise exception 'FAIL: B cannot see the recorded dose'; end if;
  begin
    insert into public.injections (child_id, medication_id, scheduled_for, administered_at, dose, dose_unit, status)
      values (cid, mid, '2026-10-16 19:30+00', now(), 0.8, 'mg', 'given');
    raise exception 'FAIL: duplicate dose for the same scheduled slot was accepted';
  exception when unique_violation then null; end;
  begin
    update public.family_members set role = 'owner' where user_id = auth.uid();
    raise exception 'FAIL: member could change own role';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- A revokes B → B loses access immediately
select pg_temp.login('a0000000-0000-4000-8000-00000000000a', 'rls.parent.a@test.invalid');
update public.family_members set status = 'revoked' where user_id = 'b0000000-0000-4000-8000-00000000000b';

select pg_temp.login('b0000000-0000-4000-8000-00000000000b', 'rls.parent.b@test.invalid');
do $$
declare n int;
begin
  if (select count(*) from public.children where id = current_setting('test.cid')::uuid) <> 0 then raise exception 'FAIL: revoked member still sees child'; end if;
  update public.family_members set status = 'active' where user_id = auth.uid(); get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: revoked member re-activated itself'; end if;
end $$;

select 'ALL RLS TESTS PASSED' as result;

rollback;
