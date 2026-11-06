-- Phase 3 Module 2: support sessions (time-limited, logged, never owner) and the tournament lifecycle.
-- Rolls back; problems raise "FAIL: …".
begin;
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-0000000000c1', 'm2-owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000c2', 'm2-stranger@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000c3', 'm2-admin@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000c3');
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
insert into ids values ('club', public.create_club('M2 Club', 'Hyderabad', 'Owner'));
reset role;
insert into ids values ('empty', gen_random_uuid()), ('busy', gen_random_uuid());
insert into public.tournaments (id, club_id, name, start_date, approval) values
  (pg_temp.id('empty'), pg_temp.id('club'), 'Empty Cup', current_date + 7, 'approved'),
  (pg_temp.id('busy'), pg_temp.id('club'), 'Busy Cup', current_date + 7, 'approved');
insert into public.club_matches (club_id, tournament_id, stage, format) values (pg_temp.id('club'), pg_temp.id('busy'), 'friendly', '{"pointsTo":11}');
set local role authenticated;

do $$ declare ok boolean; begin
  -- A stranger can't start support, delete or cancel.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000c2');
  begin perform public.admin_start_support(pg_temp.id('club'), 'curious'); raise exception 'FAIL: non-admin started support';
  exception when others then if sqlerrm not like 'Only PaddleQ admins%' then raise; end if; end;
  begin perform public.cancel_tournament(pg_temp.id('busy'), 'Rain today'); raise exception 'FAIL: stranger cancelled';
  exception when others then if sqlerrm not like 'Only the club%' then raise; end if; end;

  -- A PaddleQ admin needs a reason, then becomes a time-limited club admin, logged.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
  if public.is_admin(pg_temp.id('club')) then raise exception 'FAIL: admin had club rights before support'; end if;
  begin perform public.admin_start_support(pg_temp.id('club'), ''); raise exception 'FAIL: support without reason';
  exception when others then if sqlerrm not like 'Say why%' then raise; end if; end;
  perform public.admin_start_support(pg_temp.id('club'), 'Fixing a stuck court');
  if not public.is_admin(pg_temp.id('club')) then raise exception 'FAIL: support session gave no rights'; end if;
  if (select count(*) from public.platform_audit where action = 'support_start') <> 1 then raise exception 'FAIL: support start not logged'; end if;
  if jsonb_array_length(public.my_support_sessions()) <> 1 then raise exception 'FAIL: support session not listed'; end if;
  -- Support can't become owner (refused by RLS or the guard; either way the role stays admin).
  begin update public.club_members set role = 'owner' where club_id = pg_temp.id('club') and user_id = '00000000-0000-4000-8000-0000000000c3';
  exception when others then null; end;
  if (select role from public.club_members where club_id = pg_temp.id('club') and user_id = '00000000-0000-4000-8000-0000000000c3') <> 'admin' then raise exception 'FAIL: support became owner'; end if;

  -- Lifecycle: delete only when nobody is in it; cancel keeps everything; archive after cancel.
  begin perform public.delete_tournament(pg_temp.id('busy'), 'Busy Cup'); raise exception 'FAIL: deleted a tournament with matches';
  exception when others then if sqlerrm not like 'People have entered%' then raise; end if; end;
  begin perform public.delete_tournament(pg_temp.id('empty'), 'wrong name'); raise exception 'FAIL: deleted without the right name';
  exception when others then if sqlerrm not like 'Type the tournament name%' then raise; end if; end;
  perform public.delete_tournament(pg_temp.id('empty'), 'Empty Cup');
  perform public.cancel_tournament(pg_temp.id('busy'), 'Courts flooded');
  begin update public.club_matches set status = 'live' where tournament_id = pg_temp.id('busy'); raise exception 'FAIL: scored a cancelled tournament';
  exception when others then if sqlerrm <> 'This tournament was cancelled' then raise; end if; end;
  perform public.archive_tournament(pg_temp.id('busy'), true);

  -- Ending support removes the rights again.
  perform public.admin_end_support(pg_temp.id('club'));
  if public.is_admin(pg_temp.id('club')) then raise exception 'FAIL: rights kept after support ended'; end if;
end $$;
reset role;
select case when exists (select 1 from public.tournaments where id = pg_temp.id('empty')) then 'FAIL: empty tournament still there' else 'ok' end;
select case when (select cancelled_at is not null and archived_at is not null from public.tournaments where id = pg_temp.id('busy')) then 'ok' else 'FAIL: cancel/archive not saved' end;
select case when (select count(*) from public.platform_audit where action in ('tournament_delete', 'tournament_cancel', 'tournament_archive', 'support_end')) = 4 then 'ok' else 'FAIL: lifecycle not logged' end;
rollback;
