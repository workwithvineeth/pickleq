-- Player Studio photo (Athlete Cover). Private: each signed-in player can upload, see, replace and remove only
-- their own photo at player-photos/<their user id>/cover.jpg. Nobody else (other players, clubs, visitors) can.
-- The app crops and shrinks it on the phone to a JPEG of at most 1080 px; the bucket refuses anything over 1 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

create policy "players upload their own photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and name = auth.uid()::text || '/cover.jpg');
create policy "players see their own photo" on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and name = auth.uid()::text || '/cover.jpg');
create policy "players replace their own photo" on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and name = auth.uid()::text || '/cover.jpg')
  with check (bucket_id = 'player-photos' and name = auth.uid()::text || '/cover.jpg');
create policy "players remove their own photo" on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and name = auth.uid()::text || '/cover.jpg');
