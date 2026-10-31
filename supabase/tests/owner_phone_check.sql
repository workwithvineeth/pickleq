-- The club owner's phone (club_mode_19_owner_phone_private): PaddleQ admins and the club's own owner and admins see it; other
-- members, players, other clubs and visitors don't. Rolls back. Expected: no row says FAIL.
begin;
create temp table out (step int, result text) on commit drop;
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on out, ids to authenticated, anon;
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'ph-owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000f2', 'ph-admin@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000f3', 'ph-coach@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000f4', 'ph-player@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000f5', 'ph-other@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(key text) returns uuid language sql as $$ select v from ids where k = key $$;
grant execute on function pg_temp.id(text) to authenticated, anon;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
insert into ids values ('club', public.create_club('Phone Club', 'Pune', 'Priya'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f5');
insert into ids values ('other', public.create_club('Elsewhere Club', 'Goa', 'Omar'));
reset role;
insert into public.club_members (club_id, user_id, role) values
  (pg_temp.id('club'), '00000000-0000-4000-8000-0000000000f2', 'admin'),
  (pg_temp.id('club'), '00000000-0000-4000-8000-0000000000f3', 'coach'),
  (pg_temp.id('club'), '00000000-0000-4000-8000-0000000000f4', 'player');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
do $$
declare r jsonb; p text; ph text; n int;
begin
  r := public.request_hosting(pg_temp.id('club'), '+91 98765 01234', 'Two courts in Baner');
  select hosting_phone into ph from public.clubs where id = pg_temp.id('club');
  select phone into p from public.club_contacts where club_id = pg_temp.id('club');
  insert into out values (1, case when (r ->> 'ok')::boolean and p = '+91 98765 01234' and ph is null
    then 'owner asks to host: the phone is kept, but not on the club row' else 'FAIL request ' || coalesce(r::text, '') end);
  update public.clubs set hosting_phone = '+91 90000 00000', hosting_note = 'x' where id = pg_temp.id('club');
  select count(*) into n from public.clubs where id = pg_temp.id('club') and (hosting_phone is not null or hosting_note is not null);
  insert into out values (2, case when n = 0 then 'writing a phone onto the club row directly doesn''t stick' else 'FAIL phone stored on clubs' end);
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f2');
insert into out select 3, case when count(*) = 1 then 'the club''s admin sees the phone' else 'FAIL admin can''t see the phone' end
  from public.club_contacts where club_id = pg_temp.id('club');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f3');
insert into out select 4, case when count(*) = 0 then 'a coach doesn''t see the owner''s phone' else 'FAIL coach sees the phone' end from public.club_contacts;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f4');
insert into out select 5, case when count(*) = 0 then 'a player doesn''t see the owner''s phone' else 'FAIL player sees the phone' end from public.club_contacts;
insert into out select 6, case when bool_and(hosting_phone is null and hosting_note is null) then 'a player reading the club row gets no phone or note' else 'FAIL club row leaks the phone' end
  from public.clubs where id = pg_temp.id('club');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f5');
insert into out select 7, case when count(*) = 0 then 'another club''s owner doesn''t see it' else 'FAIL other club sees the phone' end
  from public.club_contacts where club_id = pg_temp.id('club');
select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
do $$
declare r jsonb := public.admin_club(pg_temp.id('club')); l jsonb;
begin
  select x into l from jsonb_array_elements(public.admin_clubs()) x where x ->> 'id' = pg_temp.id('club')::text;
  insert into out values (8, case when r ->> 'hosting_phone' = '+91 98765 01234' and l ->> 'hosting_note' = 'Two courts in Baner'
    then 'PaddleQ admins see the phone and note in Admin → Clubs' else 'FAIL admin view ' || coalesce(r::text, '') end);
end $$;
reset role;
set local role anon;
do $$ declare n int;
begin
  begin select count(*) into n from public.club_contacts; insert into out values (9, case when n = 0 then 'visitors read no phones' else 'FAIL visitor reads phones' end);
  exception when insufficient_privilege then insert into out values (9, 'visitors can''t read phones'); end;
end $$;
reset role;
select step, result from out order by step;
rollback;
