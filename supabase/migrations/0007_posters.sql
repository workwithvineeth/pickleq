-- Applied on the server as club_mode_11_posters.
-- Tournament posters: one image per tournament, shown on the events board, the event page, the club's tournament page,
-- the approval queue and link previews. Stored in a public bucket (anyone with the link can view, like the board itself).
-- Only a club's coaches and admins can upload, and only into their own club's folder: posters/<club id>/<tournament id>.jpg
-- The app shrinks images to at most 1080 px wide JPEG before uploading; the bucket refuses anything else over 2 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The folder name must be a club the uploader runs, and the file name a tournament of that club.
create or replace function public.can_post_poster(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tournaments t
    where (storage.foldername(object_name))[1] = t.club_id::text
      and storage.filename(object_name) ~ ('^' || t.id::text || '\.(jpg|png|webp)$')
      and public.is_staff(t.club_id))
$$;
revoke execute on function public.can_post_poster(text) from public, anon;
grant execute on function public.can_post_poster(text) to authenticated;

create policy "club staff upload posters" on storage.objects for insert to authenticated
  with check (bucket_id = 'posters' and public.can_post_poster(name));
create policy "club staff replace posters" on storage.objects for update to authenticated
  using (bucket_id = 'posters' and public.can_post_poster(name))
  with check (bucket_id = 'posters' and public.can_post_poster(name));

-- The poster's address on the tournament (with ?v=<time> so a replaced poster shows at once).
alter table public.tournaments
  add column poster_url text check (poster_url is null or (poster_url ~ '^https://[^\s<>"]+$' and char_length(poster_url) <= 400));

-- Board, event page and approval queue carry the poster.
create or replace function public.event_json(t public.tournaments, detail boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', t.public_slug, 'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'city', t.city, 'venue', t.venue,
    'club', c.name, 'listing', t.listing, 'status', t.status, 'entry_mode', t.entry_mode, 'poster_url', t.poster_url,
    'registration_open', t.registration_open and t.drawn_at is null and t.listing <> 'listed'
      and (t.entries_close is null or (now() at time zone 'Asia/Kolkata')::date <= t.entries_close),
    'entries_close', t.entries_close, 'results', t.is_public, 'drawn', t.drawn_at is not null,
    'contact', case when t.listing = 'listed' then t.contact end, 'link', case when t.listing = 'listed' then t.link end,
    'about', case when detail then t.about end, 'upi_id', case when detail then t.upi_id end,
    'divisions', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'max_dupr', d.max_dupr, 'gender', d.gender,
        'min_age', d.min_age, 'fee', d.fee, 'cap', d.cap,
        'taken', (select count(*) from public.registrations r where r.division_id = d.id and r.status in ('pending', 'accepted')))
      order by d.sort), '[]'::jsonb) from public.divisions d where d.tournament_id = t.id))
  from public.clubs c where c.id = t.club_id
$$;
revoke execute on function public.event_json(public.tournaments, boolean) from public, anon, authenticated;

-- Finished tournaments from the board in the last 30 days, for the board's "Recent results".
create or replace function public.recent_results(p_include_test boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(t, false) order by t.start_date desc), '[]'::jsonb)
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.listing <> 'none' and t.listing_status = 'approved' and t.status = 'done' and t.is_public
    and t.start_date >= (now() at time zone 'Asia/Kolkata')::date - 30 and (not c.is_test or p_include_test)
$$;
revoke execute on function public.recent_results(boolean) from public;
grant execute on function public.recent_results(boolean) to anon, authenticated;

create or replace function public.listing_queue() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_platform_admin() then null else coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'city', t.city, 'venue', t.venue, 'about', t.about,
    'contact', t.contact, 'link', t.link, 'listing', t.listing, 'listing_status', t.listing_status, 'reject_reason', t.reject_reason,
    'reviewed_at', t.reviewed_at, 'slug', t.public_slug, 'club', c.name, 'club_city', c.city, 'verified', c.verified, 'poster_url', t.poster_url,
    'posted_by', (select u.email from auth.users u where u.id = t.created_by),
    'divisions', (select coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'kind', d.kind, 'max_dupr', d.max_dupr, 'gender', d.gender, 'min_age', d.min_age, 'fee', d.fee) order by d.sort), '[]'::jsonb) from public.divisions d where d.tournament_id = t.id))
    order by (t.listing_status = 'pending') desc, t.start_date), '[]'::jsonb) end
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.listing <> 'none' and not c.is_test and (t.listing_status = 'pending' or t.reviewed_at > now() - interval '30 days')
$$;
revoke execute on function public.listing_queue() from public, anon;
grant execute on function public.listing_queue() to authenticated;
