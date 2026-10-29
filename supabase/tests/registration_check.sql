-- Security and rules check for Club Module 2 (events board, approval, registration, entries inbox).
-- Runs inside a transaction and rolls back, so it leaves nothing behind. Any failed check raises an error naming it.
-- Users: A organiser (club admin), B and C players, D platform admin.
begin;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'reg-a@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000b1', 'reg-b@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000c1', 'reg-c@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000d1', 'reg-d@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000d1');

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, anon;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.player(name text, phone text, gender text, age int, dupr numeric) returns jsonb language sql as $$
  select jsonb_build_object('name', name, 'phone', phone, 'gender', gender, 'age', age, 'dupr', dupr, 'duprId', '')
$$;

-- A creates a club and a tournament that takes registrations.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
insert into ids values ('club', public.create_club('Reg Club', 'Hyderabad', 'Anu'));
with x as (insert into public.tournaments (club_id, name, start_date, entry_mode, registration_open, city, venue, listing_status)
  select v, 'Reg Open', current_date + 10, 'registration', true, 'Hyderabad', 'Court One', 'approved' from ids where k = 'club' returning id)
insert into ids select 't', id from x;
with x as (insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance, max_dupr, gender, cap)
  select (select v from ids where k = 't'), v, 'Men 3.5', 'doubles', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}', 1, 0, 3.5, 'men', 2 from ids where k = 'club' returning id)
insert into ids select 'md', id from x;
with x as (insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance, min_age)
  select (select v from ids where k = 't'), v, 'Singles 35+', 'singles', '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}', 1, 0, 35 from ids where k = 'club' returning id)
insert into ids select 's35', id from x;

do $$
declare r jsonb; n int; s text;
begin
  -- Inserting can't self-approve: the status was forced back to none.
  select listing_status into s from public.tournaments where id = (select v from ids where k = 't');
  if s <> 'none' then raise exception 'FAIL: organiser approved their own listing on insert (%)', s; end if;
  begin
    update public.tournaments set listing_status = 'approved' where id = (select v from ids where k = 't');
    raise exception 'FAIL: organiser approved their own listing';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    update public.clubs set verified = true where id = (select v from ids where k = 'club');
    raise exception 'FAIL: organiser verified their own club';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  r := public.submit_listing((select v from ids where k = 't'), 'run');
  if r ->> 'status' <> 'pending' then raise exception 'FAIL: an unverified club''s listing should wait for approval: %', r; end if;
  if public.listing_queue() is not null then raise exception 'FAIL: an organiser can read the approval queue'; end if;
  if (public.review_listing((select v from ids where k = 't'), true, null)) ->> 'error' is null then raise exception 'FAIL: an organiser approved a listing'; end if;
  if public.public_events(false)::text like '%Reg Open%' then raise exception 'FAIL: a pending listing is on the board'; end if;
end $$;

-- D, a platform admin, approves it. The club becomes verified, and the event is on the board.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
do $$
declare r jsonb;
begin
  if jsonb_array_length(public.listing_queue()) < 1 then raise exception 'FAIL: the platform admin can''t see the queue'; end if;
  r := public.review_listing((select v from ids where k = 't'), false, '');
  if r ->> 'error' is null then raise exception 'FAIL: rejected without a reason'; end if;
  r := public.review_listing((select v from ids where k = 't'), true, null);
  if r ->> 'ok' is null then raise exception 'FAIL: approve failed: %', r; end if;
  if public.public_events(false)::text not like '%Reg Open%' then raise exception 'FAIL: the approved listing isn''t on the board'; end if;
end $$;

-- C registers a men's doubles team; the rules are checked.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
do $$
declare r jsonb; md uuid := (select v from ids where k = 'md'); s35 uuid := (select v from ids where k = 's35');
begin
  r := public.register_entry(md, jsonb_build_array(pg_temp.player('Chetan', '9800000001', 'm', 30, 3.4), pg_temp.player('Dev', '9800000002', 'm', 31, 3.2)), 'venue', null);
  if r ->> 'status' <> 'pending' then raise exception 'FAIL: valid entry refused: %', r; end if;
  insert into ids values ('reg_c', (r ->> 'id')::uuid);
  r := public.register_entry(md, jsonb_build_array(pg_temp.player('Chetan', '9800000011', 'm', 30, 3.4), pg_temp.player('Eshan', '9800000012', 'm', 31, 3.2)), 'venue', null);
  if r ->> 'error' not like 'You already have an entry%' then raise exception 'FAIL: second entry by the same person: %', r; end if;
  r := public.register_entry(s35, jsonb_build_array(pg_temp.player('Chetan', '9800000001', 'm', 30, null)), 'unpaid', null);
  if r ->> 'error' not like '%aged 35 and over%' then raise exception 'FAIL: age limit not applied: %', r; end if;
  r := public.register_entry(s35, jsonb_build_array(pg_temp.player('Teen', '9800000003', 'm', 16, null)), 'unpaid', null);
  if r ->> 'error' not like '%18 or over%' then raise exception 'FAIL: a minor was accepted: %', r; end if;
  r := public.register_entry(s35, jsonb_build_array(pg_temp.player('Chetan', '9800000001', 'm', 40, null)), 'claimed', '');
  if r ->> 'error' not like '%UPI reference%' then raise exception 'FAIL: claimed payment without a reference: %', r; end if;
end $$;

-- B tries entries that break the rules, then a valid one; a third team goes on the waitlist (cap 2).
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
do $$
declare r jsonb; n int; md uuid := (select v from ids where k = 'md');
begin
  r := public.register_entry(md, jsonb_build_array(pg_temp.player('Bina', '9800000021', 'f', 30, 3.0), pg_temp.player('Bala', '9800000022', 'm', 30, 3.0)), 'unpaid', null);
  if r ->> 'error' <> 'This event is for men' then raise exception 'FAIL: gender rule: %', r; end if;
  r := public.register_entry(md, jsonb_build_array(pg_temp.player('Bala', '9800000022', 'm', 30, 3.8), pg_temp.player('Bhanu', '9800000023', 'm', 30, 3.0)), 'unpaid', null);
  if r ->> 'error' not like '%above this event''s cap%' then raise exception 'FAIL: rating cap: %', r; end if;
  r := public.register_entry(md, jsonb_build_array(pg_temp.player('Bala', '9800000001', 'm', 30, 3.0), pg_temp.player('Bhanu', '9800000023', 'm', 30, 3.0)), 'unpaid', null);
  if r ->> 'error' not like '%phone number is already entered%' then raise exception 'FAIL: same phone entered twice: %', r; end if;
  r := public.register_entry(md, jsonb_build_array(pg_temp.player('Bala', '9800000022', 'm', 30, 3.0), pg_temp.player('Bhanu', '9800000023', 'm', 30, 3.0)), 'claimed', 'UPI123456');
  if r ->> 'status' <> 'pending' then raise exception 'FAIL: B''s valid entry: %', r; end if;
  -- B sees only their own entry; can't accept it themselves; can't read phone numbers via the helper.
  select count(*) into n from public.registrations;
  if n <> 1 then raise exception 'FAIL: B sees % registrations, expected 1', n; end if;
  update public.registrations set status = 'accepted', payment = 'paid';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a player accepted their own entry'; end if;
  begin
    perform public.entered_phones(md, null);
    raise exception 'FAIL: a player can read entered phone numbers';
  exception when insufficient_privilege then null; end;
end $$;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
do $$
declare r jsonb;
begin
  r := public.register_entry((select v from ids where k = 'md'), jsonb_build_array(pg_temp.player('Dhruv', '9800000031', 'm', 30, 3.0), pg_temp.player('Dinesh', '9800000032', 'm', 30, 3.0)), 'unpaid', null);
  if r ->> 'status' <> 'waitlist' then raise exception 'FAIL: the third team should be on the waitlist (cap 2): %', r; end if;
end $$;

-- The organiser sees every entry, accepts, marks paid, and adds an offline entry (no phone needed, but adults only).
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
do $$
declare n int; r jsonb; s35 uuid := (select v from ids where k = 's35');
begin
  select count(*) into n from public.registrations;
  if n <> 3 then raise exception 'FAIL: organiser sees % registrations, expected 3', n; end if;
  update public.registrations set status = 'accepted', payment = 'paid' where id = (select v from ids where k = 'reg_c');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: organiser couldn''t accept an entry'; end if;
  begin
    update public.registrations set user_id = null where id = (select v from ids where k = 'reg_c');
    raise exception 'FAIL: organiser changed who registered';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  r := public.check_entry(s35, jsonb_build_array(pg_temp.player('Walk In', '', 'm', 50, null)), null);
  if r ->> 'ok' is null then raise exception 'FAIL: offline entry check: %', r; end if;
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status)
    values ((select v from ids where k = 't'), s35, (select v from ids where k = 'club'), 'offline', jsonb_build_array(pg_temp.player('Walk In', '', 'm', 50, null)), 'accepted');
  begin
    insert into public.registrations (tournament_id, division_id, club_id, source, players)
      values ((select v from ids where k = 't'), s35, (select v from ids where k = 'club'), 'offline', jsonb_build_array(pg_temp.player('Kid', '', 'm', 15, null)));
    raise exception 'FAIL: organiser added a minor';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    insert into public.registrations (tournament_id, division_id, club_id, source, user_id, players)
      values ((select v from ids where k = 't'), s35, (select v from ids where k = 'club'), 'online', '00000000-0000-4000-8000-0000000000b1', jsonb_build_array(pg_temp.player('Fake', '9800000099', 'm', 50, null)));
    raise exception 'FAIL: organiser created an online entry in someone''s name';
  exception when insufficient_privilege then null; end;
end $$;

-- C sees their entry as accepted and paid; once accepted, they can still withdraw before the draw.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
do $$
declare r jsonb;
begin
  r := public.my_entries();
  if jsonb_array_length(r) <> 1 or r -> 0 ->> 'status' <> 'accepted' or r -> 0 ->> 'payment' <> 'paid' then raise exception 'FAIL: my entries: %', r; end if;
  if (public.withdraw_my_entry((select v from ids where k = 'reg_c'))) ->> 'ok' is null then raise exception 'FAIL: withdraw'; end if;
  if public.my_entries() -> 0 ->> 'status' <> 'withdrawn' then raise exception 'FAIL: withdraw didn''t stick'; end if;
end $$;

-- Visitors with no account: the event page works; registrations and the queue don't.
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.registrations;
    if n <> 0 then raise exception 'FAIL: visitors can read registrations'; end if;
  exception when insufficient_privilege then null; end;
  begin
    perform public.register_entry((select v from ids where k = 'md'), '[]', 'unpaid', null);
    raise exception 'FAIL: a visitor can call register_entry';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'All Module 2 registration checks passed' as result;
rollback;
