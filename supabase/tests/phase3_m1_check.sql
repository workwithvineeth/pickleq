-- Phase 3 Module 1: the robot can reset finished matches in test clubs only; real clubs keep the audited-correction guard.
-- Rolls back; problems raise "FAIL: …".
begin;
create temp table m1 (k text primary key, v uuid) on commit drop;
insert into m1 values ('test_club', gen_random_uuid()), ('real_club', gen_random_uuid()), ('t1', gen_random_uuid()), ('t2', gen_random_uuid()), ('m1', gen_random_uuid()), ('m2', gen_random_uuid());
create function pg_temp.v(k text) returns uuid language sql as $$ select v from m1 where m1.k = $1 $$;
insert into public.clubs (id, name, is_test) values (pg_temp.v('test_club'), 'M1 Sandbox', true), (pg_temp.v('real_club'), 'M1 Real Club', false);
insert into public.tournaments (id, club_id, name, start_date, approval) values
  (pg_temp.v('t1'), pg_temp.v('test_club'), 'M1 Sandbox Cup', current_date, 'approved'),
  (pg_temp.v('t2'), pg_temp.v('real_club'), 'M1 Real Cup', current_date, 'approved');
insert into public.club_matches (id, club_id, tournament_id, stage, format, games, status, winner) values
  (pg_temp.v('m1'), pg_temp.v('test_club'), pg_temp.v('t1'), 'friendly', '{"pointsTo":11}', '[{"a":11,"b":4,"points":""}]', 'done', 'A'),
  (pg_temp.v('m2'), pg_temp.v('real_club'), pg_temp.v('t2'), 'friendly', '{"pointsTo":11}', '[{"a":11,"b":4,"points":""}]', 'done', 'A');

do $$ begin
  -- The robot's reset (database owner) may void a finished match in a test club.
  update public.club_matches set status = 'void', winner = null where id = pg_temp.v('m1');
  if (select status from public.club_matches where id = pg_temp.v('m1')) <> 'void' then raise exception 'FAIL: test club reset did not apply'; end if;
  -- The same write on a real club is still refused.
  begin
    update public.club_matches set status = 'void', winner = null where id = pg_temp.v('m2');
    raise exception 'FAIL: a real club''s finished match was changed without the audited correction';
  exception when others then
    if sqlerrm <> 'Use the audited correction option for completed matches' then raise; end if;
  end;
end $$;

select 'ok';
rollback;
