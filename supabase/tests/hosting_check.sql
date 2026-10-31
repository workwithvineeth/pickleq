-- Club approval check: a new club can't host until PaddleQ approves it. Rolls back; any problem raises "FAIL: …".
begin;

insert into auth.users (id, email, aud, role, instance_id)
values ('00000000-0000-4000-8000-0000000000d1', 'host-a@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-8000-0000000000d2', 'host-b@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
-- The platform admin used here: Vineeth's account, as on the real server and in ci_seed.sql.
insert into auth.users (id, email, aud, role, instance_id)
values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') on conflict (id) do nothing;
insert into public.platform_admins (user_id) values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd') on conflict do nothing;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
insert into ids values ('club', public.create_club('Host Club', 'Hyderabad', 'Asha'));

do $$
declare r jsonb; h text; failed boolean;
begin
  select hosting into h from public.clubs where id = (select v from ids where k = 'club');
  if h is distinct from 'pending' then raise exception 'FAIL: a new club starts as %, not pending', h; end if;

  -- 1. No tournament before approval, whichever way it's tried.
  failed := false;
  begin insert into public.tournaments (club_id, name, start_date) select v, 'Too Early Open', current_date + 5 from ids where k = 'club';
  exception when others then failed := sqlerrm like '%hasn’t approved this club%'; end;
  if not failed then raise exception 'FAIL: an unapproved club added a tournament'; end if;

  -- 2. The organiser can't approve their own club.
  failed := false;
  begin update public.clubs set hosting = 'approved' where id = (select v from ids where k = 'club');
  exception when others then failed := true; end;
  if not failed and (select hosting from public.clubs where id = (select v from ids where k = 'club')) = 'approved' then raise exception 'FAIL: organiser approved their own club'; end if;
  r := public.admin_set_club_hosting((select v from ids where k = 'club'), true, null);
  if r->>'error' is null then raise exception 'FAIL: a non-admin could approve a club'; end if;

  -- 3. The request needs a phone number; then it's sent.
  r := public.request_hosting((select v from ids where k = 'club'), '123', 'Hi');
  if r->>'error' is null then raise exception 'FAIL: a request without a real phone number went through'; end if;
  r := public.request_hosting((select v from ids where k = 'club'), '+91 98765 43210', 'Four courts in Uppal');
  if r->>'ok' is null then raise exception 'FAIL: a proper request was refused: %', r; end if;
end $$;

-- 4. Someone outside the club can't send its request.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d2');
do $$
declare r jsonb;
begin
  r := public.request_hosting((select v from ids where k = 'club'), '9876543210', 'x');
  if r->>'error' is null then raise exception 'FAIL: an outsider sent another club''s request'; end if;
end $$;

-- 5. A rejection needs a reason; the organiser sees it. Then approval lets the club host.
select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
do $$
declare r jsonb; c record;
begin
  r := public.admin_clubs();
  if not (r->0 ? 'logo_url') then raise exception 'FAIL: admin club list has no logo_url'; end if;
  if not exists (select 1 from jsonb_array_elements(r) e where e->>'name' = 'Host Club' and e->>'hosting' = 'pending' and e->>'hosting_phone' = '+91 98765 43210') then
    raise exception 'FAIL: admin list doesn''t show the waiting request with its phone';
  end if;
  r := public.admin_set_club_hosting((select v from ids where k = 'club'), false, '');
  if r->>'error' is null then raise exception 'FAIL: rejected without a reason'; end if;
  r := public.admin_set_club_hosting((select v from ids where k = 'club'), false, 'Add your venue address');
  if r->>'ok' is null then raise exception 'FAIL: admin couldn''t reject: %', r; end if;
end $$;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
do $$
declare r jsonb; c record; failed boolean := false;
begin
  select hosting, hosting_reason into c from public.clubs where id = (select v from ids where k = 'club');
  if c.hosting <> 'rejected' or c.hosting_reason <> 'Add your venue address' then raise exception 'FAIL: organiser doesn''t see the rejection and reason'; end if;
  begin insert into public.tournaments (club_id, name, start_date) select v, 'Still Early', current_date + 5 from ids where k = 'club';
  exception when others then failed := true; end;
  if not failed then raise exception 'FAIL: a rejected club added a tournament'; end if;
  r := public.request_hosting((select v from ids where k = 'club'), '9876543210', 'Venue: Court One, Uppal');
  if r->>'ok' is null then raise exception 'FAIL: couldn''t ask again after a rejection'; end if;
end $$;

select pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
select public.admin_set_club_hosting((select v from ids where k = 'club'), true, null);

select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
do $$
begin
  insert into public.tournaments (club_id, name, start_date) select v, 'Approved Open', current_date + 5 from ids where k = 'club';
  if (select hosting from public.clubs where id = (select v from ids where k = 'club')) <> 'approved' then raise exception 'FAIL: approval didn''t stick'; end if;
exception when others then raise exception 'FAIL: an approved club couldn''t add a tournament: %', sqlerrm;
end $$;

select 'All club approval checks passed' as result;
rollback;
