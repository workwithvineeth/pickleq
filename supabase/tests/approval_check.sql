-- Tournament approval check (club_mode_22): create freely, go live with PaddleQ's approval; trusted clubs skip it.
-- Rolls back; any problem raises "FAIL: …".
begin;

insert into auth.users (id, email, aud, role, instance_id)
values ('00000000-0000-4000-8000-0000000000a1', 'appr-owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-8000-0000000000a2', 'appr-player@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into auth.users (id, email, aud, role, instance_id)
values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') on conflict (id) do nothing;
insert into public.platform_admins (user_id) values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd') on conflict do nothing;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, anon;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create temp table slugs (k text primary key, v text) on commit drop;
grant all on slugs to authenticated, anon;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;

-- A new club creates a tournament, an event and entries without asking anyone.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
insert into ids values ('club', public.create_club('Approval Club', 'Pune', 'Asha'));
do $$
declare t uuid; d uuid; h text; r jsonb; failed boolean;
begin
  select hosting into h from public.clubs where id = pg_temp.id('club');
  if h <> 'approved' then raise exception 'FAIL: a new club can''t create tournaments (hosting %)', h; end if;
  insert into public.tournaments (club_id, name, start_date, is_public, entry_mode, registration_open, city, venue, upi_id, approval)
    values (pg_temp.id('club'), 'Approval Open', current_date + 5, true, 'registration', true, 'Pune', 'Baner Courts', 'club@upi', 'approved')
    returning id into t;
  insert into ids values ('t', t);
  if (select approval from public.tournaments where id = t) <> 'draft' then raise exception 'FAIL: an organiser created an approved tournament'; end if;
  insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance, gender, fee)
    values (t, pg_temp.id('club'), 'Open Singles', 'singles', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}', 1, 0, 'open', 500) returning id into d;
  insert into ids values ('div', d);
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status)
    values (t, d, pg_temp.id('club'), 'offline', '[{"name":"Hand Added","phone":"","gender":"m","age":30,"dupr":3.0}]', 'accepted');
  r := public.import_entries(t, jsonb_build_array(jsonb_build_object('division', d, 'status', 'accepted', 'payment', 'unpaid', 'players', '[{"name":"Imported One","phone":"9811100001","gender":"f","age":28}]'::jsonb)));
  if (r ->> 'added')::int is distinct from 1 then raise exception 'FAIL: import before approval: %', r; end if;
  update public.registrations set status = 'withdrawn' where tournament_id = t and players::text like '%Hand Added%';

  -- Organisers can't approve themselves or trust their club.
  failed := false; begin update public.tournaments set approval = 'approved' where id = t; exception when raise_exception then failed := true; end;
  if not failed then raise exception 'FAIL: an organiser approved their own tournament'; end if;
  failed := false; begin update public.clubs set trusted = true where id = pg_temp.id('club'); exception when raise_exception then failed := true; end;
  if not failed then raise exception 'FAIL: an organiser trusted their own club'; end if;
  if public.approval_queue() ->> 'error' is null then raise exception 'FAIL: an organiser read the approval queue'; end if;
  if public.admin_decide_tournament(t, true, null) ->> 'error' is null then raise exception 'FAIL: an organiser approved via the admin function'; end if;
  if public.admin_set_club_trusted(pg_temp.id('club'), true) ->> 'error' is null then raise exception 'FAIL: an organiser trusted their club via the admin function'; end if;

  -- Before approval: no draw, no matches, no listing on the board.
  failed := false; begin
    insert into public.club_matches (club_id, tournament_id, division_id, stage, side_a, side_b, format)
      values (pg_temp.id('club'), t, d, 'pool', '{}', '{}', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}');
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'FAIL: matches made before approval'; end if;
  failed := false; begin update public.tournaments set drawn_at = now() where id = t; exception when raise_exception then failed := true; end;
  if not failed then raise exception 'FAIL: draw marked made before approval'; end if;
  r := public.submit_listing(t, 'run');
  if r ->> 'status' <> 'pending' then raise exception 'FAIL: listing of an unapproved tournament: %', r; end if;
end $$;

-- A player can't register online, and visitors see nothing, before approval.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
do $$
declare r jsonb;
begin
  r := public.register_entry(pg_temp.id('div'), '[{"name":"Early Bird","phone":"9822200002","gender":"m","age":30,"dupr":3.0}]', 'claimed', 'UPI1');
  if r ->> 'error' is null then raise exception 'FAIL: online entry before approval: %', r; end if;
exception when raise_exception then null; -- refused by the trigger: fine
end $$;
reset role;
insert into slugs select 't', public_slug from public.tournaments where id = pg_temp.id('t');
insert into public.scorer_links (tournament_id, club_id, court) values (pg_temp.id('t'), pg_temp.id('club'), 1);
set local role anon;
do $$
declare slug text; tok text; dtok text; dpin text; r jsonb;
begin
  select v into slug from slugs where k = 't';
  if slug is null then raise exception 'FAIL: test setup has no slug'; end if;
  if public.public_tournament(slug) is not null then raise exception 'FAIL: public results before approval'; end if;
  if public.public_event(slug) is not null then raise exception 'FAIL: registration page before approval'; end if;
  if public.public_events(false)::text like '%Approval Open%' then raise exception 'FAIL: on the board before approval'; end if;
  if public.share_events()::text like '%Approval Open%' then raise exception 'FAIL: share page before approval'; end if;
end $$;
reset role;
do $$
declare tok text; pin text; dtok text; dpin text; r jsonb;
begin
  select token, l.pin into tok, pin from public.scorer_links l where tournament_id = pg_temp.id('t');
  select token, d.pin into dtok, dpin from public.tournament_desks d where tournament_id = pg_temp.id('t');
  insert into ids values ('dummy', gen_random_uuid());
  set local role anon;
  r := public.scorer_open(tok, pin);
  if r ->> 'error' not like '%approved%' then raise exception 'FAIL: referee link works before approval: %', r; end if;
  r := public.desk_open(dtok, dpin);
  if r ->> 'error' not like '%approved%' then raise exception 'FAIL: desk link works before approval: %', r; end if;
  reset role;
end $$;

-- Submit, reject with a reason the club sees, submit again, approve.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
do $$
declare r jsonb;
begin
  r := public.submit_tournament(pg_temp.id('t'), 40);
  if r ->> 'status' <> 'submitted' then raise exception 'FAIL: submit: %', r; end if;
end $$;
select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
do $$
declare r jsonb; q jsonb;
begin
  select x into q from jsonb_array_elements(public.approval_queue()) x where x ->> 'id' = pg_temp.id('t')::text;
  if q is null then raise exception 'FAIL: the admin can''t see the request'; end if;
  if q ->> 'upi_id' <> 'club@upi' or (q ->> 'expected')::int <> 40 or q ->> 'venue' <> 'Baner Courts' or q -> 'divisions' -> 0 ->> 'fee' is null then
    raise exception 'FAIL: the request is missing details: %', q;
  end if;
  if q::text ~* 'example\.test|98111|98222' then raise exception 'FAIL: the queue shows emails or phones: %', q; end if;
  if public.admin_decide_tournament(pg_temp.id('t'), false, '') ->> 'error' is null then raise exception 'FAIL: rejected without a reason'; end if;
  r := public.admin_decide_tournament(pg_temp.id('t'), false, 'Please add the venue address');
  if r ->> 'ok' is null then raise exception 'FAIL: reject: %', r; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
do $$
declare a text; why text; r jsonb;
begin
  select approval, approval_reason into a, why from public.tournaments where id = pg_temp.id('t');
  if a <> 'rejected' or why <> 'Please add the venue address' then raise exception 'FAIL: the club doesn''t see the rejection (%: %)', a, why; end if;
  r := public.submit_tournament(pg_temp.id('t'), null);
  if r ->> 'status' <> 'submitted' then raise exception 'FAIL: resubmit: %', r; end if;
end $$;
select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
do $$
declare r jsonb;
begin
  r := public.admin_decide_tournament(pg_temp.id('t'), true, null);
  if r ->> 'ok' is null then raise exception 'FAIL: approve: %', r; end if;
end $$;
-- After approval everything opens: matches, the board, public results and online entries.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
insert into public.club_matches (club_id, tournament_id, division_id, stage, side_a, side_b, format)
  values (pg_temp.id('club'), pg_temp.id('t'), pg_temp.id('div'), 'pool', '{}', '{}', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
do $$
declare r jsonb;
begin
  r := public.register_entry(pg_temp.id('div'), '[{"name":"On Time","phone":"9822200003","gender":"m","age":30,"dupr":3.0}]', 'claimed', 'UPI2');
  if r ->> 'error' is not null then raise exception 'FAIL: online entry after approval: %', r; end if;
end $$;
set local role anon;
do $$
declare slug text := (select v from slugs where k = 't');
begin
  if public.public_tournament(slug) is null then raise exception 'FAIL: no public results after approval'; end if;
  if public.public_event(slug) is null then raise exception 'FAIL: no registration page after approval'; end if;
  if public.public_events(false)::text not like '%Approval Open%' then raise exception 'FAIL: not on the board after approval'; end if;
end $$;

-- Trusted clubs: only PaddleQ switches it; new tournaments go straight through; switching it off leaves approved ones alone.
reset role;
set local role authenticated;
select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
do $$ begin
  if public.admin_set_club_trusted(pg_temp.id('club'), true) ->> 'ok' is null then raise exception 'FAIL: trust on'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
do $$
declare t uuid;
begin
  insert into public.tournaments (club_id, name, start_date) values (pg_temp.id('club'), 'Trusted Cup', current_date + 9) returning id into t;
  if (select approval from public.tournaments where id = t) <> 'approved' then raise exception 'FAIL: a trusted club''s tournament wasn''t approved'; end if;
  insert into ids values ('t2', t);
end $$;
select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
do $$ begin
  if public.admin_set_club_trusted(pg_temp.id('club'), false) ->> 'ok' is null then raise exception 'FAIL: trust off'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
do $$
declare t uuid;
begin
  if (select approval from public.tournaments where id = pg_temp.id('t2')) <> 'approved' then raise exception 'FAIL: trust off un-approved a running tournament'; end if;
  insert into public.tournaments (club_id, name, start_date) values (pg_temp.id('club'), 'After Trust Cup', current_date + 12) returning id into t;
  if (select approval from public.tournaments where id = t) <> 'draft' then raise exception 'FAIL: trust off but new tournaments still skip approval'; end if;
end $$;

-- A PaddleQ admin can't approve a tournament of a club they organise.
reset role;
insert into public.club_members (club_id, user_id, role) values (pg_temp.id('club'), '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd', 'coach') on conflict do nothing;
set local role authenticated;
select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
do $$
declare t uuid := (select id from public.tournaments where name = 'After Trust Cup');
begin
  if public.admin_decide_tournament(t, true, null) ->> 'error' is null then raise exception 'FAIL: an admin approved their own club''s tournament'; end if;
end $$;

reset role;
select 'All tournament approval checks passed' as result;
rollback;
