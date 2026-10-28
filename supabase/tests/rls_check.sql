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

reset role;
select 'All Club mode security checks passed' as result;
rollback;
