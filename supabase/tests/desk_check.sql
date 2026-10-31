-- Referee PIN vs desk access (club_mode_18_desk_access). Runs inside a transaction and rolls back. Expected: no row says FAIL.
-- Users: O organiser (club owner), P a player in the same club, X owner of another club, H an old desk-team account (coach made by
-- the old PIN sign-in). Then the desk itself, as a visitor with no account.
begin;
create temp table out (step int, result text) on commit drop;
create temp table ids (k text primary key, v uuid) on commit drop;
create temp table vals (k text primary key, v text) on commit drop;
grant all on out, ids, vals to authenticated, anon;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'desk-o@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000e2', 'desk-p@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000e3', 'desk-x@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000e4', 'pq-helper-test@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(key text) returns uuid language sql as $$ select v from ids where k = key $$;
create function pg_temp.val(key text) returns text language sql as $$ select v from vals where k = key $$;
grant execute on function pg_temp.id(text), pg_temp.val(text) to authenticated, anon;

-- O makes a club, PaddleQ approves it; X makes another club.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
insert into ids values ('club', public.create_club('Desk Club', 'Pune', 'Olga'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
insert into ids values ('club_x', public.create_club('Other Club', 'Goa', 'Xavi'));
reset role;
update public.clubs set hosting = 'approved' where id in (select v from ids);
-- P joins O's club as a player; H is an old desk-team account (a coach, as the old sign-in made them).
insert into public.club_members (club_id, user_id, role) values
  (pg_temp.id('club'), '00000000-0000-4000-8000-0000000000e2', 'player'),
  (pg_temp.id('club'), '00000000-0000-4000-8000-0000000000e4', 'coach');

-- O's tournament: doubles, 2 courts, 4 teams in one pool, a registration with a phone number, and a tournament in X's club.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
with x as (insert into public.tournaments (club_id, name, start_date, courts, status, is_public, contact, upi_id)
  select pg_temp.id('club'), 'Desk Open', current_date, 2, 'live', true, '+91 98000 11111', 'olga@upi' returning id)
  insert into ids select 't', id from x;
with x as (insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance)
  values (pg_temp.id('t'), pg_temp.id('club'), 'Open Doubles', 'doubles', '{"pool":{"pointsTo":11,"bestOf":1,"scoring":"sideout"},"ko":{"pointsTo":11,"bestOf":1,"scoring":"sideout"}}', 1, 2) returning id)
  insert into ids select 'div', id from x;
do $$
declare i int; p uuid;
begin
  for i in 1..10 loop
    insert into public.club_players (club_id, name, dupr_doubles) values (pg_temp.id('club'), 'Desk Player ' || i, 3.5) returning id into p;
    insert into ids values ('p' || i, p);
  end loop;
  for i in 1..4 loop
    insert into public.entries (id, division_id, club_id, player_ids, seed, pool)
      values (gen_random_uuid(), pg_temp.id('div'), pg_temp.id('club'), array[pg_temp.id('p' || (2 * i - 1)), pg_temp.id('p' || (2 * i))], i, 1) returning id into p;
    insert into ids values ('e' || i, p);
  end loop;
  insert into public.club_matches (club_id, tournament_id, division_id, stage, pool, round, slot, court, entry_a, entry_b, side_a, side_b, format)
    values (pg_temp.id('club'), pg_temp.id('t'), pg_temp.id('div'), 'pool', 1, 1, 0, 1, pg_temp.id('e1'), pg_temp.id('e2'),
      array[pg_temp.id('p1'), pg_temp.id('p2')], array[pg_temp.id('p3'), pg_temp.id('p4')], '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}') returning id into p;
  insert into ids values ('m1', p);
  insert into public.club_matches (club_id, tournament_id, division_id, stage, pool, round, slot, court, entry_a, entry_b, side_a, side_b, format)
    values (pg_temp.id('club'), pg_temp.id('t'), pg_temp.id('div'), 'pool', 1, 1, 0, 2, pg_temp.id('e3'), pg_temp.id('e4'),
      array[pg_temp.id('p5'), pg_temp.id('p6')], array[pg_temp.id('p7'), pg_temp.id('p8')], '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}') returning id into p;
  insert into ids values ('m2', p);
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status, payment)
    values (pg_temp.id('t'), pg_temp.id('div'), pg_temp.id('club'), 'offline',
      '[{"name":"Phone Person","phone":"9876501234","gender":"m","age":30,"dupr":3.4,"duprId":""},{"name":"Second Person","phone":"9876505678","gender":"f","age":31,"dupr":3.2,"duprId":""}]', 'accepted', 'paid');
  insert into public.scorer_links (tournament_id, club_id, court) values (pg_temp.id('t'), pg_temp.id('club'), 1);
end $$;
insert into vals select 'court_token', token from public.scorer_links where tournament_id = pg_temp.id('t');

do $$
declare
  a jsonb := public.tournament_access(pg_temp.id('t'));
  r text; ok boolean;
begin
  insert into out values (1, case when a ->> 'referee_pin' ~ '^[0-9]{4}$' and a ->> 'desk_pin' ~ '^[0-9]{6}$' and a ->> 'referee_pin' <> a ->> 'desk_pin'
    and char_length(a ->> 'desk_token') >= 30 then 'new tournament: a 4-digit referee PIN, a separate 6-digit desk PIN and a desk link'
    else 'FAIL access ' || a::text end);
  begin perform public.set_desk_pin(pg_temp.id('t'), a ->> 'referee_pin'); insert into out values (2, 'FAIL desk PIN may equal the referee PIN');
  exception when others then insert into out values (2, 'desk PIN can''t be the referee PIN'); end;
  begin perform public.set_event_pin(pg_temp.id('t'), a ->> 'desk_pin'); insert into out values (3, 'FAIL referee PIN may equal the desk PIN');
  exception when others then insert into out values (3, 'referee PIN can''t be the desk PIN'); end;
  begin perform public.set_desk_pin(pg_temp.id('t'), '1234'); insert into out values (4, 'FAIL weak desk PIN allowed');
  exception when others then insert into out values (4, 'easy desk PIN (1234) refused'); end;
  begin perform public.set_event_pin(pg_temp.id('t'), '1111'); insert into out values (5, 'FAIL weak referee PIN allowed');
  exception when others then insert into out values (5, 'easy referee PIN (1111) refused'); end;
  r := public.set_event_pin(pg_temp.id('t'), '4371');
  ok := (select bool_and(pin = '4371') from public.scorer_links where tournament_id = pg_temp.id('t'));
  insert into out values (6, case when r = '4371' and ok then 'organiser sets the referee PIN; every court link uses it' else 'FAIL set referee PIN' end);
  r := public.set_desk_pin(pg_temp.id('t'), '583920');
  insert into out values (7, case when r = '583920' then 'organiser sets the desk PIN' else 'FAIL set desk PIN' end);
  r := public.set_desk_pin(pg_temp.id('t'));
  insert into out values (8, case when r ~ '^[0-9]{6}$' and r <> '4371' and not public.weak_pin(r) then 'New PIN for the desk: random, 6 digits' else 'FAIL random desk PIN ' || r end);
  perform public.set_desk_pin(pg_temp.id('t'), '583920');
  insert into vals values ('old_token', a ->> 'desk_token');
  insert into vals values ('token', public.new_desk_link(pg_temp.id('t')));
  insert into out values (9, case when pg_temp.val('token') <> pg_temp.val('old_token') then 'New desk link replaces the old one' else 'FAIL new link' end);
end $$;

-- A player in the club and another club's owner can't see or change the PINs or the desk link.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
do $$
declare a jsonb := public.tournament_access(pg_temp.id('t')); n int;
begin
  select count(*) into n from public.tournament_desks;
  insert into out values (10, case when a ? 'error' and n = 0 then 'a player sees no PINs and no desk link' else 'FAIL player sees access' end);
  begin perform public.set_desk_pin(pg_temp.id('t'), '602817'); insert into out values (11, 'FAIL player changed the desk PIN');
  exception when others then insert into out values (11, 'a player can''t change the desk PIN'); end;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
do $$
begin
  begin perform public.new_desk_link(pg_temp.id('t')); insert into out values (12, 'FAIL another club changed the desk link');
  exception when others then insert into out values (12, 'another club can''t change the desk link'); end;
  begin perform public.set_event_pin(pg_temp.id('t'), '602817'); insert into out values (13, 'FAIL another club changed the referee PIN');
  exception when others then insert into out values (13, 'another club can''t change the referee PIN'); end;
end $$;

-- The old desk-team account (a coach made by the old PIN sign-in) has no club rights at all now.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e4');
reset role;
insert into public.club_helpers (user_id, club_id, tournament_id, name) values ('00000000-0000-4000-8000-0000000000e4', pg_temp.id('club'), pg_temp.id('t'), 'Old Desk');
set local role authenticated;
do $$
declare n int; m int; k int;
begin
  select count(*) into n from public.registrations;
  select count(*) into m from public.tournaments;
  select count(*) into k from public.clubs;
  insert into out values (14, case when n = 0 and m = 0 and k = 0 and not public.is_staff(pg_temp.id('club')) and public.club_role(pg_temp.id('club')) is null
    then 'old desk-team account: no phones, tournaments or club rights' else format('FAIL old helper sees regs %s tournaments %s clubs %s', n, m, k) end);
  update public.club_matches set winner = 'B' where tournament_id = pg_temp.id('t');
  get diagnostics n = row_count;
  insert into out values (15, case when n = 0 then 'old desk-team account can''t change matches' else 'FAIL old helper changed matches' end);
end $$;

-- The desk: a visitor with the desk link and desk PIN.
reset role;
set local role anon;
do $$
declare
  tok text := pg_temp.val('token');
  r jsonb; n int; s text;
begin
  r := public.desk_open(tok, '4371');
  insert into out values (16, case when r ->> 'error' = 'Wrong desk PIN' then 'the referee PIN doesn''t open the desk' else 'FAIL ' || r::text end);
  r := public.desk_open(pg_temp.val('old_token'), '583920');
  insert into out values (17, case when r ->> 'error' like 'This desk link isn%' then 'the old desk link no longer works' else 'FAIL ' || r::text end);
  r := public.scorer_open(pg_temp.val('court_token'), '583920');
  insert into out values (18, case when r ->> 'error' = 'Wrong PIN' then 'the desk PIN doesn''t open a court link' else 'FAIL ' || r::text end);
  r := public.desk_open(tok, '583920');
  s := r::text;
  insert into out values (19, case when r ->> 'error' is null and r -> 'tournament' ->> 'name' = 'Desk Open' and jsonb_array_length(r -> 'matches') = 2
    and jsonb_array_length(r -> 'entries') = 4 and jsonb_array_length(r -> 'players') >= 10 and r -> 'club' ->> 'name' = 'Desk Club'
    then 'desk PIN opens this tournament''s desk' else 'FAIL desk open ' || left(s, 200) end);
  insert into out values (20, case when s !~* '98765|98000|phone|email|user_id|invite_code|claim_code|hosting|contact|upi|updated_by|"pin"|olga@'
    then 'desk sees no phone numbers, emails, accounts, codes, contact or UPI' else 'FAIL desk view leaks private fields' end);
  r := public.desk_label(tok);
  insert into out values (21, case when r ->> 'club' = 'Desk Club' and r ->> 'tournament' = 'Desk Open' and public.desk_label('short') is null
    then 'desk sign-in page shows the club and tournament names only' else 'FAIL label ' || coalesce(r::text, 'null') end);
  r := public.desk_save_score(tok, '583920', pg_temp.id('m1'), '[{"points":"AAAAAAAAAAA","a":11,"b":0}]', 'done', 'A', current_date);
  select m ->> 'winner' into s from jsonb_array_elements(public.desk_open(tok, '583920') -> 'matches') m where m ->> 'id' = pg_temp.id('m1')::text;
  insert into out values (22, case when (r ->> 'ok')::boolean and s = 'A' then 'desk saves a score' else 'FAIL desk score ' || r::text end);
  r := public.desk_save_score(tok, '583920', pg_temp.id('m2'), '[{"a":"x","b":1}]', 'live', null, null);
  insert into out values (23, case when r ? 'error' then 'desk: bad score shape refused' else 'FAIL bad shape saved' end);
  r := public.desk_patch_matches(tok, '583920', jsonb_build_array(jsonb_build_object('id', pg_temp.id('m2'), 'patch', jsonb_build_object('court', 1))));
  insert into out values (24, case when (r ->> 'ok')::boolean then 'desk moves a match to another court' else 'FAIL move ' || r::text end);
  begin
    perform public.desk_patch_matches(tok, '583920', jsonb_build_array(jsonb_build_object('id', pg_temp.id('m2'), 'patch', jsonb_build_object('court', 9))));
    insert into out values (25, 'FAIL court 9 of 2 allowed');
  exception when others then insert into out values (25, 'desk can''t send a match to a court that doesn''t exist'); end;
  r := public.desk_patch_matches(tok, '583920', jsonb_build_array(jsonb_build_object('id', pg_temp.id('m2'), 'patch', jsonb_build_object('status', 'done', 'winner', 'B', 'games', '[]'::jsonb))));
  insert into out values (26, case when (r ->> 'ok')::boolean then 'desk gives a walkover' else 'FAIL walkover ' || r::text end);
  r := public.desk_add_player(tok, '583920', '  Walk   In  ', 3.1);
  insert into ids values ('walk', (r ->> 'id')::uuid);
  insert into out values (27, case when r ->> 'name' = 'Walk In' and r::text !~ 'claim_code|user_id' then 'desk adds a walk-in player (name and rating only)' else 'FAIL walk-in ' || r::text end);
  r := public.desk_add_entry(tok, '583920', jsonb_build_object('id', gen_random_uuid(), 'division_id', pg_temp.id('div'),
    'player_ids', jsonb_build_array(pg_temp.id('walk'), pg_temp.id('p9')), 'seed', 5, 'pool', 1));
  insert into ids values ('e5', (r ->> 'id')::uuid);
  insert into out values (28, case when (r ->> 'ok')::boolean then 'desk adds a late entry' else 'FAIL late entry ' || r::text end);
  begin
    perform public.desk_add_entry(tok, '583920', jsonb_build_object('division_id', pg_temp.id('div'), 'player_ids', jsonb_build_array(pg_temp.id('p9'), pg_temp.id('p10'))));
    insert into out values (29, 'FAIL a player entered twice');
  exception when others then insert into out values (29, 'a player already in the event can''t be entered again'); end;
  r := public.desk_add_matches(tok, '583920', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'division_id', pg_temp.id('div'), 'stage', 'pool',
    'pool', 1, 'round', 4, 'slot', 5, 'court', 2, 'entry_a', pg_temp.id('e5'), 'entry_b', pg_temp.id('e1'), 'side_a', jsonb_build_array(pg_temp.id('walk'), pg_temp.id('p9')),
    'side_b', jsonb_build_array(pg_temp.id('p1'), pg_temp.id('p2')), 'format', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}'::jsonb, 'games', '[]'::jsonb, 'status', 'scheduled')));
  insert into out values (30, case when (r ->> 'ok')::boolean then 'desk adds the late entry''s matches' else 'FAIL add matches ' || r::text end);
  r := public.desk_update_entry(tok, '583920', pg_temp.id('e5'), '{"status":"withdrawn"}');
  insert into out values (31, case when (r ->> 'ok')::boolean then 'desk withdraws an entry' else 'FAIL withdraw ' || r::text end);
  -- Two screens drawing the same semi-final at once: only one copy is kept.
  for n in 1..2 loop
    perform public.desk_add_matches(tok, '583920', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'division_id', pg_temp.id('div'), 'stage', 'sf',
      'round', 1, 'bracket_pos', 0, 'entry_a', pg_temp.id('e1'), 'entry_b', pg_temp.id('e4'), 'side_a', jsonb_build_array(pg_temp.id('p1'), pg_temp.id('p2')),
      'side_b', jsonb_build_array(pg_temp.id('p7'), pg_temp.id('p8')), 'format', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}'::jsonb, 'status', 'scheduled')));
  end loop;
  r := public.desk_open(tok, '583920');
  select count(*) into n from jsonb_array_elements(r -> 'matches') m where m ->> 'stage' = 'sf';
  insert into out values (32, case when n = 1 then 'a knockout match drawn twice at once is kept once' else 'FAIL semi-finals: ' || n end);
end $$;

-- What the desk can't do: other tournaments, PIN checks, the tables themselves.
do $$
declare tok text := pg_temp.val('token'); r jsonb; n int;
begin
  begin perform public.desk_check(tok, '583920'); insert into out values (33, 'FAIL desk_check is callable');
  exception when insufficient_privilege then insert into out values (33, 'the desk PIN checker isn''t callable directly'); end;
  begin perform public.tournament_access(pg_temp.id('t')); insert into out values (34, 'FAIL visitor can call tournament_access');
  exception when insufficient_privilege then insert into out values (34, 'visitors can''t ask for the PINs'); end;
  begin perform 1 from public.tournament_desks; get diagnostics n = row_count; insert into out values (35, case when n = 0 then 'visitors read no desk links' else 'FAIL visitor reads desk links' end);
  exception when insufficient_privilege then insert into out values (35, 'visitors can''t read desk links'); end;
  begin perform 1 from public.registrations; get diagnostics n = row_count; insert into out values (36, case when n = 0 then 'visitors read no registrations' else 'FAIL visitor reads registrations' end);
  exception when insufficient_privilege then insert into out values (36, 'visitors can''t read registrations'); end;
end $$;

-- A match in another club's tournament can't be touched with this desk link.
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
do $$
declare t uuid; m uuid;
begin
  insert into public.tournaments (club_id, name, start_date, status) values (pg_temp.id('club_x'), 'X Open', current_date, 'live') returning id into t;
  insert into public.club_matches (club_id, tournament_id, stage, side_a, side_b, format) values (pg_temp.id('club_x'), t, 'friendly', '{}', '{}', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}') returning id into m;
  insert into ids values ('xm', m);
end $$;
reset role;
set local role anon;
do $$
declare tok text := pg_temp.val('token'); r jsonb; i int;
begin
  r := public.desk_save_score(tok, '583920', pg_temp.id('xm'), '[]', 'live', null, null);
  insert into out values (37, case when r ->> 'error' like 'This match isn%' then 'desk can''t score another tournament''s match' else 'FAIL ' || r::text end);
  begin
    perform public.desk_patch_matches(tok, '583920', jsonb_build_array(jsonb_build_object('id', pg_temp.id('xm'), 'patch', jsonb_build_object('status', 'void'))));
    insert into out values (38, 'FAIL desk changed another tournament''s match');
  exception when others then insert into out values (38, 'desk can''t change another tournament''s match'); end;
  -- Five wrong desk PINs lock the link, even for the right PIN.
  for i in 1..5 loop perform public.desk_open(tok, '000000'); end loop;
  r := public.desk_open(tok, '583920');
  insert into out values (39, case when r ->> 'error' like 'Too many wrong PINs%' then 'desk link locks after 5 wrong PINs' else 'FAIL no lockout ' || r::text end);
end $$;

-- The organiser's New PIN clears the lock; marking the tournament finished ends desk access.
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select public.set_desk_pin(pg_temp.id('t'), '583920');
update public.tournaments set status = 'done' where id = pg_temp.id('t');
reset role;
set local role anon;
do $$
declare r jsonb;
begin
  r := public.desk_open(pg_temp.val('token'), '583920');
  insert into out values (40, case when r ->> 'error' like 'This tournament is finished%' then 'desk access ends when the tournament is marked finished' else 'FAIL ' || r::text end);
end $$;

-- PaddleQ admins see and change both PINs (Admin → Events), and the old helper sign-in now points to the desk link.
reset role;
set local role authenticated;
select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
do $$
declare a jsonb; j jsonb;
begin
  a := public.tournament_access(pg_temp.id('t'));
  select x into j from jsonb_array_elements(public.admin_tournaments()) x where x ->> 'id' = pg_temp.id('t')::text;
  insert into out values (41, case when a ->> 'desk_pin' = '583920' and j ->> 'desk_pin' = '583920' and j ->> 'event_pin' = '4371'
    then 'PaddleQ admins see both PINs' else 'FAIL admin access ' || coalesce(a::text, '') end);
end $$;
reset role;
do $$
declare r jsonb := public.helper_pin_check((select public_slug from public.tournaments where id = pg_temp.id('t')), '4371');
begin
  insert into out values (42, case when r ->> 'error' like 'The desk now has its own link%' then 'old desk sign-in points to the new desk link (no account made)' else 'FAIL ' || r::text end);
end $$;

select step, result from out order by step;
rollback;
