-- Phase 3 Module 3: Player Studio claim, official history and private diary.
-- Rolls back; problems raise "FAIL: …".
begin;
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-0000000000d1', 'm3-owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000d2', 'm3-registrant@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000d3', 'm3-claimant@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000d4', 'm3-stranger@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ids (k text primary key, v uuid) on commit drop;
create temp table toks (k text primary key, v text) on commit drop;
grant all on ids, toks to authenticated;
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
insert into ids values ('club', public.create_club('M3 Club', 'Hyderabad', 'Owner'));
reset role;

-- A finished singles event: Asha (claim link) beat Bina (registered online), plus a doubles match and a cancelled event.
insert into ids values ('t', gen_random_uuid()), ('tx', gen_random_uuid()), ('d', gen_random_uuid()), ('dx', gen_random_uuid()),
  ('asha', gen_random_uuid()), ('bina', gen_random_uuid()), ('chet', gen_random_uuid()), ('sam', gen_random_uuid()),
  ('ea', gen_random_uuid()), ('eb', gen_random_uuid());
insert into public.tournaments (id, club_id, name, start_date, approval, status) values
  (pg_temp.id('t'), pg_temp.id('club'), 'Diwali Open', current_date - 3, 'approved', 'done'),
  (pg_temp.id('tx'), pg_temp.id('club'), 'Rained Off', current_date - 2, 'approved', 'live');
insert into public.divisions (id, tournament_id, club_id, name, kind, format, pools, advance) values
  (pg_temp.id('d'), pg_temp.id('t'), pg_temp.id('club'), 'Men''s singles', 'singles', '{"pointsTo":11,"bestOf":1}', 1, 0),
  (pg_temp.id('dx'), pg_temp.id('tx'), pg_temp.id('club'), 'Open', 'singles', '{"pointsTo":11,"bestOf":1}', 1, 0);
insert into public.club_players (id, club_id, name) values
  (pg_temp.id('asha'), pg_temp.id('club'), 'Asha Rao'), (pg_temp.id('bina'), pg_temp.id('club'), 'Bina Shah'),
  (pg_temp.id('chet'), pg_temp.id('club'), 'Chet Iyer');
insert into public.club_players (id, club_id, name, sample) values (pg_temp.id('sam'), pg_temp.id('club'), 'Sample Sam', true);
insert into public.entries (id, division_id, club_id, player_ids) values
  (pg_temp.id('ea'), pg_temp.id('d'), pg_temp.id('club'), array[pg_temp.id('asha')]),
  (pg_temp.id('eb'), pg_temp.id('d'), pg_temp.id('club'), array[pg_temp.id('bina')]);
insert into public.registrations (tournament_id, division_id, club_id, user_id, source, players, status, entry_id) values
  (pg_temp.id('t'), pg_temp.id('d'), pg_temp.id('club'), '00000000-0000-4000-8000-0000000000d2', 'online', '[{"name":"Bina Shah","phone":"9000000001","gender":"f","age":30}]', 'accepted', pg_temp.id('eb'));
insert into public.club_matches (club_id, tournament_id, division_id, stage, side_a, side_b, format, games, status, winner, played_on) values
  (pg_temp.id('club'), pg_temp.id('t'), pg_temp.id('d'), 'pool', array[pg_temp.id('asha')], array[pg_temp.id('bina')], '{"pointsTo":11}', '[{"a":11,"b":7,"points":"AAB"}]', 'done', 'A', current_date - 3),
  (pg_temp.id('club'), pg_temp.id('t'), pg_temp.id('d'), 'final', array[pg_temp.id('chet')], array[pg_temp.id('asha')], '{"pointsTo":11}', '[{"a":11,"b":9}]', 'done', 'A', current_date - 3),
  (pg_temp.id('club'), pg_temp.id('t'), pg_temp.id('d'), 'pool', array[pg_temp.id('asha')], array[pg_temp.id('chet')], '{"pointsTo":11}', '[]', 'scheduled', null, null),
  (pg_temp.id('club'), pg_temp.id('tx'), pg_temp.id('dx'), 'pool', array[pg_temp.id('asha')], array[pg_temp.id('chet')], '{"pointsTo":11}', '[{"a":11,"b":2}]', 'done', 'A', current_date - 2);
update public.tournaments set cancelled_at = now(), cancel_reason = 'Rain' where id = pg_temp.id('tx');
set local role authenticated;

do $$ declare j jsonb; tok text; begin
  -- Only the club's organisers can make a claim link; asking twice gives the same link; samples can't be claimed.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
  begin perform public.studio_claim_link(pg_temp.id('asha')); raise exception 'FAIL: stranger made a claim link';
  exception when others then if sqlerrm not like 'Only the club%' then raise; end if; end;
  begin perform 1 from public.player_claim_links; raise exception 'FAIL: claim links readable';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
  tok := public.studio_claim_link(pg_temp.id('asha')) ->> 'token';
  if tok is null or length(tok) < 32 then raise exception 'FAIL: no claim token'; end if;
  if public.studio_claim_link(pg_temp.id('asha')) ->> 'token' <> tok then raise exception 'FAIL: a second link was made'; end if;
  begin perform public.studio_claim_link(pg_temp.id('sam')); raise exception 'FAIL: sample player link';
  exception when others then if sqlerrm not like 'Sample players%' then raise; end if; end;
  insert into toks values ('asha', tok);

  -- The claimant previews: two finished matches (the cancelled event and the unplayed match don't count), one win.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d3');
  j := public.studio_claim_preview(tok);
  if j ->> 'name' <> 'Asha Rao' or (j ->> 'matches')::int <> 2 or (j ->> 'wins')::int <> 1 or j ->> 'club' <> 'M3 Club'
    then raise exception 'FAIL: preview wrong: %', j; end if;
  if public.studio_claim_preview('not-a-token') ->> 'error' is null then raise exception 'FAIL: bad token previewed'; end if;
  if jsonb_array_length(public.studio_official_history()) <> 0 then raise exception 'FAIL: history before claiming'; end if;

  -- Claim. The claimant is linked but is not a club member and can't read the roster.
  j := public.studio_claim(tok, null, false);
  if (select user_id from public.club_players where id = pg_temp.id('asha')) is distinct from null then raise exception 'FAIL: claimant can read the roster'; end if;
  if public.is_member(pg_temp.id('club')) then raise exception 'FAIL: claiming made a club member'; end if;
  if jsonb_array_length(public.studio_my_players()) <> 1 then raise exception 'FAIL: my players missing'; end if;
  if (select use_official from public.player_studio_settings) then raise exception 'FAIL: stats choice not kept'; end if;
  j := public.studio_official_history();
  if jsonb_array_length(j) <> 2 then raise exception 'FAIL: history has % matches', jsonb_array_length(j); end if;
  if j::text like '%9000000001%' or j::text like '%dupr%' then raise exception 'FAIL: history leaks private fields'; end if;
  if not exists (select 1 from jsonb_array_elements(j) x where x ->> 'stage' = 'final' and x ->> 'my_side' = 'B' and x ->> 'winner' = 'A')
    then raise exception 'FAIL: final missing or wrong side'; end if;

  -- The same link can't be used again by someone else; a stranger sees no history.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
  begin perform public.studio_claim(tok, null, true); raise exception 'FAIL: link used twice';
  exception when others then if sqlerrm not like 'This claim link isn%' then raise; end if; end;
  if jsonb_array_length(public.studio_official_history()) <> 0 then raise exception 'FAIL: stranger sees history'; end if;
  -- A stranger can't claim by player id without their own registration.
  begin perform public.studio_claim(null, pg_temp.id('bina'), true); raise exception 'FAIL: claimed someone else by id';
  exception when others then if sqlerrm not like 'You can only claim yourself%' then raise; end if; end;
  begin perform public.studio_unclaim(pg_temp.id('asha')); raise exception 'FAIL: stranger unclaimed';
  exception when others then if sqlerrm not like 'That isn%' then raise; end if; end;

  -- The registrant is found from their own online registration and claims without a link.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d2');
  j := public.studio_found_players();
  if jsonb_array_length(j) <> 1 or j -> 0 ->> 'name' <> 'Bina Shah' or (j -> 0 ->> 'matches')::int <> 1 then raise exception 'FAIL: found players wrong: %', j; end if;
  perform public.studio_claim(null, pg_temp.id('bina'), true);
  if jsonb_array_length(public.studio_found_players()) <> 0 then raise exception 'FAIL: still listed after claiming'; end if;
  -- One account, one player per club.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
  tok := public.studio_claim_link(pg_temp.id('chet')) ->> 'token';
  if (public.studio_claim_link(pg_temp.id('bina')) ->> 'claimed')::boolean is not true then raise exception 'FAIL: claimed player got a link'; end if;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d2');
  begin perform public.studio_claim(tok, null, true); raise exception 'FAIL: two players at one club';
  exception when others then if sqlerrm not like 'Your account is already linked%' then raise; end if; end;

  -- "Not me" undoes a claim.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d3');
  perform public.studio_unclaim(pg_temp.id('asha'));
  if jsonb_array_length(public.studio_official_history()) <> 0 then raise exception 'FAIL: history kept after unclaim'; end if;
end $$;

-- Diary: private, valid, and no tournament matches.
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d3');
  insert into public.player_studio_sessions (session_on, kind, minutes, drills, ratings, note)
    values (current_date, 'solo', 45, '[{"category":"Dinks","made":18,"attempts":25}]', '{"Serve":4}', 'Good hands');
  insert into public.player_studio_sessions (session_on, kind, minutes) values (current_date - 1, 'rest', 0);
  begin insert into public.player_studio_sessions (session_on, kind, minutes) values (current_date, 'rest', 30); raise exception 'FAIL: rest day with minutes';
  exception when check_violation then null; end;
  begin insert into public.player_studio_sessions (session_on, kind, minutes, drills) values (current_date, 'solo', 30, '[{"category":"Dinks","made":30,"attempts":25}]'); raise exception 'FAIL: made more than tries';
  exception when check_violation then null; end;
  begin insert into public.player_studio_sessions (session_on, kind, minutes, ratings) values (current_date, 'solo', 30, '{"Serve":7}'); raise exception 'FAIL: rating out of range';
  exception when check_violation then null; end;
  begin insert into public.player_studio_logs (kind, played_on, opponents, score_for, score_against) values ('tournament', current_date, 'Someone', 11, 4); raise exception 'FAIL: tournament match logged';
  exception when check_violation then null; end;
  insert into public.player_studio_logs (kind, played_on, opponents, score_for, score_against) values ('casual', current_date, 'Friend', 11, 4);
  insert into public.player_studio_logs (kind, played_on, opponents, score_for, score_against, match_type, games, energy, shot_ratings, setting, opponent_strength)
    values ('practice', current_date, 'Ravi & Meena', 2, 1, 'mixed', '[{"you":11,"them":8},{"you":7,"them":11},{"you":11,"them":9}]', 4, '{"Dink":3}', 'outdoor', 'stronger');
  begin insert into public.player_studio_logs (kind, played_on, opponents, score_for, score_against, games) values ('casual', current_date, 'X', 1, 0, '[{"you":120,"them":1}]'); raise exception 'FAIL: game score out of range';
  exception when check_violation then null; end;
  begin insert into public.player_studio_logs (kind, played_on, opponents, score_for, score_against, energy) values ('casual', current_date, 'X', 11, 3, 9); raise exception 'FAIL: energy out of range';
  exception when check_violation then null; end;
  -- DUPR readings: own only, 1 to 8.
  insert into public.player_studio_ratings (kind, value, rated_on) values ('singles', 3.512, current_date), ('doubles', 3.8, current_date - 30);
  begin insert into public.player_studio_ratings (kind, value, rated_on) values ('singles', 9.1, current_date); raise exception 'FAIL: rating above 8';
  exception when check_violation then null; end;
  begin insert into public.player_studio_ratings (kind, value, rated_on) values ('mixed', 3.1, current_date); raise exception 'FAIL: rating kind';
  exception when check_violation then null; end;
  begin insert into public.player_studio_sessions (owner_id, session_on, kind, minutes) values ('00000000-0000-4000-8000-0000000000d4', current_date, 'solo', 10); raise exception 'FAIL: wrote someone else''s diary';
  exception when insufficient_privilege then null; end;

  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d4');
  select count(*) into n from public.player_studio_sessions; if n <> 0 then raise exception 'FAIL: stranger reads sessions'; end if;
  select count(*) into n from public.player_studio_logs; if n <> 0 then raise exception 'FAIL: stranger reads logs'; end if;
  select count(*) into n from public.player_studio_ratings; if n <> 0 then raise exception 'FAIL: stranger reads ratings'; end if;
  delete from public.player_studio_sessions;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d3');
  select count(*) into n from public.player_studio_sessions; if n <> 2 then raise exception 'FAIL: stranger deleted sessions'; end if;
  delete from public.player_studio_sessions; delete from public.player_studio_logs;
  select count(*) into n from public.player_studio_sessions; if n <> 0 then raise exception 'FAIL: own diary not deleted'; end if;
end $$;

-- Signed-out visitors can't call any Player Studio function.
reset role;
set local role anon;
do $$ begin
  begin perform public.studio_official_history(); raise exception 'FAIL: anon read history';
  exception when insufficient_privilege then null; end;
  begin perform public.studio_claim_preview('x'); raise exception 'FAIL: anon previewed';
  exception when insufficient_privilege then null; end;
end $$;
select 'phase3_m3 ok';
rollback;
