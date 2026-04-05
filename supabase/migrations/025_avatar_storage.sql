-- Create public avatars bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Anyone can read avatars (public bucket)
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Authenticated users can upload into their own folder ({user_id}/*)
create policy "avatars_auth_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can overwrite their own avatar
create policy "avatars_auth_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own avatar
create policy "avatars_auth_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
