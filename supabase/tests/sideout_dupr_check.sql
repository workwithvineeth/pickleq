-- Side-out rallies and public DUPR (20261112060000_sideout_rallies_public_dupr). Runs as the database owner to set up a
-- small approved tournament, then as a visitor and as a referee link. Rolls back. Expected: no row says FAIL.
begin;
create temp table out (step int, result text) on commit drop;
create temp table ids (k text primary key, v text) on commit drop;
grant all on out, ids to authenticated, anon;

do $$
declare
  c uuid := (select id from public.clubs where name = 'Pickleyard');
  t uuid; d uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; ea uuid; eb uuid; m uuid; tok text; pin text;
begin
  insert into public.tournaments (club_id, name, start_date, status, is_public, approval) values (c, 'Sideout Rollback', current_date, 'live', true, 'approved') returning id into t;
  insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance) values (t, c, 'Open Doubles', 'doubles', '{"bestOf":3,"pointsTo":11}', 1, 2) returning id into d;
  insert into public.club_players (club_id, name, dupr_doubles, dupr_singles) values (c, 'Asha Rollback', 4.20, 3.10) returning id into p1;
  insert into public.club_players (club_id, name, dupr_doubles) values (c, 'Lata Rollback', null) returning id into p2;
  insert into public.club_players (club_id, name, dupr_doubles) values (c, 'Gita Rollback', 3.95) returning id into p3;
  insert into public.club_players (club_id, name, dupr_doubles) values (c, 'Rekha Rollback', 4.05) returning id into p4;
  insert into public.entries (division_id, club_id, player_ids, pool) values (d, c, array[p1, p2], 1) returning id into ea;
  insert into public.entries (division_id, club_id, player_ids, pool) values (d, c, array[p3, p4], 1) returning id into eb;
  insert into public.club_matches (club_id, tournament_id, division_id, stage, pool, court, entry_a, entry_b, format, status, games)
    values (c, t, d, 'pool', 1, 1, ea, eb, '{"bestOf":3,"pointsTo":11}', 'live', '[{"a":2,"b":0,"points":"AA","rallies":"BAABA","serve":"A","mode":"sideout"}]') returning id into m;
  insert into public.scorer_links (tournament_id, club_id, court) values (t, c, 1) returning token into tok;
  select tp.pin into pin from public.tournament_pins tp where tp.tournament_id = t;
  insert into ids values ('slug', (select public_slug from public.tournaments where id = t)), ('m', m::text), ('tok', tok), ('pin', pin);

  insert into out values (1, case when public.score_problem('[{"a":3,"b":1,"points":"AABA","rallies":"BAABBA","serve":"A","mode":"sideout"}]') is null then 'side-out game with rallies is accepted' else 'FAIL side-out game refused' end);
  insert into out values (2, case when public.score_problem('[{"a":3,"b":1,"points":"AABA","mode":"rally"}]') is null then 'rally-scoring game is accepted' else 'FAIL rally game refused' end);
  insert into out values (3, case when public.score_problem('[{"a":3,"b":1,"points":"AABA"}]') is null then 'old games (no rallies) still accepted' else 'FAIL old games refused' end);
  insert into out values (4, case when public.score_problem('[{"a":1,"b":0,"points":"A","rallies":"AxB"}]') is not null then 'bad rally letters refused' else 'FAIL bad rallies allowed' end);
  insert into out values (5, case when public.score_problem(jsonb_build_array(jsonb_build_object('a',1,'b',0,'points','A','rallies',repeat('A',601)))) is not null then 'over-long rallies refused' else 'FAIL 601 rallies allowed' end);
  insert into out values (6, case when public.score_problem('[{"a":1,"b":0,"points":"A","mode":"tennis"}]') is not null and public.score_problem('[{"a":1,"b":0,"points":"A","serve":"C"}]') is not null then 'unknown mode or server refused' else 'FAIL mode/serve not checked' end);
end $$;

set local role anon;
do $$
declare r jsonb; e jsonb; g jsonb;
begin
  r := public.public_tournament((select v from ids where k = 'slug'));
  select x into e from jsonb_array_elements(r -> 'entries') x where x -> 'names' ->> 0 = 'Asha Rollback';
  insert into out values (7, case when (e -> 'duprs' ->> 0)::numeric = 4.20 and e -> 'duprs' -> 1 = 'null'::jsonb then 'visitors see each player''s doubles DUPR, null when unrated' else 'FAIL duprs ' || coalesce(e::text, 'none') end);
  g := r -> 'matches' -> 0 -> 'games' -> 0;
  insert into out values (8, case when g ->> 'rallies' = 'BAABA' and g ->> 'serve' = 'A' and g ->> 'mode' = 'sideout' and not (g ? 'points') then 'public games carry rallies, first server and mode (not the point list)' else 'FAIL public game ' || coalesce(g::text, 'none') end);
  insert into out values (9, case when r::text not like '%@%' and r::text not like '%phone%' then 'still no emails or phones in public results' else 'FAIL private data in public results' end);
  r := public.scorer_save((select v from ids where k = 'tok'), (select v from ids where k = 'pin'), (select v::uuid from ids where k = 'm'),
    '[{"a":3,"b":0,"points":"AAA","rallies":"BAABAA","serve":"A","mode":"sideout"}]', 'live', null, current_date);
  insert into out values (10, case when r ->> 'ok' = 'true' then 'referee link saves a side-out game with rallies' else 'FAIL referee save ' || r::text end);
  r := public.scorer_save((select v from ids where k = 'tok'), (select v from ids where k = 'pin'), (select v::uuid from ids where k = 'm'),
    '[{"a":3,"b":0,"points":"AAA","rallies":"A;drop"}]', 'live', null, current_date);
  insert into out values (11, case when r ? 'error' then 'referee link refuses a bad rally list' else 'FAIL bad rallies saved' end);
end $$;
reset role;
select step, result from out order by step;
rollback;
