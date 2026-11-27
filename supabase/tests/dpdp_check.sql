-- DPDP check: consent is recorded and withdrawn only for yourself; "delete my data" wipes your diary,
-- unclaims you, blanks contact details on finished entries but keeps them on upcoming ones;
-- only PaddleQ admins see and finish requests, and not while an entry is still open. Rolls back; problems raise "FAIL: …".
begin;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-0000000000d1', 'dp-owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000d2', 'dp-player@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000d3', 'dp-other@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into auth.users (id, email, aud, role, instance_id)
values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') on conflict (id) do nothing;
insert into public.platform_admins (user_id) values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd') on conflict do nothing;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, anon;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1');
insert into ids values ('club', public.create_club('Privacy Club', 'Pune', 'Mira'));
reset role;

-- One finished and one upcoming tournament, each with an online entry by the player; a claimed roster player with an email.
insert into public.tournaments (id, club_id, name, start_date, status, approval) values
  ('00000000-0000-4000-8000-0000000000e1', pg_temp.id('club'), 'Old Open', current_date - 10, 'done', 'approved'),
  ('00000000-0000-4000-8000-0000000000e2', pg_temp.id('club'), 'Next Open', current_date + 10, 'draft', 'approved');
insert into public.divisions (id, tournament_id, club_id, name, kind, format, pools, advance) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', pg_temp.id('club'), 'Singles', 'singles', '{"bestOf":1,"pointsTo":11}', 1, 0),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', pg_temp.id('club'), 'Singles', 'singles', '{"bestOf":1,"pointsTo":11}', 1, 0);
insert into public.registrations (tournament_id, division_id, club_id, user_id, players, status) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', pg_temp.id('club'), '00000000-0000-4000-8000-0000000000d2',
   '[{"name":"Kavi Rao","phone":"9000000001","email":"kavi@example.test","age":30,"gender":"m"}]', 'accepted'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000f2', pg_temp.id('club'), '00000000-0000-4000-8000-0000000000d2',
   '[{"name":"Kavi Rao","phone":"9000000001","email":"kavi@example.test","age":30,"gender":"m"}]', 'accepted');
insert into public.club_players (id, club_id, name, user_id, claimed_at)
  values ('00000000-0000-4000-8000-0000000000c1', pg_temp.id('club'), 'Kavi Rao', '00000000-0000-4000-8000-0000000000d2', now());
insert into public.club_player_emails (player_id, club_id, email) values ('00000000-0000-4000-8000-0000000000c1', pg_temp.id('club'), 'kavi@example.test');
insert into public.player_studio_ratings (owner_id, kind, value, rated_on) values ('00000000-0000-4000-8000-0000000000d2', 'singles', 3.5, current_date);

set local role authenticated;
do $$
declare r jsonb; n int;
begin
  -- Signed out: nothing.
  perform set_config('request.jwt.claims', '', true);
  begin perform public.record_consent('entry', '2026-11-27'); raise exception 'FAIL: consent recorded while signed out';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;

  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d2');
  perform public.record_consent('entry', '2026-11-27');
  begin perform public.record_consent('marketing', '2026-11-27'); raise exception 'FAIL: unknown purpose accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.record_consent('entry', 'latest'); raise exception 'FAIL: notice version without a date accepted';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin insert into public.consent_records (user_id, purpose, notice_version) values (auth.uid(), 'entry', '2026-11-27'); raise exception 'FAIL: direct insert allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  select count(*) into n from public.consent_records;
  if n <> 1 then raise exception 'FAIL: player sees % consent rows, expected 1', n; end if;

  -- Someone else sees none of it and cannot use the admin functions.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d3');
  select count(*) into n from public.consent_records;
  if n <> 0 then raise exception 'FAIL: another person sees consent rows'; end if;
  if public.admin_deletion_requests() is not null then raise exception 'FAIL: non-admin listed deletion requests'; end if;
  if public.withdraw_consent() <> 0 then raise exception 'FAIL: withdrew someone else''s consent'; end if;

  -- Withdraw.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000d2');
  if public.withdraw_consent() <> 1 then raise exception 'FAIL: withdraw did not mark the record'; end if;

  -- Delete my data.
  perform public.record_consent('account', '2026-11-27');
  r := public.request_data_deletion();
  if (r ->> 'openEntries')::int <> 1 then raise exception 'FAIL: expected 1 open entry, got %', r; end if;
  if exists (select 1 from public.consent_records where withdrawn_at is null) then raise exception 'FAIL: consent still active after delete request'; end if;
  r := public.request_data_deletion();
  select count(*) into n from public.deletion_requests;
  if n <> 1 then raise exception 'FAIL: asking twice made % requests', n; end if;
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.player_studio_ratings where owner_id = '00000000-0000-4000-8000-0000000000d2') then raise exception 'FAIL: diary kept'; end if;
  if exists (select 1 from public.club_players where user_id = '00000000-0000-4000-8000-0000000000d2') then raise exception 'FAIL: still claimed'; end if;
  if exists (select 1 from public.club_player_emails where player_id = '00000000-0000-4000-8000-0000000000c1') then raise exception 'FAIL: club still holds the email'; end if;
  if (select players -> 0 ? 'phone' from public.registrations where tournament_id = '00000000-0000-4000-8000-0000000000e1') then raise exception 'FAIL: finished entry kept the phone'; end if;
  if (select players -> 0 ->> 'name' from public.registrations where tournament_id = '00000000-0000-4000-8000-0000000000e1') <> 'Kavi Rao' then raise exception 'FAIL: finished entry lost the name'; end if;
  if not (select players -> 0 ? 'phone' from public.registrations where tournament_id = '00000000-0000-4000-8000-0000000000e2') then raise exception 'FAIL: upcoming entry lost the phone before the event'; end if;
end $$;

set local role authenticated;
do $$
declare r jsonb; req uuid;
begin
  perform pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
  r := public.admin_deletion_requests();
  if jsonb_array_length(r) <> 1 or (r -> 0 ->> 'openEntries')::int <> 1 then raise exception 'FAIL: admin list wrong: %', r; end if;
  req := (r -> 0 ->> 'id')::uuid;
  r := public.admin_finish_deletion(req);
  if r ->> 'error' is null then raise exception 'FAIL: finished while an entry was still open'; end if;
  perform set_config('test.req', req::text, true);
end $$;
reset role;
update public.tournaments set status = 'done' where id = '00000000-0000-4000-8000-0000000000e2';
set local role authenticated;
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
  r := public.admin_finish_deletion(current_setting('test.req')::uuid);
  if r ->> 'ok' is null then raise exception 'FAIL: admin could not finish: %', r; end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d2') then raise exception 'FAIL: account not deleted'; end if;
  if exists (select 1 from public.registrations where players::text like '%9000000001%') then raise exception 'FAIL: a phone number survived'; end if;
  if (select status from public.deletion_requests) <> 'done' then raise exception 'FAIL: request not marked done'; end if;
  if (select email from public.deletion_requests) is not null then raise exception 'FAIL: done request still holds the email'; end if;
end $$;

select 'dpdp ok';
rollback;
