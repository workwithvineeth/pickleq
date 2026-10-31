-- Applied on the server as club_mode_18_desk_access.
-- Referees and the desk get separate access (QA review 31 Oct 2026, bug 1; Vineeth's decision 09:40).
--   1. Referee PIN (tournament_pins.pin, called the "event PIN" before). Organisers and PaddleQ admins set it, or let the app
--      pick one. Every court link uses it, and a court link opens only that court's matches. It no longer opens the desk.
--   2. Desk access: its own link (#/desk/<token>) and its own desk PIN, never the referee PIN. The desk gets this one tournament
--      only: the desk view, scores, moving matches, walkovers, late entries and withdrawals. No phone numbers (registrations are
--      never read), no other tournaments, no club settings, and it can't create or delete tournaments. Like referee links it needs
--      no account: everything goes through the guarded desk_* functions below, and it stops when the tournament is marked finished.
--   3. The old desk sign-in (helper link + event PIN made a new account a club coach) is switched off. The accounts it made lose
--      every club right at once: club_role() ignores them. No rows are deleted.
--   4. Knockout rounds can't be drawn twice when two screens (organiser and desk, or two desks) draw them at the same moment.

-- ---------- 3. Old desk accounts: no club rights ----------

-- Desk-team accounts (club_helpers) were made only by the old PIN sign-in, one fresh pq-helper-…@example.com account each, so
-- no real person's account is affected. Every RLS rule goes through club_role/is_member/is_staff/is_admin.
create or replace function public.club_role(cid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.club_members m
  where m.club_id = cid and m.user_id = (select auth.uid())
    and not exists (select 1 from public.club_helpers h where h.user_id = m.user_id)
$$;

create or replace function public.shares_club(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_members a join public.club_members b on a.club_id = b.club_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  ) and not exists (select 1 from public.club_helpers h where h.user_id = (select auth.uid()))
$$;

-- The old helper sign-in answers with the new way, before any account is made (the pin-sign-in edge function stops there).
create or replace function public.helper_pin_check(p_slug text, p_pin text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_object('error', 'The desk now has its own link and desk PIN. Ask the organiser for the desk link.');
end $$;

create or replace function public.helper_join(p_tournament uuid, p_user uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Desk sign-in with an account is switched off. Use the desk link and desk PIN.';
end $$;

-- ---------- 2. Desk access ----------

-- A random 6-digit desk PIN that isn't easy to guess (a referee PIN is usually 4 digits, so the two never match by chance).
create function public.random_desk_pin() returns text
language plpgsql volatile set search_path = '' as $$
declare p text;
begin
  loop
    p := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not public.weak_pin(p);
  end loop;
  return p;
end $$;

create table public.tournament_desks (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  pin text not null default public.random_desk_pin() check (pin ~ '^[0-9]{4,6}$'),
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_used_at timestamptz,
  updated_at timestamptz not null default now()
);
create index tournament_desks_club_idx on public.tournament_desks (club_id);
alter table public.tournament_desks enable row level security;
-- The club's organisers may read it; changes go through the functions below. Visitors and players see nothing.
create policy "staff see desk access" on public.tournament_desks for select to authenticated using (public.is_staff(club_id));

-- Every tournament, now and new, has a desk link and desk PIN.
insert into public.tournament_desks (tournament_id, club_id) select id, club_id from public.tournaments on conflict (tournament_id) do nothing;

create function public.desk_of(tid uuid) returns public.tournament_desks
language plpgsql security definer set search_path = '' as $$
declare d public.tournament_desks;
begin
  insert into public.tournament_desks (tournament_id, club_id) select id, club_id from public.tournaments where id = tid
    on conflict (tournament_id) do nothing;
  select * into d from public.tournament_desks where tournament_id = tid;
  return d;
end $$;

create function public.tournaments_make_desk() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tournament_desks (tournament_id, club_id) values (new.id, new.club_id) on conflict (tournament_id) do nothing;
  return new;
end $$;
create trigger tournaments_make_desk after insert on public.tournaments for each row execute function public.tournaments_make_desk();

-- Organisers (the club's owner, admins and coaches) and PaddleQ admins run a tournament's access.
create function public.can_run_tournament(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournaments t where t.id = tid and (public.is_staff(t.club_id) or public.is_platform_admin()))
$$;

-- For organisers and PaddleQ admins: the desk link token, the desk PIN and the referee PIN.
create function public.tournament_access(p_tournament uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.tournament_desks;
begin
  if not public.can_run_tournament(p_tournament) then return jsonb_build_object('error', 'Only the club''s organisers can see the PINs'); end if;
  d := public.desk_of(p_tournament);
  return jsonb_build_object('referee_pin', public.event_pin_of(p_tournament), 'desk_pin', d.pin, 'desk_token', d.token);
end $$;

-- The referee PIN: typed by the organiser (4 to 6 digits, not easy to guess, not the desk PIN) or picked at random.
-- It goes on every court link of the tournament and clears their lockouts.
create or replace function public.set_event_pin(p_tournament uuid, p_pin text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p text := p_pin;
  desk text;
begin
  if not public.can_run_tournament(p_tournament) then raise exception 'Only the club''s organisers can change the referee PIN'; end if;
  desk := (public.desk_of(p_tournament)).pin;
  if p is null then
    loop
      p := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 10000)::text, 4, '0');
      exit when not public.weak_pin(p) and p <> desk;
    end loop;
  elsif p !~ '^[0-9]{4,6}$' then raise exception 'A PIN is 4 to 6 digits';
  elsif public.weak_pin(p) then raise exception 'That PIN is too easy to guess. Avoid repeats like 1111 and runs like 1234.';
  elsif p = desk then raise exception 'The referee PIN must be different from the desk PIN';
  end if;
  perform public.apply_event_pin(p_tournament, p);
  return p;
end $$;

-- The desk PIN: typed by the organiser (4 to 6 digits, not easy to guess, never the referee PIN) or picked at random.
create function public.set_desk_pin(p_tournament uuid, p_pin text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p text := p_pin;
  ref text;
begin
  if not public.can_run_tournament(p_tournament) then raise exception 'Only the club''s organisers can change the desk PIN'; end if;
  ref := public.event_pin_of(p_tournament);
  perform public.desk_of(p_tournament);
  if p is null then
    loop
      p := public.random_desk_pin();
      exit when p <> ref;
    end loop;
  elsif p !~ '^[0-9]{4,6}$' then raise exception 'A PIN is 4 to 6 digits';
  elsif public.weak_pin(p) then raise exception 'That PIN is too easy to guess. Avoid repeats like 1111 and runs like 1234.';
  elsif p = ref then raise exception 'The desk PIN must be different from the referee PIN';
  end if;
  update public.tournament_desks set pin = p, failed_attempts = 0, locked_until = null, updated_at = now() where tournament_id = p_tournament;
  return p;
end $$;

-- A new desk link: the old one stops working at once (e.g. a desk phone was lost). The PIN stays.
create function public.new_desk_link(p_tournament uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not public.can_run_tournament(p_tournament) then raise exception 'Only the club''s organisers can change the desk link'; end if;
  perform public.desk_of(p_tournament);
  update public.tournament_desks set token = tok, failed_attempts = 0, locked_until = null, last_used_at = null, updated_at = now() where tournament_id = p_tournament;
  return tok;
end $$;

-- Public (no PIN): the club and tournament a desk link belongs to, for the sign-in page. Nothing else.
create function public.desk_label(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('club', c.name, 'logo_url', c.logo_url, 'tournament', t.name)
  from public.tournament_desks d join public.tournaments t on t.id = d.tournament_id join public.clubs c on c.id = t.club_id
  where d.token = coalesce(p_token, '') and char_length(coalesce(p_token, '')) >= 20
$$;

-- Checks a desk link and desk PIN. Answers {tournament_id, club_id, courts} or {error}. Never raises, so wrong PINs are counted:
-- every fifth wrong PIN locks the link for a while (2, 4, 8 … up to 30 minutes).
create function public.desk_check(p_token text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.tournament_desks;
  t public.tournaments;
begin
  select * into d from public.tournament_desks where token = coalesce(p_token, '') for update;
  if d.tournament_id is null then return jsonb_build_object('error', 'This desk link isn''t valid. Ask the organiser for the desk link again.'); end if;
  select * into t from public.tournaments where id = d.tournament_id;
  if t.status = 'done' then return jsonb_build_object('error', 'This tournament is finished, so the desk link no longer works.'); end if;
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
  -- Write only when something changes (the desk refreshes every few seconds).
  if d.failed_attempts <> 0 or d.locked_until is not null or d.last_used_at is null or d.last_used_at < now() - interval '1 minute' then
    update public.tournament_desks set failed_attempts = 0, locked_until = null, last_used_at = now() where tournament_id = d.tournament_id;
  end if;
  return jsonb_build_object('tournament_id', t.id, 'club_id', t.club_id, 'courts', t.courts);
end $$;

-- What the desk sees: the tournament, its events, entries and matches, and the club's player names and ratings. No phone numbers,
-- emails, account ids, invite or claim codes, organiser contact or UPI details.
create function public.desk_open(p_token text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb := public.desk_check(p_token, p_pin);
  tid uuid;
begin
  if c ? 'error' then return c; end if;
  tid := (c ->> 'tournament_id')::uuid;
  return (select jsonb_build_object(
    'tournament', jsonb_build_object('id', t.id, 'club_id', t.club_id, 'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time,
      'courts', t.courts, 'slot_minutes', t.slot_minutes, 'status', t.status, 'is_public', t.is_public, 'public_slug', t.public_slug,
      'entry_mode', t.entry_mode, 'drawn_at', t.drawn_at, 'city', t.city, 'venue', t.venue),
    'club', jsonb_build_object('id', cl.id, 'name', cl.name, 'city', cl.city, 'logo_url', cl.logo_url,
      'settings', jsonb_strip_nulls(jsonb_build_object('thresholds', cl.settings -> 'thresholds'))),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tournament_id', d.tournament_id, 'club_id', d.club_id, 'name', d.name,
        'kind', d.kind, 'format', d.format, 'pools', d.pools, 'advance', d.advance, 'sort', d.sort, 'max_dupr', d.max_dupr, 'dupr_cap', d.dupr_cap,
        'gender', d.gender, 'min_age', d.min_age, 'cap', d.cap) order by d.sort) from public.divisions d where d.tournament_id = tid), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'division_id', e.division_id, 'club_id', e.club_id, 'player_ids', e.player_ids,
        'seed', e.seed, 'pool', e.pool, 'status', e.status))
      from public.entries e join public.divisions d on d.id = e.division_id where d.tournament_id = tid), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'club_id', m.club_id, 'tournament_id', m.tournament_id, 'division_id', m.division_id,
        'stage', m.stage, 'pool', m.pool, 'round', m.round, 'bracket_pos', m.bracket_pos, 'slot', m.slot, 'court', m.court, 'entry_a', m.entry_a,
        'entry_b', m.entry_b, 'side_a', m.side_a, 'side_b', m.side_b, 'format', m.format, 'games', m.games, 'status', m.status, 'winner', m.winner,
        'played_on', m.played_on, 'updated_at', m.updated_at))
      from public.club_matches m where m.tournament_id = tid), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'club_id', p.club_id, 'name', p.name, 'dupr_singles', p.dupr_singles,
        'dupr_doubles', p.dupr_doubles, 'sample', p.sample) order by p.name) from public.club_players p where p.club_id = t.club_id), '[]'::jsonb))
    from public.tournaments t join public.clubs cl on cl.id = t.club_id where t.id = tid);
end $$;

-- Scores (shape checked the same way as referee links): at most 5 games, each 0–99 with the point order as A/B letters.
create function public.score_problem(p_games jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare g jsonb;
begin
  if jsonb_typeof(p_games) is distinct from 'array' or jsonb_array_length(p_games) > 5 then return 'Scores aren''t in the right shape'; end if;
  for g in select * from jsonb_array_elements(p_games) loop
    if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g -> 'a') is distinct from 'number' or jsonb_typeof(g -> 'b') is distinct from 'number' then
      return 'Scores aren''t in the right shape';
    end if;
    if (g ->> 'a')::numeric not between 0 and 99 or (g ->> 'b')::numeric not between 0 and 99
      or char_length(coalesce(g ->> 'points', '')) > 250 or coalesce(g ->> 'points', '') !~ '^[AB]*$' then
      return 'Scores aren''t in the right shape';
    end if;
  end loop;
  return null;
end $$;

-- A list of the club's players for one side of a match or an entry (1 or 2 people), or null if it isn't.
create function public.desk_people(p_club uuid, p jsonb) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare ids uuid[];
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 2 then return null; end if;
  begin
    ids := array(select x::uuid from jsonb_array_elements_text(p) x);
  exception when others then return null;
  end;
  if (select count(distinct x) from unnest(ids) x) <> cardinality(ids) then return null; end if;
  if (select count(*) from public.club_players cp where cp.club_id = p_club and cp.id = any (ids)) <> cardinality(ids) then return null; end if;
  return ids;
end $$;

-- A score from the desk, for any court of its tournament.
create function public.desk_save_score(p_token text, p_pin text, p_match uuid, p_games jsonb, p_status text, p_winner text, p_played_on date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb := public.desk_check(p_token, p_pin);
  m public.club_matches;
  bad text;
begin
  if c ? 'error' then return c; end if;
  select * into m from public.club_matches where id = p_match;
  if m.id is null or m.tournament_id <> (c ->> 'tournament_id')::uuid then return jsonb_build_object('error', 'This match isn''t in your tournament.'); end if;
  if m.status = 'void' then return jsonb_build_object('error', 'This match was cancelled.'); end if;
  if m.status = 'done' and p_status = 'live' then return jsonb_build_object('error', 'This match is already finished.'); end if;
  if p_status is null or p_status not in ('live', 'done') then return jsonb_build_object('error', 'Unknown match status'); end if;
  if p_status = 'done' and (p_winner is null or p_winner not in ('A', 'B')) then return jsonb_build_object('error', 'A finished match needs a winner'); end if;
  bad := public.score_problem(p_games);
  if bad is not null then return jsonb_build_object('error', bad); end if;
  update public.club_matches set games = p_games, status = p_status, winner = case when p_status = 'done' then p_winner else null end,
    played_on = coalesce(p_played_on, played_on), updated_at = now(), updated_by = null
    where id = p_match;
  return jsonb_build_object('ok', true);
end $$;

-- Desk changes to matches: move to a court or time, walkover/retirement, cancel (a withdrawal), or swap a player.
-- p_changes: [{"id": "<match>", "patch": {"status", "winner", "games", "court", "slot", "side_a", "side_b"}}]. All or nothing.
create function public.desk_patch_matches(p_token text, p_pin text, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb := public.desk_check(p_token, p_pin);
  tid uuid;
  cid uuid;
  courts int;
  ch jsonb;
  p jsonb;
  m public.club_matches;
  sa uuid[];
  sb uuid[];
begin
  if c ? 'error' then return c; end if;
  tid := (c ->> 'tournament_id')::uuid; cid := (c ->> 'club_id')::uuid; courts := (c ->> 'courts')::int;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) > 200 then raise exception 'Changes aren''t in the right shape'; end if;
  for ch in select * from jsonb_array_elements(p_changes) loop
    p := ch -> 'patch';
    if jsonb_typeof(p) is distinct from 'object' then raise exception 'Changes aren''t in the right shape'; end if;
    select * into m from public.club_matches where id = (ch ->> 'id')::uuid;
    if m.id is null or m.tournament_id is distinct from tid then raise exception 'This match isn''t in your tournament.'; end if;
    if p ? 'status' and (p ->> 'status') not in ('scheduled', 'live', 'done', 'void') then raise exception 'Unknown match status'; end if;
    if p ? 'winner' and jsonb_typeof(p -> 'winner') <> 'null' and (p ->> 'winner') not in ('A', 'B') then raise exception 'The winner is A or B'; end if;
    if p ? 'games' and public.score_problem(p -> 'games') is not null then raise exception '%', public.score_problem(p -> 'games'); end if;
    if p ? 'court' and (jsonb_typeof(p -> 'court') <> 'number' or (p ->> 'court')::numeric not between 1 and greatest(courts, 1)
      or (p ->> 'court')::numeric <> floor((p ->> 'court')::numeric)) then
      raise exception 'Choose a court from 1 to %', courts;
    end if;
    if p ? 'slot' and (jsonb_typeof(p -> 'slot') <> 'number' or (p ->> 'slot')::numeric not between 0 and 2000
      or (p ->> 'slot')::numeric <> floor((p ->> 'slot')::numeric)) then
      raise exception 'That time slot isn''t valid';
    end if;
    sa := m.side_a; sb := m.side_b;
    if p ? 'side_a' then sa := public.desk_people(cid, p -> 'side_a'); if sa is null then raise exception 'Choose players from the club'; end if; end if;
    if p ? 'side_b' then sb := public.desk_people(cid, p -> 'side_b'); if sb is null then raise exception 'Choose players from the club'; end if; end if;
    if sa && sb then raise exception 'A player can''t be on both sides'; end if;
    update public.club_matches set
      status = coalesce(p ->> 'status', status),
      winner = case when p ? 'winner' then p ->> 'winner' else winner end,
      games = case when p ? 'games' then p -> 'games' else games end,
      court = case when p ? 'court' then (p ->> 'court')::int else court end,
      slot = case when p ? 'slot' then (p ->> 'slot')::int else slot end,
      side_a = sa, side_b = sb, updated_at = now(), updated_by = null
      where id = m.id;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- A late entry (or a pool change / withdrawal / replaced player) from the desk, in one of this tournament's events.
create function public.desk_add_entry(p_token text, p_pin text, p_entry jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb := public.desk_check(p_token, p_pin);
  d public.divisions;
  ids uuid[];
  eid uuid;
begin
  if c ? 'error' then return c; end if;
  if jsonb_typeof(p_entry) is distinct from 'object' then raise exception 'The entry isn''t in the right shape'; end if;
  select * into d from public.divisions where id = (p_entry ->> 'division_id')::uuid;
  if d.id is null or d.tournament_id <> (c ->> 'tournament_id')::uuid then raise exception 'That event isn''t in your tournament.'; end if;
  ids := public.desk_people(d.club_id, p_entry -> 'player_ids');
  if ids is null or cardinality(ids) <> (case when d.kind = 'doubles' then 2 else 1 end) then
    raise exception 'Choose % from the club', (case when d.kind = 'doubles' then 'two players' else 'one player' end);
  end if;
  if exists (select 1 from public.entries e where e.division_id = d.id and e.status = 'active' and e.player_ids && ids) then
    raise exception 'That player is already in this event';
  end if;
  eid := coalesce(nullif(p_entry ->> 'id', '')::uuid, gen_random_uuid());
  insert into public.entries (id, division_id, club_id, player_ids, seed, pool, status)
    values (eid, d.id, d.club_id, ids, (p_entry ->> 'seed')::int, (p_entry ->> 'pool')::int, 'active');
  return jsonb_build_object('ok', true, 'id', eid);
end $$;

create function public.desk_update_entry(p_token text, p_pin text, p_entry uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb := public.desk_check(p_token, p_pin);
  e public.entries;
  d public.divisions;
  ids uuid[];
begin
  if c ? 'error' then return c; end if;
  select * into e from public.entries where id = p_entry;
  select * into d from public.divisions where id = e.division_id;
  if e.id is null or d.tournament_id <> (c ->> 'tournament_id')::uuid then raise exception 'That entry isn''t in your tournament.'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'The change isn''t in the right shape'; end if;
  if p_patch ? 'status' and (p_patch ->> 'status') not in ('active', 'withdrawn') then raise exception 'Unknown entry status'; end if;
  ids := e.player_ids;
  if p_patch ? 'player_ids' then
    ids := public.desk_people(d.club_id, p_patch -> 'player_ids');
    if ids is null or cardinality(ids) <> cardinality(e.player_ids) then raise exception 'Choose players from the club'; end if;
  end if;
  if p_patch ? 'pool' and (jsonb_typeof(p_patch -> 'pool') <> 'number' or (p_patch ->> 'pool')::numeric not between 1 and 16) then
    raise exception 'That pool isn''t valid';
  end if;
  update public.entries set player_ids = ids, status = coalesce(p_patch ->> 'status', status),
    pool = case when p_patch ? 'pool' then (p_patch ->> 'pool')::int else pool end
    where id = e.id;
  return jsonb_build_object('ok', true);
end $$;

-- New matches from the desk: a late entry's pool matches, or the next knockout round once a round is finished.
-- Rows are the same shape as the app's club_matches rows; they must belong to this tournament's events and entries.
create function public.desk_add_matches(p_token text, p_pin text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb := public.desk_check(p_token, p_pin);
  tid uuid;
  cid uuid;
  r jsonb;
  d public.divisions;
  sa uuid[];
  sb uuid[];
  n int := 0;
begin
  if c ? 'error' then return c; end if;
  tid := (c ->> 'tournament_id')::uuid; cid := (c ->> 'club_id')::uuid;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 200 then raise exception 'Matches aren''t in the right shape'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select * into d from public.divisions where id = (r ->> 'division_id')::uuid;
    if d.id is null or d.tournament_id <> tid then raise exception 'That event isn''t in your tournament.'; end if;
    if (r ->> 'stage') is null or (r ->> 'stage') not in ('pool', 'r32', 'r16', 'qf', 'sf', 'final') then raise exception 'Unknown stage'; end if;
    if coalesce(r ->> 'status', 'scheduled') not in ('scheduled', 'done', 'void') then raise exception 'Unknown match status'; end if;
    if r ? 'winner' and jsonb_typeof(r -> 'winner') <> 'null' and (r ->> 'winner') not in ('A', 'B') then raise exception 'The winner is A or B'; end if;
    if public.score_problem(coalesce(r -> 'games', '[]'::jsonb)) is not null then raise exception 'Scores aren''t in the right shape'; end if;
    if jsonb_typeof(r -> 'format') is distinct from 'object' then raise exception 'The match needs a format'; end if;
    if (r ->> 'entry_a') is not null and not exists (select 1 from public.entries e where e.id = (r ->> 'entry_a')::uuid and e.division_id = d.id) then
      raise exception 'That entry isn''t in this event.';
    end if;
    if (r ->> 'entry_b') is not null and not exists (select 1 from public.entries e where e.id = (r ->> 'entry_b')::uuid and e.division_id = d.id) then
      raise exception 'That entry isn''t in this event.';
    end if;
    sa := case when jsonb_array_length(coalesce(r -> 'side_a', '[]'::jsonb)) = 0 then '{}'::uuid[] else public.desk_people(cid, r -> 'side_a') end;
    sb := case when jsonb_array_length(coalesce(r -> 'side_b', '[]'::jsonb)) = 0 then '{}'::uuid[] else public.desk_people(cid, r -> 'side_b') end;
    if sa is null or sb is null then raise exception 'Choose players from the club'; end if;
    insert into public.club_matches (id, club_id, tournament_id, division_id, stage, pool, round, bracket_pos, slot, court, entry_a, entry_b,
        side_a, side_b, format, games, status, winner, played_on, updated_by)
      values (coalesce(nullif(r ->> 'id', '')::uuid, gen_random_uuid()), cid, tid, d.id, r ->> 'stage', (r ->> 'pool')::int, (r ->> 'round')::int,
        (r ->> 'bracket_pos')::int, (r ->> 'slot')::int, (r ->> 'court')::int, (r ->> 'entry_a')::uuid, (r ->> 'entry_b')::uuid,
        sa, sb, r -> 'format', coalesce(r -> 'games', '[]'::jsonb), coalesce(r ->> 'status', 'scheduled'), r ->> 'winner', (r ->> 'played_on')::date, null)
      on conflict (id) do nothing;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'rows', n);
end $$;

-- A walk-in player for the club's list (name and optional DUPR), so the desk can enter them late.
create function public.desk_add_player(p_token text, p_pin text, p_name text, p_dupr numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb := public.desk_check(p_token, p_pin);
  nm text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
  p public.club_players;
begin
  if c ? 'error' then return c; end if;
  if char_length(nm) < 1 then raise exception 'Enter their name'; end if;
  if p_dupr is not null and p_dupr not between 1 and 8 then raise exception 'DUPR is a number between 1 and 8, or leave it empty'; end if;
  insert into public.club_players (club_id, name, dupr_singles, dupr_doubles) values ((c ->> 'club_id')::uuid, nm, p_dupr, p_dupr) returning * into p;
  return jsonb_build_object('id', p.id, 'club_id', p.club_id, 'name', p.name, 'dupr_singles', p.dupr_singles, 'dupr_doubles', p.dupr_doubles, 'sample', p.sample);
end $$;

-- The desk may start a tournament that hasn't started (never finish or reopen one).
create function public.desk_start(p_token text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c jsonb := public.desk_check(p_token, p_pin);
begin
  if c ? 'error' then return c; end if;
  update public.tournaments set status = 'live' where id = (c ->> 'tournament_id')::uuid and status = 'draft';
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 4. A knockout round is drawn once ----------

-- Two screens can draw the same knockout round at the same moment (each sees the pools finished). The second copy is skipped:
-- a knockout match with the same event, stage and bracket position that isn't cancelled already exists.
create function public.club_matches_one_ko() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.stage in ('pool', 'friendly') or new.division_id is null or new.bracket_pos is null or new.status = 'void' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.division_id::text, 7));
  if exists (select 1 from public.club_matches m where m.division_id = new.division_id and m.stage = new.stage
             and m.bracket_pos = new.bracket_pos and m.status <> 'void' and m.id <> new.id) then
    return null;
  end if;
  return new;
end $$;
create trigger club_matches_one_ko before insert on public.club_matches for each row execute function public.club_matches_one_ko();

-- ---------- Admin: both PINs in Admin → Events ----------

create or replace function public.admin_tournaments() returns jsonb
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
      'desk_pin', (select k.pin from public.tournament_desks k where k.tournament_id = t.id),
      'desk_token', (select k.token from public.tournament_desks k where k.tournament_id = t.id),
      'desk_used_at', (select k.last_used_at from public.tournament_desks k where k.tournament_id = t.id),
      'helpers', '[]'::jsonb
    ) as j
    from public.tournaments t join public.clubs c on c.id = t.club_id
    order by t.start_date desc limit 300) x);
end $$;

-- ---------- Robot: a fresh desk link and desk PIN every run; last run's late entries leave ----------

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
  return r || jsonb_build_object('event', 'pqe2ereg01', 'desk', jsonb_build_object('token', d.token, 'pin', d.pin));
end $$;

-- ---------- Permissions ----------

revoke execute on function public.random_desk_pin(), public.desk_of(uuid), public.tournaments_make_desk(), public.can_run_tournament(uuid),
  public.desk_check(text, text), public.score_problem(jsonb), public.desk_people(uuid, jsonb), public.club_matches_one_ko(), public.robot_reset()
  from public, anon, authenticated;
grant execute on function public.robot_reset() to service_role;
revoke execute on function public.tournament_access(uuid), public.set_desk_pin(uuid, text), public.new_desk_link(uuid), public.desk_label(text),
  public.desk_open(text, text), public.desk_save_score(text, text, uuid, jsonb, text, text, date), public.desk_patch_matches(text, text, jsonb),
  public.desk_add_entry(text, text, jsonb), public.desk_update_entry(text, text, uuid, jsonb), public.desk_add_matches(text, text, jsonb),
  public.desk_add_player(text, text, text, numeric), public.desk_start(text, text)
  from public, anon;
-- Organisers (signed in): the PINs and desk link.
grant execute on function public.tournament_access(uuid), public.set_desk_pin(uuid, text), public.new_desk_link(uuid) to authenticated;
-- The desk (no account needed, like referee links).
grant execute on function public.desk_label(text), public.desk_open(text, text), public.desk_save_score(text, text, uuid, jsonb, text, text, date),
  public.desk_patch_matches(text, text, jsonb), public.desk_add_entry(text, text, jsonb), public.desk_update_entry(text, text, uuid, jsonb),
  public.desk_add_matches(text, text, jsonb), public.desk_add_player(text, text, text, numeric), public.desk_start(text, text)
  to anon, authenticated;
