-- GrowthCare — private storage for medical documents.
-- No public URLs; access only through short-lived signed URLs, and only for
-- members of the family encoded in the first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-documents', 'medical-documents', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "medical documents: read own family" on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and public.can_access_document_path(name));

create policy "medical documents: upload own family" on storage.objects for insert to authenticated
  with check (bucket_id = 'medical-documents' and public.can_access_document_path(name));

create policy "medical documents: delete own family" on storage.objects for delete to authenticated
  using (bucket_id = 'medical-documents' and public.can_access_document_path(name));

-- No update policy: documents are immutable originals (replace = delete + upload).
