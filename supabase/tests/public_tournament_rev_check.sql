-- The live-page version check (20261112100000_public_tournament_rev). Runs as the database owner and rolls back.
-- Expected: no row says FAIL.
begin;
create temp table out (step int, result text) on commit drop;

do $$
declare
  c uuid := (select id from public.clubs where name = 'Pickleyard');
  t uuid; d uuid; m uuid; r1 text; r2 text; r3 text;
begin
  insert into public.tournaments (club_id, name, start_date, status, approval, is_public, public_slug)
    values (c, 'Rev Rollback', current_date, 'live', 'approved', true, 'rev-rollback') returning id into t;
  insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance) values (t, c, 'Rev Doubles', 'doubles', '{"bestOf":1,"pointsTo":11}', 1, 0) returning id into d;
  insert into public.club_matches (club_id, tournament_id, division_id, stage, format, status) values (c, t, d, 'pool', '{"bestOf":1,"pointsTo":11}', 'live') returning id into m;

  r1 := public.public_tournament_rev('rev-rollback');
  insert into out values (1, case when r1 is not null and length(r1) = 32 then 'a public event has a short version' else 'FAIL no version: ' || coalesce(r1, 'null') end);
  insert into out values (2, case when public.public_tournament_rev('rev-rollback') = r1 then 'the version stays the same while nothing changes' else 'FAIL version changes on its own' end);

  update public.club_matches set games = '[{"a":1,"b":0,"points":"A"}]' where id = m;
  r2 := public.public_tournament_rev('rev-rollback');
  insert into out values (3, case when r2 <> r1 then 'a new point changes the version' else 'FAIL a point did not change the version' end);

  update public.club_matches set status = 'done', winner = 'A' where id = m;
  r3 := public.public_tournament_rev('rev-rollback');
  insert into out values (4, case when r3 <> r2 then 'finishing a match changes the version' else 'FAIL finishing did not change the version' end);

  insert into out values (5, case when public.public_tournament_rev('no-such-event') is null then 'an unknown event has no version' else 'FAIL unknown event has a version' end);
  update public.tournaments set is_public = false where id = t;
  insert into out values (6, case when public.public_tournament_rev('rev-rollback') is null then 'a private event has no version' else 'FAIL private event leaks a version' end);
  insert into out values (7, case when has_function_privilege('anon', 'public.public_tournament_rev(text)', 'execute') then 'live pages (anon) can check the version' else 'FAIL anon cannot check the version' end);
end $$;

select step, result from out order by step;
rollback;
