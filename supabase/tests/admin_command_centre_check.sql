-- S5 admin command centre (20261114100000_admin_command_centre): delete club / tournament, edit results, assign club roles.
-- Acts as Vineeth (platform admin) in a rolled-back transaction, then as a signed-in non-admin, then as a visitor.
-- Needs a second account, so it runs in CI (db:test) or the local database, not the Supabase connector. Expected: no row says FAIL.
begin;
create temp table out (step int, result text) on commit drop;
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on out, ids to authenticated, anon;
insert into auth.users (id, email, aud, role, instance_id)
  values ('00000000-0000-4000-8000-0000000000b2', 'second.person@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')
  on conflict (id) do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}', true);

do $$
declare
  me uuid := '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd'; second uuid := '00000000-0000-4000-8000-0000000000b2';
  c uuid; t uuid; t2 uuid; d uuid; d2 uuid; m1 uuid; m2 uuid; ts timestamptz; r text; n int; bad text;
  good jsonb := '[{"a":11,"b":4},{"a":11,"b":6}]'; flip jsonb := '[{"a":4,"b":11},{"a":6,"b":11}]';
  fmt jsonb := '{"bestOf":3,"pointsTo":11,"golden":false}';
begin
  c := public.create_club('S5 Rollback Club', 'Hyderabad', 'Vineeth');
  perform public.admin_set_club_trusted(c, true); -- trusted clubs' tournaments are approved, so matches can be added
  insert into ids values ('c', c);
  insert into public.tournaments (club_id, name, start_date, status) values (c, 'S5 Pool Cup', current_date - 1, 'done') returning id into t;
  insert into public.tournaments (club_id, name, start_date, status) values (c, 'S5 Second Cup', current_date + 3, 'draft') returning id into t2;
  insert into ids values ('t', t), ('t2', t2);
  insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance) values (t, c, 'Open', 'singles', fmt, 1, 0) returning id into d;
  insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance) values (t2, c, 'Open', 'singles', fmt, 1, 0) returning id into d2;
  insert into public.club_matches (club_id, tournament_id, division_id, stage, side_a, side_b, format, games, winner, status)
    values (c, t, d, 'pool', array[gen_random_uuid()], array[gen_random_uuid()], fmt, good, 'A', 'done') returning id into m1;
  insert into public.club_matches (club_id, tournament_id, division_id, stage, side_a, side_b, format, games, winner, status)
    values (c, t, d, 'final', array[gen_random_uuid()], array[gen_random_uuid()], fmt, good, 'A', 'done') returning id into m2;
  insert into ids values ('m1', m1), ('m2', m2);

  -- Edit results ----------------------------------------------------------------------------------------------------------------
  select updated_at into ts from public.club_matches where id = m1;
  perform public.admin_edit_match_result(m1, flip, 'Scorer tapped the wrong side', ts);
  insert into out values (1, case when (select winner from public.club_matches where id = m1) = 'B'
      and exists (select 1 from public.club_score_corrections where match_id = m1 and reason like 'PaddleQ admin:%')
      and exists (select 1 from public.platform_audit where action = 'admin_result_edit' and tournament_id = t)
    then 'results: admin fixes a pool result, with the old score kept and an audit row' else 'FAIL pool edit did not apply' end);
  begin
    select updated_at into ts from public.club_matches where id = m1;
    perform public.admin_edit_match_result(m1, good, 'x', ts);
    insert into out values (2, 'FAIL a one-letter reason was accepted');
  exception when others then insert into out values (2, case when sqlerrm like 'Enter a reason%' then 'results: a reason is required' else 'FAIL ' || sqlerrm end); end;
  begin
    perform public.admin_edit_match_result(m1, good, 'Second try with stale time', now() - interval '1 day');
    insert into out values (3, 'FAIL a stale result was accepted');
  exception when others then insert into out values (3, case when sqlerrm like 'This result changed%' then 'results: a stale edit is refused' else 'FAIL ' || sqlerrm end); end;
  begin
    select updated_at into ts from public.club_matches where id = m1;
    perform public.admin_edit_match_result(m1, '[{"a":11,"b":10},{"a":11,"b":6}]', 'Illegal score on purpose', ts);
    insert into out values (4, 'FAIL an illegal score was accepted');
  exception when others then insert into out values (4, case when sqlerrm like 'Enter a complete legal score%' or sqlerrm like 'Enter valid game scores%' then 'results: an illegal score is refused' else 'FAIL ' || sqlerrm end); end;
  begin
    select updated_at into ts from public.club_matches where id = m2;
    perform public.admin_edit_match_result(m2, flip, 'Try to flip a final', ts);
    insert into out values (5, 'FAIL a knockout winner changed');
  exception when others then insert into out values (5, case when sqlerrm like 'A knockout winner cannot change%' then 'results: a knockout winner cannot flip' else 'FAIL ' || sqlerrm end); end;
  select updated_at into ts from public.club_matches where id = m2;
  perform public.admin_edit_match_result(m2, '[{"a":11,"b":8},{"a":11,"b":9}]', 'Typo in the final score', ts);
  insert into out values (6, case when (select winner from public.club_matches where id = m2) = 'A' and (select games->0->>'b' from public.club_matches where id = m2) = '8'
    then 'results: a knockout score can be fixed when the winner stays' else 'FAIL final score not updated' end);

  -- Club roles ------------------------------------------------------------------------------------------------------------------
  r := public.admin_add_club_member(c, 'Second.Person@example.test', 'coach');
  insert into out values (7, case when r = 'added' and (select role from public.club_members where club_id = c and user_id = second) = 'coach'
    then 'roles: an existing account is added with the role' else 'FAIL add -> ' || r end);
  perform public.admin_set_member_role(c, second, 'admin');
  insert into out values (8, case when (select role from public.club_members where club_id = c and user_id = second) = 'admin'
    then 'roles: platform admin sets an admin (no support session needed)' else 'FAIL role not set' end);
  r := public.admin_add_club_member(c, 'not.signed.up.yet@example.test', 'admin');
  insert into out values (9, case when r = 'invited' and exists (select 1 from public.platform_audit where action = 'admin_role_invite' and club_id = c and detail like 'not.signed.up.yet@example.test as admin%')
    then 'roles: an unknown email waits as a pending role' else 'FAIL invite -> ' || r end);
  begin perform public.admin_add_club_member(c, 'not an email', 'coach'); insert into out values (10, 'FAIL bad email accepted');
  exception when others then insert into out values (10, case when sqlerrm like 'Enter a valid email%' then 'roles: bad email refused' else 'FAIL ' || sqlerrm end); end;
  begin perform public.admin_set_member_role(c, me, 'coach'); insert into out values (11, 'FAIL last owner demoted');
  exception when others then insert into out values (11, case when sqlerrm like 'A club needs an owner%' then 'roles: the last owner can''t be demoted' else 'FAIL ' || sqlerrm end); end;
  begin perform public.admin_remove_club_member(c, me); insert into out values (12, 'FAIL last owner removed');
  exception when others then insert into out values (12, case when sqlerrm like 'A club needs an owner%' then 'roles: the last owner can''t be removed' else 'FAIL ' || sqlerrm end); end;
  perform public.admin_set_member_role(c, second, 'owner');
  perform public.admin_set_member_role(c, second, 'coach'); -- two owners, so one can step down
  insert into out values (13, case when (select role from public.club_members where club_id = c and user_id = second) = 'coach'
    and (select count(*) from public.club_members where club_id = c and role = 'owner') = 1 then 'roles: with two owners one can step down' else 'FAIL owner step-down' end);
  perform public.admin_remove_club_member(c, second);
  insert into out values (14, case when not exists (select 1 from public.club_members where club_id = c and user_id = second)
    and public.admin_club_members(c)::text like '%81b32feb%' and public.admin_club_members(c)::text not like '%second.person@example.test%'
    then 'roles: a member can be removed; the people list carries ids' else 'FAIL remove or list' end);
  select count(*) into n from public.platform_audit where club_id = c and action like 'admin_role_%';
  insert into out values (15, case when n >= 6 then 'roles: every change is in the audit log' else 'FAIL only ' || n || ' role audit rows' end);

  -- Delete a tournament ---------------------------------------------------------------------------------------------------------
  begin perform public.admin_delete_tournament(t, 'wrong name'); insert into out values (16, 'FAIL deleted without the exact name');
  exception when others then insert into out values (16, case when sqlerrm like 'Type the tournament name%' then 'delete tournament: the typed name must match' else 'FAIL ' || sqlerrm end); end;
  update public.tournaments set status = 'live' where id = t2;
  begin perform public.admin_delete_tournament(t2, 'S5 Second Cup'); insert into out values (17, 'FAIL deleted a live tournament');
  exception when others then insert into out values (17, case when sqlerrm like 'This tournament is live%' then 'delete tournament: a live one must be finished first' else 'FAIL ' || sqlerrm end); end;
  update public.tournaments set status = 'draft' where id = t2;
  perform public.admin_delete_tournament(t, 'S5 Pool Cup');
  insert into out values (18, case when not exists (select 1 from public.tournaments where id = t)
    and not exists (select 1 from public.club_matches where tournament_id = t)
    and not exists (select 1 from public.club_score_corrections where match_id in (m1, m2))
    and exists (select 1 from public.platform_audit where action = 'admin_tournament_delete' and tournament_id = t and detail like 'S5 Pool Cup%')
    then 'delete tournament: gone with its matches and corrections, one audit row (also after a score was fixed)' else 'FAIL tournament not fully deleted' end);

  -- Delete a club ---------------------------------------------------------------------------------------------------------------
  begin perform public.admin_delete_club(c, 'S5 Rollback'); insert into out values (19, 'FAIL deleted without the exact name');
  exception when others then insert into out values (19, case when sqlerrm like 'Type the club name%' then 'delete club: the typed name must match' else 'FAIL ' || sqlerrm end); end;
  update public.tournaments set status = 'live' where id = t2;
  begin perform public.admin_delete_club(c, 'S5 Rollback Club'); insert into out values (20, 'FAIL deleted a club with a live tournament');
  exception when others then insert into out values (20, case when sqlerrm like 'This club has a live tournament%' then 'delete club: refused while a tournament is live' else 'FAIL ' || sqlerrm end); end;
  update public.tournaments set status = 'done' where id = t2;
  perform public.admin_delete_club(c, 'S5 Rollback Club');
  insert into out values (21, case when not exists (select 1 from public.clubs where id = c) and not exists (select 1 from public.tournaments where club_id = c)
    and not exists (select 1 from public.club_members where club_id = c)
    and exists (select 1 from public.platform_audit where action = 'admin_club_delete' and club_id = c and detail like 'S5 Rollback Club%')
    then 'delete club: everything under it is gone, one audit row' else 'FAIL club not fully deleted' end);
end $$;

-- A signed-in account that isn't a platform admin can do none of it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000abcd","role":"authenticated"}', true);
do $$
declare c uuid := gen_random_uuid(); bad text := '';
begin
  begin perform public.admin_delete_tournament(c, 'x'); bad := bad || ' delete-tournament'; exception when others then null; end;
  begin perform public.admin_delete_club(c, 'x'); bad := bad || ' delete-club'; exception when others then null; end;
  begin perform public.admin_edit_match_result(c, '[]', 'abc', now()); bad := bad || ' edit-result'; exception when others then null; end;
  begin perform public.admin_club_members(c); bad := bad || ' members'; exception when others then null; end;
  begin perform public.admin_set_member_role(c, c, 'owner'); bad := bad || ' set-role'; exception when others then null; end;
  begin perform public.admin_add_club_member(c, 'a@b.co', 'owner'); bad := bad || ' add'; exception when others then null; end;
  begin perform public.admin_remove_club_member(c, c); bad := bad || ' remove'; exception when others then null; end;
  insert into out values (22, case when bad = '' then 'non-admin: all seven new functions refused' else 'FAIL reached:' || bad end);
end $$;

-- A visitor can't call them at all.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int := 0; c uuid := gen_random_uuid();
begin
  begin perform public.admin_delete_tournament(c, 'x'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_delete_club(c, 'x'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_edit_match_result(c, '[]', 'abc', now()); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_club_members(c); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_set_member_role(c, c, 'owner'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_add_club_member(c, 'a@b.co', 'owner'); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_remove_club_member(c, c); exception when insufficient_privilege then n := n + 1; end;
  insert into out values (23, case when n = 7 then 'visitor: all seven new functions closed' else 'FAIL visitor reached ' || (7 - n) || ' function(s)' end);
end $$;
select step, result from out order by step;
rollback;
