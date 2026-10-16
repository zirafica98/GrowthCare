-- Supabase installs pgcrypto in the "extensions" schema; create_invitation()
-- needs gen_random_bytes() from there.
alter function public.create_invitation(uuid, text) set search_path = public, extensions;
