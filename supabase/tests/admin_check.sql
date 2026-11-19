-- Admin dashboard rules (club_mode_15_admin_dashboard). Acts as Vineeth (a platform admin) on his own club, then as a
-- signed-in non-admin, then as a visitor. Rolls back and needs no confirmation in the connector. Expected: no row says FAIL.
begin;
create temp table out (step int, result text) on commit drop;
create temp table ids (k text primary key, v uuid) on commit drop;
create temp table me on commit drop as select email from auth.users where id = '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd';
grant all on out, ids, me to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}', true);
insert into ids select 'club', club_id from public.club_members where user_id = '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd' and role = 'owner' order by joined_at limit 1;
with x as (insert into public.tournaments (club_id, name, start_date, status) select v, 'Admin Rollback', current_date - 1, 'live' from ids where k = 'club' returning id)
  insert into ids select 't', id from x;
update public.tournaments set status = 'done' where id = (select v from ids where k = 't');
do $$
declare
  c uuid := (select v from ids where k = 'club');
  t uuid := (select v from ids where k = 't');
  r jsonb; x jsonb; n int; v boolean;
begin
  r := public.admin_overview();
  insert into out values (1, case when r ? 'matches_week' and r ? 'clubs' and jsonb_array_length(r->'weeks') = 8 then 'overview: counts and 8 weeks of matches' else 'FAIL ' || r::text end);
  r := public.admin_clubs();
  select e into x from jsonb_array_elements(r) e where (e->>'id')::uuid = c;
  insert into out values (2, case when x is not null and (x->'owners') ? (select email from me) and (x->>'tournaments')::int >= 1
    then 'clubs: lists the club with its owner email and tournaments' else 'FAIL ' || coalesce(x::text, 'club missing') end);
  r := public.admin_club(c);
  insert into out values (3, case when exists (select 1 from jsonb_array_elements(r->'people') p where p->>'role' = 'owner') and jsonb_array_length(r->'tournaments') >= 1
    then 'club: read-only view with people and tournaments' else 'FAIL ' || r::text end);
  select verified into v from public.clubs where id = c;
  r := public.admin_set_club_verified(c, not v);
  insert into out values (4, case when (select verified from public.clubs where id = c) = not v then 'clubs: admin can verify or unverify' else 'FAIL ' || r::text end);
  r := public.admin_tournaments();
  select e into x from jsonb_array_elements(r) e where (e->>'id')::uuid = t;
  insert into out values (5, case when x->>'status' = 'done' and x->>'event_pin' ~ '^[0-9]{4,6}$' and jsonb_typeof(x->'helpers') = 'array'
    then 'tournaments: across clubs, with event PIN and helpers' else 'FAIL ' || coalesce(x::text, 'tournament missing') end);
  r := public.admin_set_tournament_status(t, 'live');
  insert into out values (6, case when (select status from public.tournaments where id = t) = 'live' then 'tournaments: admin reopens a finished one' else 'FAIL ' || r::text end);
  r := public.admin_set_tournament_status(t, 'draft');
  insert into out values (7, case when r ? 'error' then 'tournaments: only live or finished allowed' else 'FAIL ' || r::text end);
  r := public.remove_platform_admin('nobody-here@example.com');
  insert into out values (8, case when r->>'error' like 'That email isn%' then 'admins: unknown email refused' else 'FAIL ' || r::text end);
  select count(*) into n from public.platform_admins;
  if n = 1 then
    r := public.remove_platform_admin((select email from me));
    insert into out values (9, case when r->>'error' like 'You can%last admin' then 'admins: the last admin can''t be removed' else 'FAIL ' || r::text end);
  else
    insert into out values (9, 'admins: last-admin rule not tried (' || n || ' admins here)');
  end if;
end $$;

-- A signed-in account that isn't an admin gets nothing.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000abcd","role":"authenticated"}', true);
do $$
declare t uuid := (select v from ids where k = 't'); c uuid := (select v from ids where k = 'club'); bad text := '';
begin
  if not (public.admin_overview() ? 'error') then bad := bad || ' overview'; end if;
  if not (public.admin_clubs() ? 'error') then bad := bad || ' clubs'; end if;
  if not (public.admin_club(c) ? 'error') then bad := bad || ' club'; end if;
  if not (public.admin_tournaments() ? 'error') then bad := bad || ' tournaments'; end if;
  if not (public.admin_set_club_verified(c, true) ? 'error') then bad := bad || ' verify'; end if;
  if not (public.admin_set_tournament_status(t, 'done') ? 'error') then bad := bad || ' status'; end if;
  if not (public.remove_platform_admin('x@example.com') ? 'error') then bad := bad || ' remove'; end if;
  insert into out values (10, case when bad = '' then 'non-admin: every admin function refused' else 'FAIL answered:' || bad end);
end $$;

-- A visitor can't call them at all.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int := 0;
begin
  begin perform public.admin_overview(); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_tournaments(); exception when insufficient_privilege then n := n + 1; end;
  begin perform public.remove_platform_admin('x@example.com'); exception when insufficient_privilege then n := n + 1; end;
  insert into out values (11, case when n = 3 then 'visitor: admin functions closed' else 'FAIL visitor reached ' || (3 - n) || ' function(s)' end);
end $$;
select step, result from out order by step;
rollback;
