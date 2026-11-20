-- Late entries with full player details (audit 21 Nov 2026, B1 + K1).
-- Before: after the draw, a late entry in any event with a fee, an age limit or a men/women/mixed rule failed with
-- "requires eligibility or payment verification. Use the registration workflow", but that workflow is closed once the
-- draw is made. Now the organiser (or the desk) sends the players' details: they are checked with the same entry_problem
-- rules as every other entry, saved as an accepted offline registration (with the payment status), the players are
-- added to the club roster (email in club_player_emails, so they can claim their Studio), and the entry and its pool
-- matches are created, all in one transaction.

-- 1. The shared insert, with the eligibility check optional (only callers that verified the players skip it).
create function public.add_late_pool_entry_core(p_entry jsonb, p_matches jsonb, p_verified boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  e public.entries := jsonb_populate_record(null::public.entries, p_entry);
  d public.divisions;
  t public.tournaments;
  fixture public.club_matches;
  opponent public.entries;
  active_count integer;
  expected_count integer;
  seen uuid[] := '{}';
  rating_count integer;
  highest numeric;
  average numeric;
begin
  if e.division_id is null then raise exception 'Choose an event'; end if;
  perform pg_advisory_xact_lock(hashtextextended(e.division_id::text, 7));
  select * into d from public.divisions where id = e.division_id;
  if not found then raise exception 'Event not found'; end if;
  select * into t from public.tournaments where id = d.tournament_id for update;
  if not found or t.status = 'done' or (t.entry_mode = 'registration' and t.drawn_at is null) then
    raise exception 'Use the entries inbox before the draw. Finished tournaments cannot accept entries.';
  end if;
  if t.approval <> 'approved' then raise exception 'Tournament approval is required'; end if;
  if exists (select 1 from public.club_matches where division_id = d.id and stage <> 'pool' and status <> 'void') then
    raise exception 'Knockouts have started, so new entries can’t join';
  end if;
  if e.club_id is distinct from d.club_id or e.status is distinct from 'active'
    or e.pool is null or e.pool not between 1 and d.pools
    or cardinality(e.player_ids) is distinct from (case d.kind when 'doubles' then 2 else 1 end)
    or (select count(distinct player_id) from unnest(e.player_ids) as p(player_id)) <> cardinality(e.player_ids)
    or (select count(*) from public.club_players where club_id = d.club_id and id = any(e.player_ids)) <> cardinality(e.player_ids)
  then raise exception 'Choose eligible players from this club'; end if;
  if exists (select 1 from public.entries where division_id = d.id and status <> 'withdrawn' and player_ids && e.player_ids) then
    raise exception 'A player is already entered in this event';
  end if;
  select count(*) into active_count from public.entries where division_id = d.id and status <> 'withdrawn';
  if d.cap is not null and active_count >= d.cap then raise exception 'This event is full'; end if;
  if not p_verified and (coalesce(d.fee, 0) > 0 or d.min_age is not null or d.gender <> 'open') then
    raise exception 'This event needs each player’s details. Use “New team” in late entry.';
  end if;
  if d.max_dupr is not null then
    select count(rating), max(rating), avg(rating) into rating_count, highest, average from (
      select case d.kind when 'doubles' then dupr_doubles else dupr_singles end rating
      from public.club_players where id = any(e.player_ids)
    ) ratings;
    if rating_count <> cardinality(e.player_ids)
      or (case when d.dupr_cap = 'average' then average else highest end) > d.max_dupr
    then raise exception 'Player ratings do not meet this event’s DUPR limit'; end if;
  end if;
  select count(*) into expected_count from public.entries
    where division_id = d.id and status <> 'withdrawn' and coalesce(pool, 1) = e.pool;
  if jsonb_array_length(p_matches) is distinct from expected_count then raise exception 'The draw changed. Reload and try again.'; end if;
  insert into public.entries (id, division_id, club_id, player_ids, seed, pool, status)
    values (e.id, d.id, d.club_id, e.player_ids, e.seed, e.pool, 'active');
  for fixture in select * from jsonb_populate_recordset(null::public.club_matches, p_matches) loop
    select * into opponent from public.entries where id = fixture.entry_a and division_id = d.id
      and status <> 'withdrawn' and coalesce(pool, 1) = e.pool and id <> e.id;
    if not found or opponent.id = any(seen) then raise exception 'The draw changed. Reload and try again.'; end if;
    seen := array_append(seen, opponent.id);
    insert into public.club_matches (id, club_id, tournament_id, division_id, stage, pool, round, slot, court,
      entry_a, entry_b, side_a, side_b, format, games, status, played_on)
    values (fixture.id, d.club_id, t.id, d.id, 'pool', e.pool, fixture.round, fixture.slot, fixture.court,
      opponent.id, e.id, opponent.player_ids, e.player_ids, d.format->'pool', '[]', 'scheduled', t.start_date);
  end loop;
end $$;
revoke execute on function public.add_late_pool_entry_core(jsonb, jsonb, boolean) from public, anon, authenticated;

-- The existing callers (organiser and desk, roster players) keep their behaviour: checks on.
create or replace function public.add_late_pool_entry_internal(p_entry jsonb, p_matches jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.add_late_pool_entry_core(p_entry, p_matches, false);
end $$;
revoke execute on function public.add_late_pool_entry_internal(jsonb, jsonb) from public, anon, authenticated;

-- 2. New team with details: check the people, save roster rows + emails + the registration, then the entry.
--    p_people: [{id (new player uuid), name, phone, email, duprId, dupr, gender, age}], in the entry's player order.
create function public.late_team_internal(p_people jsonb, p_payment text, p_entry jsonb, p_matches jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  e public.entries := jsonb_populate_record(null::public.entries, p_entry);
  d public.divisions;
  t public.tournaments;
  problem text;
  p jsonb;
  i int := 0;
  ids uuid[] := '{}';
  people jsonb := '[]'::jsonb;
begin
  select * into d from public.divisions where id = e.division_id;
  if d.id is null then raise exception 'Event not found'; end if;
  select * into t from public.tournaments where id = d.tournament_id;
  if p_payment is null or p_payment not in ('paid', 'venue', 'unpaid') then raise exception 'Choose a payment status'; end if;
  if jsonb_typeof(p_people) is distinct from 'array' then raise exception 'Add the players'; end if;
  -- Same rules as every entry (names, age 18+, the event's age, gender and DUPR limits). Phone stays optional here.
  problem := public.entry_problem(d, p_people, false);
  if problem is not null then raise exception '%', problem; end if;
  for p in select * from jsonb_array_elements(p_people) loop
    i := i + 1;
    if (p ->> 'id') is null or (p ->> 'id')::uuid is distinct from e.player_ids[i] then raise exception 'The draw changed. Reload and try again.'; end if;
    if exists (select 1 from public.club_players where id = (p ->> 'id')::uuid) then raise exception 'The draw changed. Reload and try again.'; end if;
    insert into public.club_players (id, club_id, name, dupr_singles, dupr_doubles, dupr_id)
      values ((p ->> 'id')::uuid, d.club_id, trim(p ->> 'name'),
        case when d.kind = 'singles' then (p ->> 'dupr')::numeric end,
        case when d.kind = 'doubles' then (p ->> 'dupr')::numeric end,
        nullif(upper(trim(coalesce(p ->> 'duprId', ''))), ''));
    if nullif(trim(coalesce(p ->> 'email', '')), '') is not null then
      insert into public.club_player_emails (player_id, club_id, email) values ((p ->> 'id')::uuid, d.club_id, lower(trim(p ->> 'email')));
    end if;
    ids := ids || (p ->> 'id')::uuid;
    people := people || jsonb_build_array(p - 'id');
  end loop;
  perform public.add_late_pool_entry_core(p_entry, p_matches, true);
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status, payment, entry_id)
    values (t.id, d.id, d.club_id, 'offline', people, 'accepted', p_payment, e.id);
end $$;
revoke execute on function public.late_team_internal(jsonb, text, jsonb, jsonb) from public, anon, authenticated;

create function public.add_late_team(p_people jsonb, p_payment text, p_entry jsonb, p_matches jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.divisions d where d.id = (p_entry ->> 'division_id')::uuid and public.is_staff(d.club_id)
  ) then raise exception 'Only club staff can add entries'; end if;
  perform public.late_team_internal(p_people, p_payment, p_entry, p_matches);
end $$;
revoke execute on function public.add_late_team(jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function public.add_late_team(jsonb, text, jsonb, jsonb) to authenticated;

create function public.desk_add_late_team(p_token text, p_pin text, p_people jsonb, p_payment text, p_entry jsonb, p_matches jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare access jsonb := public.desk_check(p_token, p_pin);
begin
  if access ? 'error' then return access; end if;
  if not exists (
    select 1 from public.divisions where id = (p_entry ->> 'division_id')::uuid
      and tournament_id = (access ->> 'tournament_id')::uuid
  ) then raise exception 'That event isn’t in your tournament'; end if;
  perform public.late_team_internal(p_people, p_payment, p_entry, p_matches);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.desk_add_late_team(text, text, jsonb, text, jsonb, jsonb) from public;
grant execute on function public.desk_add_late_team(text, text, jsonb, text, jsonb, jsonb) to anon, authenticated;
