-- club_mode_16_club_hosting_approval: a club can host tournaments only after PaddleQ approves it.
-- Anyone can sign up and create a club; it starts as a request ("pending"). Platform admins approve or reject it
-- (with a reason the organiser sees). Until then no tournament can be added for it, however it's tried.
-- Clubs that existed before this change are approved, so nothing running today stops.

alter table public.clubs
  add column hosting text not null default 'pending' check (hosting in ('pending', 'approved', 'rejected')),
  add column hosting_phone text check (char_length(hosting_phone) <= 20),
  add column hosting_note text check (char_length(hosting_note) <= 500),
  add column hosting_reason text check (char_length(hosting_reason) <= 300),
  add column hosting_requested_at timestamptz not null default now(),
  add column hosting_reviewed_at timestamptz;

update public.clubs set hosting = 'approved', hosting_reviewed_at = now() where hosting = 'pending';

-- Only PaddleQ changes the approval; organisers can't approve themselves, on insert or update.
create or replace function public.guard_club_flags() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.hosting := 'pending'; new.hosting_reason := null; new.hosting_reviewed_at := null; new.verified := false; new.is_test := false;
    elsif new.verified is distinct from old.verified or new.is_test is distinct from old.is_test
       or new.hosting is distinct from old.hosting or new.hosting_reason is distinct from old.hosting_reason
       or new.hosting_reviewed_at is distinct from old.hosting_reviewed_at then
      raise exception 'Only PaddleQ can approve or verify a club';
    end if;
  end if;
  return new;
end $$;
-- The existing clubs_guard_flags trigger (before update) now runs this; a second one covers inserts.
create trigger clubs_guard_flags_insert before insert on public.clubs for each row execute function public.guard_club_flags();

-- No tournament for a club PaddleQ hasn't approved (platform admins may, e.g. to set one up for a club).
-- Runs for every insert, including the ones made inside other server functions.
create function public.guard_club_hosting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.clubs where id = new.club_id and hosting <> 'approved') and not public.is_platform_admin() then
    raise exception 'PaddleQ hasn’t approved this club to host tournaments yet. Send the request from the club page; we’ll reply soon.';
  end if;
  return new;
end $$;
create trigger tournaments_guard_hosting before insert on public.tournaments for each row execute function public.guard_club_hosting();
revoke execute on function public.guard_club_hosting() from public, anon, authenticated;

-- The club's owner or admins send (or re-send after a rejection) the request, with a contact number and a note.
create function public.request_hosting(p_club uuid, p_phone text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.clubs;
begin
  if (select auth.uid()) is null then return jsonb_build_object('error', 'Sign in first'); end if;
  if not public.is_admin(p_club) then return jsonb_build_object('error', 'Only the club’s owner and admins can ask to host tournaments'); end if;
  select * into c from public.clubs where id = p_club;
  if c.hosting = 'approved' then return jsonb_build_object('error', 'This club can already host tournaments'); end if;
  if char_length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then return jsonb_build_object('error', 'Add a phone number PaddleQ can call (10 digits)'); end if;
  update public.clubs set hosting = 'pending', hosting_phone = left(trim(p_phone), 20), hosting_note = left(nullif(trim(coalesce(p_note, '')), ''), 500),
    hosting_reason = null, hosting_requested_at = now(), hosting_reviewed_at = null
  where id = p_club;
  return jsonb_build_object('ok', true);
end $$;

-- Platform admins approve, or reject with a reason the organiser sees.
create function public.admin_set_club_hosting(p_club uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can approve clubs'); end if;
  if not p_approve and char_length(trim(coalesce(p_reason, ''))) < 3 then return jsonb_build_object('error', 'Give the organiser a reason'); end if;
  update public.clubs set hosting = case when p_approve then 'approved' else 'rejected' end,
    hosting_reason = case when p_approve then null else left(trim(p_reason), 300) end, hosting_reviewed_at = now()
  where id = p_club;
  if not found then return jsonb_build_object('error', 'Club not found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- The admin dashboard's club list and club page, now with the hosting request. Requests waiting come first.
create or replace function public.admin_clubs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'city', c.city, 'verified', c.verified, 'is_test', c.is_test, 'created_at', c.created_at,
      'hosting', c.hosting, 'hosting_phone', c.hosting_phone, 'hosting_note', c.hosting_note, 'hosting_reason', c.hosting_reason,
      'hosting_requested_at', c.hosting_requested_at,
      'owners', (select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb) from public.club_members m join auth.users u on u.id = m.user_id
                 where m.club_id = c.id and m.role = 'owner'),
      'members', (select count(*) from public.club_members m where m.club_id = c.id),
      'tournaments', (select count(*) from public.tournaments t where t.club_id = c.id),
      'last_event', (select max(t.start_date) from public.tournaments t where t.club_id = c.id)
    ) order by c.is_test, (c.hosting = 'pending') desc, c.created_at desc), '[]'::jsonb) from public.clubs c);
end $$;

create or replace function public.admin_club(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.clubs;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  select * into c from public.clubs where id = p_club;
  if c.id is null then return jsonb_build_object('error', 'Club not found'); end if;
  return jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city, 'verified', c.verified, 'is_test', c.is_test, 'logo_url', c.logo_url,
    'hosting', c.hosting, 'hosting_phone', c.hosting_phone, 'hosting_note', c.hosting_note, 'hosting_reason', c.hosting_reason,
    'hosting_requested_at', c.hosting_requested_at,
    'people', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(nullif(h.name, ''), nullif(p.display_name, ''), split_part(u.email, '@', 1)),
                 'email', case when h.user_id is null then u.email end, 'role', m.role, 'helper', h.user_id is not null, 'joined_at', m.joined_at)
                 order by array_position(array['owner', 'admin', 'coach', 'player'], m.role), m.joined_at), '[]'::jsonb)
               from public.club_members m join auth.users u on u.id = m.user_id
               left join public.profiles p on p.id = m.user_id left join public.club_helpers h on h.user_id = m.user_id
               where m.club_id = c.id),
    'tournaments', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'start_date', t.start_date, 'status', t.status) order by t.start_date desc), '[]'::jsonb)
                    from public.tournaments t where t.club_id = c.id));
end $$;

revoke execute on function public.request_hosting(uuid, text, text), public.admin_set_club_hosting(uuid, boolean, text) from public, anon;
grant execute on function public.request_hosting(uuid, text, text), public.admin_set_club_hosting(uuid, boolean, text) to authenticated;
