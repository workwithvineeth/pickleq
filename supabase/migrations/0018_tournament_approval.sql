-- club_mode_22_tournament_approval: "create freely, go live with approval" (brief of 2 Nov 2026).
-- Clubs create tournaments, events and entries without asking. Going live needs PaddleQ's approval of that tournament:
-- the draw (matches), referee and desk links, scoring, the public results link, the public registration form and the
-- events board. A trusted club's tournaments are approved automatically. Organisers can't approve their own.
-- Club-level hosting approval (club_mode_16) is retired: every club may create tournaments.

-- ---------- Columns ----------

alter table public.tournaments
  add column approval text not null default 'draft' check (approval in ('draft', 'submitted', 'approved', 'rejected')),
  add column approval_reason text check (char_length(approval_reason) <= 300),
  add column approval_expected int check (approval_expected between 0 and 2000),
  add column approval_requested_at timestamptz,
  add column approval_decided_at timestamptz;

alter table public.clubs add column trusted boolean not null default false;

-- ---------- Existing data ----------
-- The Pickle Club and the test clubs (robot sandbox, load test) are trusted; their tournaments are approved,
-- so TPC's finished tournament and its results link stay exactly as they are. Everyone else starts under the new rules.
update public.clubs set trusted = true where is_test or (name = 'The Pickle Club' and not is_test);
update public.tournaments t set approval = 'approved', approval_decided_at = now()
  from public.clubs c where c.id = t.club_id and c.trusted;
-- Board listings of tournaments that aren't approved wait for the approval.
update public.tournaments set listing_status = 'pending', reviewed_at = null
  where approval <> 'approved' and listing <> 'none' and listing_status = 'approved';

-- Retire club-level hosting approval: every club may create tournaments.
drop trigger if exists tournaments_guard_hosting on public.tournaments;
update public.clubs set hosting = 'approved', hosting_reviewed_at = coalesce(hosting_reviewed_at, now()) where hosting <> 'approved';
alter table public.clubs alter column hosting set default 'approved';

-- Club hosting approval is retired, but the club's contact number (asked for when a club is created) is still kept,
-- privately, for PaddleQ. The club stays approved.
create or replace function public.request_hosting(p_club uuid, p_phone text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return jsonb_build_object('error', 'Sign in first'); end if;
  if not public.is_admin(p_club) then return jsonb_build_object('error', 'Only the club’s owner and admins can add the club’s contact number'); end if;
  if char_length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then return jsonb_build_object('error', 'Add a phone number PaddleQ can call (10 digits)'); end if;
  insert into public.club_contacts (club_id, phone, note, updated_at)
    values (p_club, left(trim(p_phone), 20), left(nullif(trim(coalesce(p_note, '')), ''), 500), now())
    on conflict (club_id) do update set phone = excluded.phone, note = excluded.note, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Guards ----------

-- Only PaddleQ changes a club's flags (verified, test, hosting, trusted).
create or replace function public.guard_club_flags() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.hosting := 'approved'; new.hosting_reason := null; new.verified := false; new.is_test := false; new.trusted := false;
    elsif new.verified is distinct from old.verified or new.is_test is distinct from old.is_test
       or new.hosting is distinct from old.hosting or new.hosting_reason is distinct from old.hosting_reason
       or new.hosting_reviewed_at is distinct from old.hosting_reviewed_at or new.trusted is distinct from old.trusted then
      raise exception 'Only PaddleQ can approve, verify or trust a club';
    end if;
  end if;
  return new;
end $$;

-- True when the tournament may go live (approved by PaddleQ, or auto-approved for a trusted club).
create function public.tournament_approved(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select approval = 'approved' from public.tournaments where id = tid), false)
$$;

-- Tournaments: organisers can't change the approval; new tournaments of trusted clubs are approved straight away;
-- the draw can't be marked made, and the board listing can't be approved, before the tournament is approved.
-- A trusted (or test) club's tournaments are approved without asking.
create function public.club_auto_approves(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.trusted or c.is_test from public.clubs c where c.id = cid), false)
$$;

-- Not security definer, so current_user tells the app (authenticated/anon) from the server's own functions.
create function public.guard_tournament_approval() returns trigger
language plpgsql set search_path = '' as $$
declare trusted_club boolean := public.club_auto_approves(new.club_id);
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.approval := case when trusted_club then 'approved' else 'draft' end;
      new.approval_reason := null; new.approval_requested_at := null;
      new.approval_decided_at := case when trusted_club then now() end;
    elsif new.approval = 'draft' and trusted_club then
      new.approval := 'approved'; new.approval_decided_at := now();
    end if;
  elsif current_user in ('authenticated', 'anon') and (new.approval is distinct from old.approval
      or new.approval_reason is distinct from old.approval_reason or new.approval_requested_at is distinct from old.approval_requested_at
      or new.approval_decided_at is distinct from old.approval_decided_at or new.approval_expected is distinct from old.approval_expected) then
    raise exception 'Only PaddleQ can approve a tournament. Use Submit for approval.';
  end if;
  if new.approval <> 'approved' then
    if new.drawn_at is not null and (tg_op = 'INSERT' or old.drawn_at is null) then
      raise exception 'PaddleQ hasn’t approved this tournament yet, so the draw can’t be made. Submit it for approval first.';
    end if;
    if new.listing_status = 'approved' then new.listing_status := 'pending'; new.reviewed_at := null; end if;
  end if;
  return new;
end $$;
-- Named to run after tournaments_guard_listing (triggers run in name order).
create trigger tournaments_zz_guard_approval before insert or update on public.tournaments
  for each row execute function public.guard_tournament_approval();

-- Matches (the draw, knockouts, moves and every score) only for approved tournaments, however they are written:
-- the app, the desk, referee links and server functions all pass through here. Friendly matches (no tournament) are fine.
create function public.guard_match_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tournament_id is not null and not public.tournament_approved(new.tournament_id) then
    raise exception 'PaddleQ hasn’t approved this tournament yet. Submit it for approval first.';
  end if;
  return new;
end $$;
create trigger club_matches_guard_approval before insert or update on public.club_matches
  for each row execute function public.guard_match_approval();

-- Online entries (the public registration form, which collects UPI fees) only for approved tournaments.
-- The organiser's own entries (added by hand or imported) are fine before approval.
create function public.guard_registration_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'online' and not public.tournament_approved(new.tournament_id) then
    raise exception 'This tournament isn’t taking entries yet.';
  end if;
  return new;
end $$;
create trigger registrations_guard_approval before insert on public.registrations
  for each row execute function public.guard_registration_approval();

-- ---------- Referee and desk links refuse unapproved tournaments ----------

create or replace function public.scorer_check(p_token text, p_pin text)
returns table (link_id uuid, link_tournament uuid, link_court int, link_label text, err text)
language plpgsql security definer set search_path = '' as $$
declare
  l public.scorer_links;
  t_status text;
  t_approval text;
begin
  select * into l from public.scorer_links where token = p_token;
  if l.id is null or l.revoked then
    return query select null::uuid, null::uuid, null::int, null::text, 'This scorer link isn''t valid. Ask the organiser for a new one.'::text; return;
  end if;
  select status, approval into t_status, t_approval from public.tournaments where id = l.tournament_id;
  if t_status = 'done' then
    return query select null::uuid, null::uuid, null::int, null::text, 'This event has finished, so the scorer link no longer works.'::text; return;
  end if;
  if t_approval is distinct from 'approved' then
    return query select null::uuid, null::uuid, null::int, null::text, 'PaddleQ hasn''t approved this tournament yet, so referee links don''t work yet.'::text; return;
  end if;
  if l.locked_until is not null and l.locked_until > now() then
    return query select null::uuid, null::uuid, null::int, null::text, 'Too many wrong PINs. Try again in 15 minutes, or ask the organiser.'::text; return;
  end if;
  if p_pin is distinct from l.pin then
    update public.scorer_links set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 8 then now() + interval '15 minutes' else null end
      where id = l.id;
    return query select null::uuid, null::uuid, null::int, null::text, 'Wrong PIN'::text; return;
  end if;
  update public.scorer_links set failed_attempts = 0, locked_until = null, last_used_at = now() where id = l.id;
  return query select l.id, l.tournament_id, l.court, l.label, null::text;
end $$;

create or replace function public.desk_check(p_token text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.tournament_desks;
  t public.tournaments;
begin
  select * into d from public.tournament_desks where token = coalesce(p_token, '') for update;
  if d.tournament_id is null then return jsonb_build_object('error', 'This desk link isn''t valid. Ask the organiser for the desk link again.'); end if;
  select * into t from public.tournaments where id = d.tournament_id;
  if t.status = 'done' then return jsonb_build_object('error', 'This tournament is finished, so the desk link no longer works.'); end if;
  if t.approval <> 'approved' then return jsonb_build_object('error', 'PaddleQ hasn''t approved this tournament yet, so the desk link doesn''t work yet.'); end if;
  if d.locked_until is not null and d.locked_until > now() then
    return jsonb_build_object('error', 'Too many wrong PINs. Wait a few minutes, then try again.');
  end if;
  if d.pin <> coalesce(p_pin, '') then
    update public.tournament_desks set failed_attempts = failed_attempts + 1,
      locked_until = case when (failed_attempts + 1) % 5 = 0
        then now() + least(interval '30 minutes', interval '1 minute' * power(2, (failed_attempts + 1) / 5)) else locked_until end
      where tournament_id = d.tournament_id;
    return jsonb_build_object('error', 'Wrong desk PIN');
  end if;
  if d.failed_attempts <> 0 or d.locked_until is not null or d.last_used_at is null or d.last_used_at < now() - interval '1 minute' then
    update public.tournament_desks set failed_attempts = 0, locked_until = null, last_used_at = now() where tournament_id = d.tournament_id;
  end if;
  return jsonb_build_object('tournament_id', t.id, 'club_id', t.club_id, 'courts', t.courts);
end $$;

-- ---------- Public pages show approved tournaments only ----------

create or replace function public.public_tournament(slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when t.id is null then null else jsonb_build_object(
    'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'slot_minutes', t.slot_minutes, 'status', t.status, 'club', c.name,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'pools', d.pools, 'advance', d.advance, 'format', d.format) order by d.sort) from public.divisions d where d.tournament_id = t.id), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'division_id', e.division_id, 'seed', e.seed, 'pool', e.pool, 'status', e.status,
        'names', (select jsonb_agg(p.name order by array_position(e.player_ids, p.id)) from public.club_players p where p.id = any (e.player_ids))))
      from public.entries e join public.divisions d on d.id = e.division_id where d.tournament_id = t.id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'division_id', m.division_id, 'stage', m.stage, 'pool', m.pool, 'round', m.round,
        'bracket_pos', m.bracket_pos, 'slot', m.slot, 'court', m.court, 'entry_a', m.entry_a, 'entry_b', m.entry_b,
        'games', (select coalesce(jsonb_agg(jsonb_build_object('a', g -> 'a', 'b', g -> 'b')), '[]'::jsonb) from jsonb_array_elements(m.games) g),
        'status', m.status, 'winner', m.winner))
      from public.club_matches m where m.tournament_id = t.id and m.status <> 'void'), '[]'::jsonb))
  end
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.public_slug = slug and t.is_public and t.approval = 'approved'
$$;

create or replace function public.public_event(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.event_json(t, true) from public.tournaments t
  where t.public_slug = p_slug and t.listing_status <> 'rejected' and t.approval = 'approved'
    and ((t.listing <> 'none' and t.listing_status = 'approved') or t.entry_mode = 'registration')
$$;

create or replace function public.share_events() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(t, true) order by t.start_date), '[]'::jsonb)
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.start_date >= (now() at time zone 'Asia/Kolkata')::date - 7 and t.listing_status <> 'rejected' and not c.is_test
    and t.approval = 'approved'
    and ((t.listing <> 'none' and t.listing_status = 'approved') or t.entry_mode = 'registration')
$$;

-- The board listing goes on when the tournament is approved (the trigger above keeps it pending until then).
create or replace function public.submit_listing(p_tournament uuid, p_listing text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.is_staff(t.club_id) then return jsonb_build_object('error', 'Only the club''s organisers can list this tournament'); end if;
  if p_listing not in ('none', 'listed', 'run') then return jsonb_build_object('error', 'Unknown listing'); end if;
  if p_listing <> 'none' and (coalesce(t.city, '') = '' or coalesce(t.venue, '') = '') then
    return jsonb_build_object('error', 'Add the city and venue first');
  end if;
  if p_listing = 'listed' and coalesce(t.contact, '') = '' and coalesce(t.link, '') = '' then
    return jsonb_build_object('error', 'Add a contact number or a sign-up link first');
  end if;
  update public.tournaments set listing = p_listing,
    listing_status = case when p_listing = 'none' then 'none' when t.approval = 'approved' then 'approved' else 'pending' end,
    reject_reason = null, reviewed_at = case when p_listing <> 'none' and t.approval = 'approved' then now() else null end
  where id = p_tournament;
  return jsonb_build_object('ok', true, 'status', case when p_listing = 'none' then 'none' when t.approval = 'approved' then 'approved' else 'pending' end);
end $$;

-- ---------- Submit, approve, reject, trust ----------

-- The club's organisers send the tournament to PaddleQ (again, after a rejection). A trusted club's goes straight through.
create function public.submit_tournament(p_tournament uuid, p_expected int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
  trusted_club boolean;
begin
  if (select auth.uid()) is null then return jsonb_build_object('error', 'Sign in first'); end if;
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.is_staff(t.club_id) then return jsonb_build_object('error', 'Only the club''s organisers can submit this tournament'); end if;
  if t.approval = 'approved' then return jsonb_build_object('ok', true, 'status', 'approved'); end if;
  if t.status = 'done' then return jsonb_build_object('error', 'This tournament is finished'); end if;
  if not exists (select 1 from public.divisions d where d.tournament_id = t.id) then
    return jsonb_build_object('error', 'Add at least one event first');
  end if;
  if p_expected is not null and p_expected not between 0 and 2000 then return jsonb_build_object('error', 'Expected players should be between 0 and 2000'); end if;
  select c.trusted or c.is_test into trusted_club from public.clubs c where c.id = t.club_id;
  update public.tournaments set approval = case when trusted_club then 'approved' else 'submitted' end,
    approval_reason = null, approval_expected = coalesce(p_expected, approval_expected), approval_requested_at = now(),
    approval_decided_at = case when trusted_club then now() end,
    listing_status = case when trusted_club and listing <> 'none' then 'approved' else listing_status end
  where id = t.id;
  return jsonb_build_object('ok', true, 'status', case when trusted_club then 'approved' else 'submitted' end);
end $$;

-- PaddleQ admins approve, or reject with a reason the club sees. Never a tournament of a club they organise.
create function public.admin_decide_tournament(p_tournament uuid, p_approve boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can approve tournaments'); end if;
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null then return jsonb_build_object('error', 'Tournament not found'); end if;
  if public.is_staff(t.club_id) then return jsonb_build_object('error', 'You organise this club, so another PaddleQ admin must decide (or make the club trusted)'); end if;
  if t.approval = 'approved' then return jsonb_build_object('error', 'This tournament is already approved'); end if;
  if not p_approve and char_length(trim(coalesce(p_reason, ''))) < 3 then return jsonb_build_object('error', 'Give the club a reason'); end if;
  if p_approve then
    update public.tournaments set approval = 'approved', approval_reason = null, approval_decided_at = now(),
      listing_status = case when listing <> 'none' then 'approved' else listing_status end,
      reviewed_at = case when listing <> 'none' then now() else reviewed_at end
    where id = t.id;
  else
    update public.tournaments set approval = 'rejected', approval_reason = left(trim(p_reason), 300), approval_decided_at = now() where id = t.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Everything the admin needs to decide: name, date, venue, events and fees, UPI ID, expected players.
create function public.approval_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'city', t.city, 'venue', t.venue,
      'club', c.name, 'club_id', c.id, 'trusted', c.trusted, 'upi_id', t.upi_id, 'entry_mode', t.entry_mode, 'listing', t.listing,
      'approval', t.approval, 'reason', t.approval_reason, 'expected', t.approval_expected,
      'requested_at', t.approval_requested_at, 'decided_at', t.approval_decided_at, 'courts', t.courts,
      'mine', public.is_staff(c.id),
      'entries', (select count(*) from public.registrations r where r.tournament_id = t.id and r.status in ('pending', 'accepted')),
      'divisions', (select coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'kind', d.kind, 'fee', d.fee, 'cap', d.cap) order by d.sort), '[]'::jsonb)
                    from public.divisions d where d.tournament_id = t.id))
    order by (t.approval = 'submitted') desc, t.approval_requested_at desc nulls last), '[]'::jsonb)
    from public.tournaments t join public.clubs c on c.id = t.club_id
    where not c.is_test and (t.approval = 'submitted' or (t.approval_decided_at > now() - interval '30 days' and t.approval_requested_at is not null)));
end $$;

-- The trusted switch. Turning it on approves the club's unfinished tournaments; turning it off changes nothing already approved.
create function public.admin_set_club_trusted(p_club uuid, p_trusted boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can trust a club'); end if;
  update public.clubs set trusted = p_trusted where id = p_club;
  if not found then return jsonb_build_object('error', 'Club not found'); end if;
  if p_trusted then
    update public.tournaments set approval = 'approved', approval_reason = null, approval_decided_at = now(),
      listing_status = case when listing <> 'none' then 'approved' else listing_status end
    where club_id = p_club and approval <> 'approved' and status <> 'done';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- The admin club list also gives "trusted" (club_mode_19's version, with the private contact number).
create or replace function public.admin_clubs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'city', c.city, 'verified', c.verified, 'is_test', c.is_test, 'created_at', c.created_at, 'logo_url', c.logo_url,
      'hosting', c.hosting, 'hosting_phone', k.phone, 'hosting_note', k.note, 'hosting_reason', c.hosting_reason,
      'hosting_requested_at', c.hosting_requested_at, 'trusted', c.trusted,
      'owners', (select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb) from public.club_members m join auth.users u on u.id = m.user_id
                 where m.club_id = c.id and m.role = 'owner'),
      'members', (select count(*) from public.club_members m where m.club_id = c.id),
      'tournaments', (select count(*) from public.tournaments t where t.club_id = c.id),
      'last_event', (select max(t.start_date) from public.tournaments t where t.club_id = c.id)
    ) order by c.is_test, c.created_at desc), '[]'::jsonb)
    from public.clubs c left join public.club_contacts k on k.club_id = c.id);
end $$;

-- ---------- Robot: a tournament that isn't approved, to prove the server refuses it ----------

create function public.robot_reset_pending() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  club constant uuid := 'e2e00000-0000-4000-8000-000000000001';
  tid constant uuid := 'e2e00000-0000-4000-8000-000000000212';
  fmt constant jsonb := '{"pool": {"pointsTo": 11, "bestOf": 1, "scoring": "sideout", "golden": true}, "ko": {"pointsTo": 11, "bestOf": 1, "scoring": "sideout", "golden": true}}';
  today date := (now() at time zone 'Asia/Kolkata')::date;
  d public.tournament_desks;
begin
  insert into public.tournaments (id, club_id, name, start_date, start_time, courts, slot_minutes, status, is_public, public_slug, city, venue,
      entry_mode, registration_open, entries_close, upi_id, listing)
    values (tid, club, 'E2E Pending Cup', today + 9, '08:00', 2, 20, 'draft', true, 'pqe2epend1', 'Robotville', 'Test Courts, Court Road',
      'registration', true, today + 8, 'robot@upi', 'run')
    on conflict (id) do update set start_date = excluded.start_date, entries_close = excluded.entries_close, status = 'draft', is_public = true,
      registration_open = true, drawn_at = null, listing = 'run';
  update public.tournaments set approval = 'draft', approval_decided_at = null, approval_reason = null where id = tid;
  insert into public.divisions (id, tournament_id, club_id, name, kind, format, pools, advance, sort, gender, cap, fee) values
    ('e2e00000-0000-4000-8000-000000000313', tid, club, 'Open Singles', 'singles', fmt, 1, 0, 0, 'open', 16, 300)
    on conflict (id) do nothing;
  d := public.desk_of(tid);
  return jsonb_build_object('slug', 'pqe2epend1', 'desk', jsonb_build_object('token', d.token, 'pin', d.pin));
end $$;

create or replace function public.robot_reset() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tid constant uuid := 'e2e00000-0000-4000-8000-000000000201';
  r jsonb;
  p text;
  d public.tournament_desks;
begin
  loop
    p := lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not public.weak_pin(p);
  end loop;
  perform public.apply_event_pin(tid, p);
  r := public.robot_reset_courts();
  perform public.robot_reset_events();
  update public.entries set status = 'withdrawn' where division_id = 'e2e00000-0000-4000-8000-000000000301'
    and id not in ('e2e00000-0000-4000-8000-000000000401', 'e2e00000-0000-4000-8000-000000000402',
                   'e2e00000-0000-4000-8000-000000000403', 'e2e00000-0000-4000-8000-000000000404');
  perform public.desk_of(tid);
  update public.tournament_desks set token = encode(extensions.gen_random_bytes(18), 'hex'), pin = public.random_desk_pin(),
    failed_attempts = 0, locked_until = null, last_used_at = null, updated_at = now() where tournament_id = tid
    returning * into d;
  return r || jsonb_build_object('event', 'pqe2ereg01', 'desk', jsonb_build_object('token', d.token, 'pin', d.pin),
    'pending', public.robot_reset_pending());
end $$;

-- ---------- Permissions ----------

revoke execute on function public.tournament_approved(uuid), public.guard_tournament_approval(), public.guard_match_approval(),
  public.guard_registration_approval(), public.robot_reset_pending(), public.robot_reset(), public.scorer_check(text, text), public.desk_check(text, text)
  from public, anon, authenticated;
grant execute on function public.robot_reset() to service_role;
revoke execute on function public.submit_tournament(uuid, int), public.admin_decide_tournament(uuid, boolean, text), public.approval_queue(),
  public.admin_set_club_trusted(uuid, boolean) from public, anon;
grant execute on function public.submit_tournament(uuid, int), public.admin_decide_tournament(uuid, boolean, text), public.approval_queue(),
  public.admin_set_club_trusted(uuid, boolean) to authenticated;
grant execute on function public.public_tournament(text), public.public_event(text), public.share_events() to anon, authenticated;
-- The tournament guard runs as the signed-in organiser, so it needs this helper (it only says whether a club is trusted).
revoke execute on function public.club_auto_approves(uuid) from public, anon;
grant execute on function public.club_auto_approves(uuid) to authenticated;
