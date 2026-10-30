-- club_mode_15_admin_dashboard: the Admin screen for PaddleQ platform admins.
-- Every function checks is_platform_admin() first and answers {"error": …} for anyone else. Only remove_platform_admin removes a row (never the last admin).
-- The robot's test club (is_test) is left out of the counts but listed, marked as a test.

-- ---------- Overview: the numbers that matter (North Star: matches scored per week) ----------
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  -- Weeks start on Monday, India time.
  wk date := date_trunc('week', (now() at time zone 'Asia/Kolkata'))::date;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return jsonb_build_object(
    'clubs', (select count(*) from public.clubs where not is_test),
    'verified_clubs', (select count(*) from public.clubs where not is_test and verified),
    'upcoming', (select count(*) from public.tournaments t join public.clubs c on c.id = t.club_id where not c.is_test and t.status <> 'done' and t.start_date > today),
    'live', (select count(*) from public.tournaments t join public.clubs c on c.id = t.club_id where not c.is_test and t.status = 'live' and t.start_date <= today),
    'finished', (select count(*) from public.tournaments t join public.clubs c on c.id = t.club_id where not c.is_test and t.status = 'done'),
    'to_review', (select count(*) from public.tournaments where listing <> 'none' and listing_status = 'pending'),
    'entries_week', (select count(*) from public.registrations r join public.clubs c on c.id = r.club_id
                     where not c.is_test and r.created_at >= (wk::timestamp at time zone 'Asia/Kolkata')),
    'matches_week', (select count(*) from public.club_matches m join public.clubs c on c.id = m.club_id
                     where not c.is_test and m.status = 'done' and m.updated_at >= (wk::timestamp at time zone 'Asia/Kolkata')),
    'accounts', (select count(*) from auth.users where email not like 'pq-helper-%@example.com'),
    'accounts_week', (select count(*) from auth.users where email not like 'pq-helper-%@example.com' and created_at >= (wk::timestamp at time zone 'Asia/Kolkata')),
    -- Matches scored in each of the last 8 weeks, oldest first.
    'weeks', (select jsonb_agg(jsonb_build_object('week', w::date, 'matches',
                (select count(*) from public.club_matches m join public.clubs c on c.id = m.club_id
                 where not c.is_test and m.status = 'done'
                   and m.updated_at >= (w::timestamp at time zone 'Asia/Kolkata') and m.updated_at < ((w + interval '7 days')::timestamp at time zone 'Asia/Kolkata'))) order by w)
              from generate_series(wk - 49, wk, interval '7 days') as w)
  );
end $$;

-- ---------- Clubs ----------
create function public.admin_clubs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'city', c.city, 'verified', c.verified, 'is_test', c.is_test, 'created_at', c.created_at,
      'owners', (select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb) from public.club_members m join auth.users u on u.id = m.user_id
                 where m.club_id = c.id and m.role = 'owner'),
      'members', (select count(*) from public.club_members m where m.club_id = c.id),
      'tournaments', (select count(*) from public.tournaments t where t.club_id = c.id),
      'last_event', (select max(t.start_date) from public.tournaments t where t.club_id = c.id)
    ) order by c.is_test, c.created_at desc), '[]'::jsonb) from public.clubs c);
end $$;

-- One club, read-only: its people (with roles) and its tournaments.
create function public.admin_club(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.clubs;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  select * into c from public.clubs where id = p_club;
  if c.id is null then return jsonb_build_object('error', 'Club not found'); end if;
  return jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city, 'verified', c.verified, 'is_test', c.is_test, 'logo_url', c.logo_url,
    'people', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(nullif(h.name, ''), nullif(p.display_name, ''), split_part(u.email, '@', 1)),
                 'email', case when h.user_id is null then u.email end, 'role', m.role, 'helper', h.user_id is not null, 'joined_at', m.joined_at)
                 order by array_position(array['owner', 'admin', 'coach', 'player'], m.role), m.joined_at), '[]'::jsonb)
               from public.club_members m join auth.users u on u.id = m.user_id
               left join public.profiles p on p.id = m.user_id left join public.club_helpers h on h.user_id = m.user_id
               where m.club_id = c.id),
    'tournaments', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'start_date', t.start_date, 'status', t.status) order by t.start_date desc), '[]'::jsonb)
                    from public.tournaments t where t.club_id = c.id));
end $$;

create function public.admin_set_club_verified(p_club uuid, p_verified boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can verify clubs'); end if;
  update public.clubs set verified = p_verified where id = p_club;
  if not found then return jsonb_build_object('error', 'Club not found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Tournaments across every club ----------
create function public.admin_tournaments() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return (select coalesce(jsonb_agg(x.j order by x.d desc), '[]'::jsonb) from (
    select t.start_date as d, jsonb_build_object(
      'id', t.id, 'name', t.name, 'club', c.name, 'club_id', c.id, 'is_test', c.is_test, 'start_date', t.start_date, 'start_time', t.start_time,
      'status', t.status, 'listing', t.listing, 'listing_status', t.listing_status, 'entry_mode', t.entry_mode, 'slug', t.public_slug, 'results', t.is_public,
      'registrations', (select count(*) from public.registrations r where r.tournament_id = t.id and r.status in ('pending', 'accepted', 'waitlist')),
      'matches', (select count(*) from public.club_matches m where m.tournament_id = t.id and m.status <> 'void'),
      'matches_done', (select count(*) from public.club_matches m where m.tournament_id = t.id and m.status = 'done'),
      'event_pin', (select p.pin from public.tournament_pins p where p.tournament_id = t.id),
      'helpers', (select coalesce(jsonb_agg(jsonb_build_object('name', h.name, 'added_at', h.created_at) order by h.created_at desc), '[]'::jsonb)
                  from public.club_helpers h where h.tournament_id = t.id)
    ) as j
    from public.tournaments t join public.clubs c on c.id = t.club_id
    order by t.start_date desc limit 300) x);
end $$;

-- Reopen a finished tournament (or mark one finished) for support. The helpers trigger moves desk helpers with it.
create function public.admin_set_tournament_status(p_tournament uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can change this'); end if;
  if p_status not in ('live', 'done') then return jsonb_build_object('error', 'Choose live or finished'); end if;
  update public.tournaments set status = p_status where id = p_tournament;
  if not found then return jsonb_build_object('error', 'Tournament not found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Admins: remove one, but never the last ----------
create function public.remove_platform_admin(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can remove admins'); end if;
  select a.user_id into uid from public.platform_admins a join auth.users u on u.id = a.user_id where lower(u.email) = lower(trim(p_email));
  if uid is null then return jsonb_build_object('error', 'That email isn’t an admin'); end if;
  -- Lock the table so two admins removing each other at once can't leave nobody.
  lock table public.platform_admins in share row exclusive mode;
  if (select count(*) from public.platform_admins) <= 1 then return jsonb_build_object('error', 'You can’t remove the last admin'); end if;
  delete from public.platform_admins where user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Permissions: signed-in callers only (the functions refuse non-admins themselves) ----------
revoke execute on function public.admin_overview(), public.admin_clubs(), public.admin_club(uuid), public.admin_set_club_verified(uuid, boolean),
  public.admin_tournaments(), public.admin_set_tournament_status(uuid, text), public.remove_platform_admin(text) from public, anon;
grant execute on function public.admin_overview(), public.admin_clubs(), public.admin_club(uuid), public.admin_set_club_verified(uuid, boolean),
  public.admin_tournaments(), public.admin_set_tournament_status(uuid, text), public.remove_platform_admin(text) to authenticated;
