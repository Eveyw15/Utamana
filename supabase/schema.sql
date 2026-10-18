-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- One row per song. data holds title/artist/lines/trans and the audio revision per track.
-- Deleted songs keep a tombstone row (deleted = true, data = null) so other devices delete them too.
create table if not exists public.songs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb,
  updated bigint not null,
  deleted boolean not null default false
);

alter table public.songs enable row level security;

drop policy if exists "own songs" on public.songs;
create policy "own songs" on public.songs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Private bucket for audio, files stored as <user id>/<song id>/<track>.
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

drop policy if exists "own audio" on storage.objects;
create policy "own audio" on storage.objects
  for all to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
