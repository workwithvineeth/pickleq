-- Applied on the server as club_mode_21_posters_staff_read.
-- Uploading a logo or poster failed on the real server with "new row violates row-level security policy": the storage
-- API inserts with RETURNING, which needs a SELECT policy, and the posters bucket had none (reads go through the public
-- URL). Club staff may now select the objects they're allowed to upload: their club's logo and posters. Nobody else
-- gains anything (the bucket is public for reading files by URL; listing stays closed to everyone else).
create policy "club staff read their logos and posters" on storage.objects for select to authenticated
  using (bucket_id = 'posters' and (public.can_post_logo(name) or public.can_post_poster(name)));
