-- Applied on the server as club_mode_12_formats_import.
-- 1. Knockout rounds of 16 and 32: knockouts of 16 after pools, and knockout-only events of up to 32 (with byes).
--    Knockout shape, best runners-up and per-round formats live in divisions.format (jsonb), so they need no new columns.
-- 2. DUPR cap on each player (as before) or on a doubles team's average ("DUPR team average under 3.5").
-- 3. Entries the organiser imports from a Google Form may have no age: the organiser confirms the players are adults
--    ("adult": true on the player). Only for offline entries, and only when the event has no age group above 18.
-- 4. import_entries: adds imported entries in one go, skipping anyone already entered in that event (by phone, else name),
--    so importing the same sheet again after new responses adds only the new ones. Nothing here deletes rows.

alter table public.club_matches drop constraint club_matches_stage_check;
alter table public.club_matches add constraint club_matches_stage_check
  check (stage in ('pool', 'r32', 'r16', 'qf', 'sf', 'final', 'friendly'));

alter table public.divisions add column dupr_cap text not null default 'each' check (dupr_cap in ('each', 'average'));

create or replace function public.entry_problem(d public.divisions, players jsonb, need_phone boolean) returns text
language plpgsql stable set search_path = '' as $$
declare
  need int := case when d.kind = 'doubles' then 2 else 1 end;
  p jsonb;
  genders text[] := '{}';
  min_age int := greatest(18, coalesce(d.min_age, 18));
  n int := 0;
  team_avg boolean := d.max_dupr is not null and d.dupr_cap = 'average' and need = 2;
  total numeric := 0;
begin
  if jsonb_typeof(players) is distinct from 'array' or jsonb_array_length(players) <> need then
    return case when need = 2 then 'A doubles entry needs two players' else 'A singles entry is one player' end;
  end if;
  for p in select * from jsonb_array_elements(players) loop
    n := n + 1;
    if char_length(trim(coalesce(p ->> 'name', ''))) not between 1 and 60 then return format('Player %s: enter their name', n); end if;
    if (need_phone or coalesce(p ->> 'phone', '') <> '') and coalesce(p ->> 'phone', '') !~ '^\+?[0-9][0-9 -]{7,15}$' then
      return format('%s: enter a phone number', p ->> 'name');
    end if;
    if coalesce(p ->> 'duprId', '') <> '' and (p ->> 'duprId') !~ '^[A-Za-z0-9-]{3,20}$' then return format('%s: a DUPR ID is 3 to 20 letters or numbers', p ->> 'name'); end if;
    if coalesce(p ->> 'dupr', '') <> '' and (jsonb_typeof(p -> 'dupr') <> 'number' or (p ->> 'dupr')::numeric not between 1 and 8) then
      return format('%s: DUPR rating is a number between 1 and 8', p ->> 'name');
    end if;
    if coalesce(p ->> 'gender', '') not in ('m', 'f', 'x') then return format('%s: choose a gender', p ->> 'name'); end if;
    if coalesce(p ->> 'age', '') = '' and not need_phone and coalesce(p ->> 'adult', '') = 'true' then
      -- Organiser-confirmed adult with no age given (imported entries).
      if min_age > 18 then return format('%s: this event is for players aged %s and over, so add their age', p ->> 'name', min_age); end if;
    else
      if jsonb_typeof(p -> 'age') <> 'number' or (p ->> 'age')::numeric <> floor((p ->> 'age')::numeric) or (p ->> 'age')::int not between 1 and 120 then
        return format('%s: enter their age', p ->> 'name');
      end if;
      if (p ->> 'age')::int < 18 then return 'Players must be 18 or over. Junior events aren''t supported yet.'; end if;
      if (p ->> 'age')::int < min_age then return format('%s: this event is for players aged %s and over', p ->> 'name', min_age); end if;
    end if;
    if d.max_dupr is not null then
      if coalesce(p ->> 'dupr', '') = '' then
        return format('%s: this event needs a DUPR rating (%s%s and under)', p ->> 'name', case when team_avg then 'team average ' else '' end, public.cap_text(d.max_dupr));
      end if;
      if not team_avg and (p ->> 'dupr')::numeric > d.max_dupr then return format('%s: rating %s is above this event''s cap of %s', p ->> 'name', p ->> 'dupr', public.cap_text(d.max_dupr)); end if;
      total := total + (p ->> 'dupr')::numeric;
    end if;
    genders := genders || (p ->> 'gender');
  end loop;
  if team_avg and total / 2 > d.max_dupr then
    return format('Team average %s is above this event''s cap of %s', public.cap_text(round(total / 2, 3)), public.cap_text(d.max_dupr));
  end if;
  if d.gender = 'men' and genders <> array_fill('m'::text, array[need]) then return 'This event is for men'; end if;
  if d.gender = 'women' and genders <> array_fill('f'::text, array[need]) then return 'This event is for women'; end if;
  if d.gender = 'mixed' and not (need = 2 and 'm' = any (genders) and 'f' = any (genders)) then return 'A mixed doubles team is one man and one woman'; end if;
  if need = 2 and coalesce(players -> 0 ->> 'phone', '') <> '' and regexp_replace(players -> 0 ->> 'phone', '\D', '', 'g') = regexp_replace(players -> 1 ->> 'phone', '\D', '', 'g') then
    return 'The two players need different phone numbers';
  end if;
  return null;
end $$;

-- The events board and event page also say whether a DUPR cap is per player or the team average.
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
    'divisions', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'max_dupr', d.max_dupr, 'dupr_cap', d.dupr_cap, 'gender', d.gender,
        'min_age', d.min_age, 'fee', d.fee, 'cap', d.cap,
        'taken', (select count(*) from public.registrations r where r.division_id = d.id and r.status in ('pending', 'accepted')))
      order by d.sort), '[]'::jsonb) from public.divisions d where d.tournament_id = t.id))
  from public.clubs c where c.id = t.club_id
$$;

-- Who a person on an entry is: the last 10 digits of their phone, else their name in lower case.
create or replace function public.person_key(p jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g')) >= 8
    then 'p:' || right(regexp_replace(p ->> 'phone', '\D', '', 'g'), 10)
    else 'n:' || lower(regexp_replace(trim(coalesce(p ->> 'name', '')), '\s+', ' ', 'g')) end
$$;
revoke execute on function public.person_key(jsonb) from public, anon, authenticated;

-- rows: [{ "division": uuid, "players": [...], "status": "accepted"|"pending", "payment": "unpaid"|"venue"|"paid" }]
create or replace function public.import_entries(p_tournament uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
  d public.divisions;
  r jsonb;
  i int := 0;
  added int := 0;
  waitlisted int := 0;
  skipped int := 0;
  problems jsonb := '[]'::jsonb;
  st text;
  pay text;
  players jsonb;
  taken int;
begin
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.is_staff(t.club_id) then return jsonb_build_object('error', 'Only the organiser can import entries'); end if;
  if t.entry_mode <> 'registration' then return jsonb_build_object('error', 'Importing is for tournaments where players register'); end if;
  if t.drawn_at is not null then return jsonb_build_object('error', 'The draw is made. Add new players as late entries.'); end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 400 then return jsonb_build_object('error', 'Import up to 400 rows at a time'); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    select * into d from public.divisions where id = (r ->> 'division')::uuid and tournament_id = t.id;
    if d.id is null then problems := problems || jsonb_build_object('row', i, 'error', 'That event isn''t part of this tournament'); continue; end if;
    if jsonb_typeof(r -> 'players') is distinct from 'array' then problems := problems || jsonb_build_object('row', i, 'error', 'No players'); continue; end if;
    -- Already entered in this event (any status, so turned-down or withdrawn entries don't come back): skip.
    if exists (select 1 from public.registrations x, jsonb_array_elements(x.players) xp, jsonb_array_elements(r -> 'players') np
               where x.division_id = d.id and public.person_key(xp) = public.person_key(np)) then
      skipped := skipped + 1; continue;
    end if;
    players := (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name', trim(p ->> 'name'), 'phone', trim(coalesce(p ->> 'phone', '')),
        'duprId', nullif(upper(trim(coalesce(p ->> 'duprId', ''))), ''), 'dupr', p -> 'dupr', 'gender', p ->> 'gender',
        'age', case when jsonb_typeof(p -> 'age') = 'number' then p -> 'age' end,
        'adult', case when coalesce(p ->> 'adult', '') = 'true' then true end)))
      from jsonb_array_elements(r -> 'players') p);
    st := case when r ->> 'status' = 'pending' then 'pending' else 'accepted' end;
    pay := case when r ->> 'payment' in ('venue', 'paid') then r ->> 'payment' else 'unpaid' end;
    select count(*) into taken from public.registrations where division_id = d.id and status in ('pending', 'accepted');
    if d.cap is not null and taken >= d.cap then st := 'waitlist'; end if;
    begin
      insert into public.registrations (tournament_id, division_id, club_id, source, players, status, payment)
        values (t.id, d.id, d.club_id, 'offline', players, st, pay);
      added := added + 1;
      if st = 'waitlist' then waitlisted := waitlisted + 1; end if;
    exception when others then
      problems := problems || jsonb_build_object('row', i, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('ok', true, 'added', added, 'waitlisted', waitlisted, 'skipped', skipped, 'problems', problems);
end $$;
revoke execute on function public.import_entries(uuid, jsonb) from public, anon;
grant execute on function public.import_entries(uuid, jsonb) to authenticated;
