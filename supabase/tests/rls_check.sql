-- Security check for Club mode. Runs inside a transaction and rolls back, so it leaves nothing behind.
-- Two made-up users each create a club; then we confirm neither can see or change the other's club,
-- that players can't score or change roles, and that public results show names and scores only.
-- Any failed check raises an error naming it.
begin;

insert into auth.users (id, email, aud, role, instance_id)
values ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-8000-00000000000c', 'rls-c@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

-- A creates a club with a tournament and a match; C joins it as a player.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","email":"rls-a@example.test","role":"authenticated"}', true);
insert into ids values ('club_a', public.create_club('Club A', 'Testville', 'Alice'));
-- PaddleQ approves the test club, so it can host (club_mode_16).
reset role;
update public.clubs set hosting = 'approved' where id in (select v from ids);
set local role authenticated;
insert into public.club_players (club_id, name) select v, 'Pat' from ids where k = 'club_a';
insert into public.tournaments (club_id, name, start_date, is_public) select v, 'A Open', current_date, true from ids where k = 'club_a';
insert into public.club_matches (club_id, side_a, side_b, format, games, status, winner)
  select v, '{}', '{}', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}', '[{"points":"","a":11,"b":5}]', 'done', 'A' from ids where k = 'club_a';

-- B creates their own club.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","email":"rls-b@example.test","role":"authenticated"}', true);
insert into ids values ('club_b', public.create_club('Club B', '', 'Bob'));

do $$
declare n int;
begin
  -- B must not see anything of Club A.
  select count(*) into n from public.clubs c join ids on ids.k = 'club_a' and c.id = ids.v;
  if n <> 0 then raise exception 'FAIL: B can see Club A'; end if;
  select count(*) into n from public.club_players p join ids on ids.k = 'club_a' and p.club_id = ids.v;
  if n <> 0 then raise exception 'FAIL: B can see Club A players'; end if;
  select count(*) into n from public.club_matches m join ids on ids.k = 'club_a' and m.club_id = ids.v;
  if n <> 0 then raise exception 'FAIL: B can see Club A matches'; end if;
  select count(*) into n from public.tournaments t join ids on ids.k = 'club_a' and t.club_id = ids.v;
  if n <> 0 then raise exception 'FAIL: B can see Club A tournaments'; end if;
  -- B must not be able to change Club A.
  update public.club_matches set winner = 'B' where club_id = (select v from ids where k = 'club_a');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed a Club A match'; end if;
  begin
    insert into public.club_players (club_id, name) select v, 'Intruder' from ids where k = 'club_a';
    raise exception 'FAIL: B added a player to Club A';
  exception when insufficient_privilege then null; end;
  -- B can't read pending email claims.
  select count(*) into n from public.club_claims;
  if n <> 0 then raise exception 'FAIL: claims are readable'; end if;
  -- B sees their own club.
  select count(*) into n from public.clubs;
  if n <> 1 then raise exception 'FAIL: B should see exactly one club, saw %', n; end if;
end $$;

-- C joins Club A with the invite code, as a player.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","email":"rls-c@example.test","role":"authenticated"}', true);
do $$
declare code text; n int;
begin
  -- The invite code is only known to members, so read it as the owner would share it.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","email":"rls-a@example.test","role":"authenticated"}', true);
  select invite_code into code from public.clubs where id = (select v from ids where k = 'club_a');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","email":"rls-c@example.test","role":"authenticated"}', true);
  perform public.join_club(code, null, 'Cara');
  select count(*) into n from public.club_matches;
  if n <> 1 then raise exception 'FAIL: a member should see their club''s match'; end if;
  -- A player can't score matches.
  update public.club_matches set winner = 'B';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a player changed a match score'; end if;
  -- A player can't make themselves admin.
  begin
    perform public.set_member_role((select v from ids where k = 'club_a'), '00000000-0000-4000-8000-00000000000c', 'admin');
    raise exception 'FAIL: a player changed a role';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- A player can't change another player's sharing.
  begin
    perform public.set_my_sharing((select id from public.club_players where name = 'Pat'), '{"record":true}');
    raise exception 'FAIL: changed someone else''s sharing';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- Anyone (not signed in) can read published results: names and scores only.
reset role;
set local role anon;
do $$
declare r jsonb; slug text; n int;
begin
  select count(*) into n from public.clubs;
  if n <> 0 then raise exception 'FAIL: anonymous visitor can read clubs'; end if;
end $$;
reset role;
do $$
declare r jsonb; s text;
begin
  select public_slug into s from public.tournaments where name = 'A Open';
  set local role anon;
  r := public.public_tournament(s);
  if r is null then raise exception 'FAIL: published results not readable'; end if;
  if r::text like '%dupr%' or r::text like '%user_id%' or r::text like '%email%' then raise exception 'FAIL: public results leak private fields'; end if;
end $$;

-- Scorer links: staff-only to see, PIN needed, wrong PINs counted and locked, scoped to the event/court.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","email":"rls-a@example.test","role":"authenticated"}', true);
update public.club_matches set tournament_id = (select id from public.tournaments where name = 'A Open'), court = 1, status = 'scheduled', winner = null, games = '[]';
insert into public.scorer_links (tournament_id, club_id, court, pin)
  select t.id, t.club_id, 1, '4321' from public.tournaments t where t.name = 'A Open';
insert into public.scorer_links (tournament_id, club_id, court, pin)
  select t.id, t.club_id, 2, '1111' from public.tournaments t where t.name = 'A Open';
select set_config('pq.tok1', (select token from public.scorer_links where court = 1), true);
select set_config('pq.tok2', (select token from public.scorer_links where court = 2), true);
select set_config('pq.match', (select id::text from public.club_matches limit 1), true);

-- B (another club) and C (a player in Club A) can't see the links or PINs.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","email":"rls-b@example.test","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.scorer_links;
  if n <> 0 then raise exception 'FAIL: another club can see scorer links'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","email":"rls-c@example.test","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.scorer_links;
  if n <> 0 then raise exception 'FAIL: a player can see scorer links'; end if;
end $$;

reset role;
set local role anon;
do $$
declare r jsonb; tok text := current_setting('pq.tok1'); mid uuid := current_setting('pq.match')::uuid;
begin
  -- The PIN checker itself isn't callable.
  begin
    perform public.scorer_check(tok, '4321');
    raise exception 'FAIL: scorer_check is callable directly';
  exception when insufficient_privilege then null; end;
  r := public.scorer_open(tok, '0000');
  if r ->> 'error' <> 'Wrong PIN' then raise exception 'FAIL: wrong PIN accepted: %', r; end if;
  r := public.scorer_open('not-a-token', '4321');
  if r ->> 'error' is null then raise exception 'FAIL: bad token accepted'; end if;
  r := public.scorer_open(tok, '4321');
  if r ? 'error' then raise exception 'FAIL: right PIN refused: %', r; end if;
  if jsonb_array_length(r -> 'matches') <> 1 then raise exception 'FAIL: court 1 should show 1 match'; end if;
  if r::text like '%dupr%' or r::text like '%user_id%' or r::text like '%email%' or r::text like '%"pin"%' then raise exception 'FAIL: scorer view leaks private fields'; end if;
  -- Bad shapes refused; a good score saves.
  r := public.scorer_save(tok, '4321', mid, '[{"a":"x","b":1}]', 'live', null, null);
  if r ->> 'error' is null then raise exception 'FAIL: bad score shape accepted'; end if;
  r := public.scorer_save(tok, '4321', mid, '[{"points":"AAAAAAAAAAA","a":11,"b":0}]', 'done', 'A', current_date);
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL: valid score refused: %', r; end if;
  -- Court 2's link can't touch court 1's match.
  r := public.scorer_save(current_setting('pq.tok2'), '1111', mid, '[]', 'live', null, null);
  if r ->> 'error' is null then raise exception 'FAIL: a court link scored another court'; end if;
  -- 8 wrong PINs lock the link, even for the right PIN.
  for i in 1..8 loop perform public.scorer_open(tok, '9999'); end loop;
  r := public.scorer_open(tok, '4321');
  if r ->> 'error' not like 'Too many wrong PINs%' then raise exception 'FAIL: lockout not applied: %', r; end if;
  -- Signed-out visitors still can't read tables directly.
  begin
    perform 1 from public.scorer_links;
    if found then raise exception 'FAIL: anonymous visitor can read scorer links'; end if;
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ declare s text; w text; begin
  select status, winner into s, w from public.club_matches limit 1;
  if s <> 'done' or w <> 'A' then raise exception 'FAIL: scorer save did not persist'; end if;
end $$;

-- Leaving a club removes membership; the owner can't leave.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","email":"rls-c@example.test","role":"authenticated"}', true);
do $$ declare n int; begin
  perform public.leave_club((select v from ids where k = 'club_a'));
  select count(*) into n from public.clubs;
  if n <> 0 then raise exception 'FAIL: still in the club after leaving'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","email":"rls-a@example.test","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.leave_club((select v from ids where k = 'club_a'));
    raise exception 'FAIL: the owner left their club';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

reset role;
select 'All Club mode security checks passed' as result;
rollback;
