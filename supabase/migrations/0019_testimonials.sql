-- club_mode_23_testimonials: clubs share their experience of PaddleQ (brief of 2 Nov 2026).
-- A club's owner or admins add a testimonial (1-5 rating, quote up to 400 characters, name and role, optional photo,
-- and permission for PaddleQ to use it). The club sees only its own, with the status. PaddleQ admins see every club's
-- and approve, hide or feature them. No phone numbers or emails. A club can withdraw its testimonial at any time.

create table public.club_testimonials (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  rating int not null check (rating between 1 and 5),
  quote text not null check (char_length(quote) <= 400),
  person_name text not null check (char_length(person_name) <= 80),
  person_role text not null check (char_length(person_role) <= 80),
  photo_path text check (char_length(photo_path) <= 200),
  consent boolean not null check (consent),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden', 'withdrawn')),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  check (status = 'withdrawn' or (char_length(trim(quote)) >= 10 and char_length(trim(person_name)) >= 2 and char_length(trim(person_role)) >= 2)),
  check (not featured or status = 'approved')
);
create index club_testimonials_club_idx on public.club_testimonials (club_id);
create index club_testimonials_created_by_idx on public.club_testimonials (created_by);

alter table public.club_testimonials enable row level security;
-- Read: the club's owner and admins (their own club only) and PaddleQ admins. All writes go through the functions below.
create policy "club admins and paddleq see testimonials" on public.club_testimonials for select to authenticated
  using (public.is_admin(club_id) or public.is_platform_admin());

-- Text that looks like an email address or a phone number (7+ digits) isn't allowed.
create function public.has_contact_details(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or regexp_replace(coalesce(p, ''), '[\s().+-]', '', 'g') ~ '\d{7,}'
$$;

create function public.submit_testimonial(p_club uuid, p_rating int, p_quote text, p_name text, p_role text, p_photo text, p_consent boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if (select auth.uid()) is null then return jsonb_build_object('error', 'Sign in first'); end if;
  if not public.is_admin(p_club) then return jsonb_build_object('error', 'Only the club''s owner and admins can share a testimonial'); end if;
  if p_consent is not true then return jsonb_build_object('error', 'Tick the box to let PaddleQ use it'); end if;
  if p_rating is null or p_rating not between 1 and 5 then return jsonb_build_object('error', 'Pick a rating from 1 to 5'); end if;
  if char_length(trim(coalesce(p_quote, ''))) < 10 then return jsonb_build_object('error', 'Write a few words (at least 10 characters)'); end if;
  if char_length(trim(p_quote)) > 400 then return jsonb_build_object('error', 'Keep it to 400 characters'); end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 or char_length(trim(coalesce(p_role, ''))) < 2 then return jsonb_build_object('error', 'Add your name and role'); end if;
  if public.has_contact_details(p_quote) or public.has_contact_details(p_name) or public.has_contact_details(p_role) then
    return jsonb_build_object('error', 'Please leave out phone numbers and email addresses');
  end if;
  if p_photo is not null and p_photo not like p_club::text || '/%' then return jsonb_build_object('error', 'That photo isn''t this club''s'); end if;
  if (select count(*) from public.club_testimonials where club_id = p_club and status = 'pending') >= 5 then
    return jsonb_build_object('error', 'You already have 5 waiting for PaddleQ. Withdraw one first.');
  end if;
  insert into public.club_testimonials (club_id, created_by, rating, quote, person_name, person_role, photo_path, consent)
    values (p_club, (select auth.uid()), p_rating, trim(p_quote), left(trim(p_name), 80), left(trim(p_role), 80), p_photo, true)
    returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

-- The club withdraws: the words and photo are cleared and it's never shown again. Returns the photo path to delete.
create function public.withdraw_testimonial(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.club_testimonials;
begin
  select * into r from public.club_testimonials where id = p_id;
  if r.id is null or not public.is_admin(r.club_id) then return jsonb_build_object('error', 'Testimonial not found'); end if;
  update public.club_testimonials set status = 'withdrawn', featured = false, quote = '', photo_path = null, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'photo', r.photo_path);
end $$;

-- PaddleQ admins: every club's testimonials, newest first, waiting ones on top. No phone numbers or emails.
create function public.admin_testimonials() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'club_id', t.club_id, 'club', c.name, 'club_city', c.city,
      'rating', t.rating, 'quote', t.quote, 'person_name', t.person_name, 'person_role', t.person_role, 'photo_path', t.photo_path,
      'status', t.status, 'featured', t.featured, 'created_at', t.created_at)
    order by (t.status = 'pending') desc, t.featured desc, t.created_at desc), '[]'::jsonb)
    from public.club_testimonials t join public.clubs c on c.id = t.club_id where t.status <> 'withdrawn' and not c.is_test);
end $$;

-- Approve, hide, or (for approved ones) feature.
create function public.admin_set_testimonial(p_id uuid, p_status text, p_featured boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.club_testimonials;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can do this'); end if;
  select * into r from public.club_testimonials where id = p_id;
  if r.id is null or r.status = 'withdrawn' then return jsonb_build_object('error', 'Testimonial not found (the club may have withdrawn it)'); end if;
  if p_status not in ('approved', 'hidden') then return jsonb_build_object('error', 'Unknown status'); end if;
  if p_featured and p_status <> 'approved' then return jsonb_build_object('error', 'Only an approved testimonial can be featured'); end if;
  update public.club_testimonials set status = p_status, featured = coalesce(p_featured, false), decided_at = now(), updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Photos: a private bucket. Club owner/admins add and remove their club's; PaddleQ admins can see all. ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('testimonials', 'testimonials', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Photos live at "<club id>/<file>".
create function public.testimonial_photo_club(object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy "club admins add testimonial photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'testimonials' and public.is_admin(public.testimonial_photo_club(name)));
create policy "club admins and paddleq see testimonial photos" on storage.objects for select to authenticated
  using (bucket_id = 'testimonials' and (public.is_admin(public.testimonial_photo_club(name)) or public.is_platform_admin()));
create policy "club admins remove testimonial photos" on storage.objects for delete to authenticated
  using (bucket_id = 'testimonials' and public.is_admin(public.testimonial_photo_club(name)));

revoke all on public.club_testimonials from anon;
revoke insert, update, delete on public.club_testimonials from authenticated;
revoke execute on function public.submit_testimonial(uuid, int, text, text, text, text, boolean), public.withdraw_testimonial(uuid),
  public.admin_testimonials(), public.admin_set_testimonial(uuid, text, boolean) from public, anon;
grant execute on function public.submit_testimonial(uuid, int, text, text, text, text, boolean), public.withdraw_testimonial(uuid),
  public.admin_testimonials(), public.admin_set_testimonial(uuid, text, boolean) to authenticated;
revoke execute on function public.has_contact_details(text) from public, anon, authenticated;
-- Storage policies run as the signed-in user, so they need this helper.
revoke execute on function public.testimonial_photo_club(text) from public, anon;
grant execute on function public.testimonial_photo_club(text) to authenticated;
