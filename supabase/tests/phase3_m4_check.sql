-- Phase 3 Module 4: claim codes hidden, account links guarded, player emails private, claim emails limited and logged.
-- Rolls back; problems raise "FAIL: …".
begin;
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'm4-owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000e2', 'm4-member@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000e3', 'asha@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000e4', 'm4-stranger@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, service_role;
create function pg_temp.as_user(u text, e text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'email', e)::text, true) $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
insert into ids values ('club', public.create_club('M4 Club', 'Hyderabad', 'Owner'));
reset role;
insert into ids values ('t', gen_random_uuid()), ('d', gen_random_uuid()), ('asha', gen_random_uuid()), ('bina', gen_random_uuid()), ('chet', gen_random_uuid()), ('ea', gen_random_uuid()), ('eb', gen_random_uuid()), ('ec', gen_random_uuid());
insert into public.tournaments (id, club_id, name, start_date, approval, status, entry_mode) values (pg_temp.id('t'), pg_temp.id('club'), 'Email Open', current_date - 1, 'approved', 'done', 'registration');
insert into public.divisions (id, tournament_id, club_id, name, kind, format, pools, advance) values (pg_temp.id('d'), pg_temp.id('t'), pg_temp.id('club'), 'Singles', 'singles', '{"pointsTo":11}', 1, 0);
insert into public.club_players (id, club_id, name) values (pg_temp.id('asha'), pg_temp.id('club'), 'Asha Rao'), (pg_temp.id('bina'), pg_temp.id('club'), 'Bina Shah'), (pg_temp.id('chet'), pg_temp.id('club'), 'Chet Iyer');
insert into public.entries (id, division_id, club_id, player_ids) values (pg_temp.id('ea'), pg_temp.id('d'), pg_temp.id('club'), array[pg_temp.id('asha')]),
  (pg_temp.id('eb'), pg_temp.id('d'), pg_temp.id('club'), array[pg_temp.id('bina')]), (pg_temp.id('ec'), pg_temp.id('d'), pg_temp.id('club'), array[pg_temp.id('chet')]);
insert into public.club_matches (club_id, tournament_id, division_id, stage, side_a, side_b, format, games, status, winner, played_on) values
  (pg_temp.id('club'), pg_temp.id('t'), pg_temp.id('d'), 'pool', array[pg_temp.id('asha')], array[pg_temp.id('bina')], '{"pointsTo":11}', '[{"a":11,"b":4,"points":""}]', 'done', 'A', current_date - 1);
create temp table invite (code text, claim text) on commit drop;
grant all on invite to authenticated;
insert into invite select c.invite_code, p.claim_code from public.clubs c, public.club_players p where c.id = pg_temp.id('club') and p.id = pg_temp.id('chet');
set local role authenticated;

-- 1. Claim codes: nobody reads them through the API, members included; join_club still uses them.
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
  perform public.join_club((select code from invite), null, 'Member Mo');
  select count(*) into n from public.club_players where club_id = pg_temp.id('club'); if n < 3 then raise exception 'FAIL: member can’t see the roster (%)', n; end if;
  begin perform claim_code from public.club_players limit 1; raise exception 'FAIL: member read claim codes';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  begin perform claim_code from public.club_players limit 1; raise exception 'FAIL: organiser read claim codes';
  exception when insufficient_privilege then null; end;
end $$;

-- 2. Account links: organisers can't link or unlink accounts directly; they can only undo a Player Studio claim.
do $$ begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  update public.club_players set name = 'Chet R Iyer' where id = pg_temp.id('chet');
  if not found then raise exception 'FAIL: organiser can’t rename a player'; end if;
  begin update public.club_players set user_id = '00000000-0000-4000-8000-0000000000e4' where id = pg_temp.id('chet'); raise exception 'FAIL: organiser linked an account';
  exception when insufficient_privilege then null; end;
  begin insert into public.club_players (club_id, name, user_id) values (pg_temp.id('club'), 'Ghost', '00000000-0000-4000-8000-0000000000e4'); raise exception 'FAIL: organiser added a linked player';
  exception when insufficient_privilege then null; end;
  begin perform public.staff_unlink_player(pg_temp.id('chet')); raise exception 'FAIL: unlinked an unclaimed player';
  exception when others then if sqlerrm not like 'This player wasn%' then raise; end if; end;
end $$;
-- The trigger also stops it if column rights are ever widened again.
reset role;
grant update (user_id) on public.club_players to authenticated;
set local role authenticated;
do $$ begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  begin update public.club_players set user_id = '00000000-0000-4000-8000-0000000000e4' where id = pg_temp.id('chet'); raise exception 'FAIL: trigger let an organiser link an account';
  exception when others then if sqlerrm not like 'Players are linked to accounts by claiming%' then raise; end if; end;
end $$;
reset role;
revoke update (user_id) on public.club_players from authenticated;
set local role authenticated;

-- 3. Emails: cleaned, private to staff and the player; registrations clean or refuse them; import keeps them.
do $$ declare n int; e text; j jsonb; begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  insert into public.club_player_emails (player_id, club_id, email) values (pg_temp.id('asha'), pg_temp.id('club'), '  Asha@Example.TEST ');
  insert into public.club_player_emails (player_id, club_id, email) values (pg_temp.id('bina'), pg_temp.id('club'), 'bina@example.test');
  select email into e from public.club_player_emails where player_id = pg_temp.id('asha'); if e <> 'asha@example.test' then raise exception 'FAIL: email not cleaned: %', e; end if;
  begin insert into public.club_player_emails (player_id, club_id, email) values (pg_temp.id('chet'), pg_temp.id('club'), 'not an email'); raise exception 'FAIL: bad email saved';
  exception when check_violation then null; end;
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status)
    values (pg_temp.id('t'), pg_temp.id('d'), pg_temp.id('club'), 'offline', '[{"name":"Dev Nair","phone":"9000000009","gender":"m","age":30,"email":" Dev@Example.TEST"}]', 'pending');
  select r.players -> 0 ->> 'email' into e from public.registrations r where r.tournament_id = pg_temp.id('t') and r.players -> 0 ->> 'name' = 'Dev Nair';
  if e is distinct from 'dev@example.test' then raise exception 'FAIL: registration email not cleaned: %', e; end if;
  begin insert into public.registrations (tournament_id, division_id, club_id, source, players, status)
    values (pg_temp.id('t'), pg_temp.id('d'), pg_temp.id('club'), 'offline', '[{"name":"Bad","phone":"9000000008","gender":"m","age":30,"email":"bad@"}]', 'pending');
    raise exception 'FAIL: bad registration email saved';
  exception when check_violation then null; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
  select count(*) into n from public.club_player_emails; if n <> 0 then raise exception 'FAIL: member sees player emails'; end if;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e4');
  select count(*) into n from public.club_player_emails; if n <> 0 then raise exception 'FAIL: stranger sees player emails'; end if;
  begin insert into public.club_player_emails (player_id, club_id, email) values (pg_temp.id('chet'), pg_temp.id('club'), 'x@example.test'); raise exception 'FAIL: stranger added an email';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.tournaments set drawn_at = null where id = pg_temp.id('t');
set local role authenticated;
do $$ declare j jsonb; e text; begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  j := public.import_entries(pg_temp.id('t'), jsonb_build_array(jsonb_build_object('division', pg_temp.id('d'),
    'players', '[{"name":"Esha Pal","phone":"9000000010","gender":"f","adult":"true","email":"Esha@Example.test"}]'::jsonb)));
  if (j ->> 'added')::int <> 1 then raise exception 'FAIL: import: %', j; end if;
  select r.players -> 0 ->> 'email' into e from public.registrations r where r.players -> 0 ->> 'name' = 'Esha Pal';
  if e is distinct from 'esha@example.test' then raise exception 'FAIL: import dropped the email: %', e; end if;
end $$;

-- Online entries keep the email too.
reset role;
insert into ids values ('t2', gen_random_uuid()), ('d2', gen_random_uuid());
insert into public.tournaments (id, club_id, name, start_date, approval, entry_mode, registration_open) values (pg_temp.id('t2'), pg_temp.id('club'), 'Open Entry Cup', current_date + 9, 'approved', 'registration', true);
insert into public.divisions (id, tournament_id, club_id, name, kind, format, pools, advance) values (pg_temp.id('d2'), pg_temp.id('t2'), pg_temp.id('club'), 'Singles', 'singles', '{"pointsTo":11}', 1, 0);
set local role authenticated;
do $$ declare j jsonb; e text; begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e4', 'm4-stranger@example.test');
  j := public.register_entry(pg_temp.id('d2'), '[{"name":"Stranger Sam","phone":"9000000011","gender":"m","age":40,"email":"Sam@Example.test"}]', 'venue', null);
  if j ->> 'error' is not null then raise exception 'FAIL: online entry: %', j; end if;
  select r.players -> 0 ->> 'email' into e from public.registrations r where r.id = (j ->> 'id')::uuid;
  if e is distinct from 'sam@example.test' then raise exception 'FAIL: online entry dropped the email: %', e; end if;
end $$;

-- 4. Player Studio finds a player by verified sign-in email, and the player then sees their own email.
do $$ declare j jsonb; n int; begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e4', 'm4-stranger@example.test');
  if jsonb_array_length(public.studio_found_players()) <> 0 then raise exception 'FAIL: stranger found players'; end if;
  begin perform public.studio_claim(null, pg_temp.id('asha'), true); raise exception 'FAIL: stranger claimed by id';
  exception when others then if sqlerrm not like 'You can only claim yourself%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e3', 'Asha@Example.test');
  j := public.studio_found_players();
  if jsonb_array_length(j) <> 1 or j -> 0 ->> 'name' <> 'Asha Rao' then raise exception 'FAIL: not found by email: %', j; end if;
  perform public.studio_claim(null, pg_temp.id('asha'), true);
  select count(*) into n from public.club_player_emails; if n <> 1 then raise exception 'FAIL: player sees % emails', n; end if;
  -- The organiser can undo that claim; it's logged.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
  begin perform public.staff_unlink_player(pg_temp.id('asha')); raise exception 'FAIL: member unlinked a player';
  exception when others then if sqlerrm not like 'Only the club%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  perform public.staff_unlink_player(pg_temp.id('asha'));
  if exists (select 1 from public.club_players where id = pg_temp.id('asha') and user_id is not null) then raise exception 'FAIL: still linked'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.platform_audit where action = 'player_unlinked' and club_id = pg_temp.id('club')) then raise exception 'FAIL: unlink not logged'; end if;
end $$;
set local role authenticated;

-- 5. Claim emails: staff only, only players with an email, no repeats, logged with a masked address, rate-limited.
do $$ declare j jsonb; begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
  begin perform public.claim_email_batch(pg_temp.id('t'), null, 'live'); raise exception 'FAIL: member emailed results';
  exception when others then if sqlerrm not like 'Only the club%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  begin perform public.claim_email_batch(pg_temp.id('t'), null, 'off'); raise exception 'FAIL: sent while switched off';
  exception when others then if sqlerrm not like 'Email sending isn%' then raise; end if; end;
  j := public.claim_email_batch(pg_temp.id('t'), null, 'live');
  if jsonb_array_length(j -> 'targets') <> 2 or (j ->> 'skipped')::int <> 1 or j ->> 'tournament' <> 'Email Open' then raise exception 'FAIL: batch: %', j; end if;
  if length(j -> 'targets' -> 0 ->> 'token') <> 64 then raise exception 'FAIL: no claim token in the batch'; end if;
  if (select sent_to from public.claim_email_log where player_id = pg_temp.id('asha')) <> 'a•••@example.test' then raise exception 'FAIL: address not masked'; end if;
  if jsonb_array_length(public.claim_email_batch(pg_temp.id('t'), null, 'live') -> 'targets') <> 0 then raise exception 'FAIL: emailed twice'; end if;
  begin perform public.claim_email_result(1, true, 'x'); raise exception 'FAIL: app recorded a send result';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select public.claim_email_result(id, true, 'brevo-123') from public.claim_email_log where player_id = pg_temp.id('asha');
reset role;
do $$ begin
  if (select status from public.claim_email_log where player_id = pg_temp.id('asha')) <> 'sent' then raise exception 'FAIL: result not recorded'; end if;
  -- Use up the club's daily allowance: nothing more goes out, and the reply says so.
  insert into public.claim_email_log (club_id, sent_to, status) select pg_temp.id('club'), 'x•••@example.test', 'sent' from generate_series(1, 100);
  delete from public.claim_email_log where player_id = pg_temp.id('bina');
end $$;
set local role authenticated;
do $$ declare j jsonb; begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
  j := public.claim_email_batch(pg_temp.id('t'), array[pg_temp.id('bina')], 'live');
  if jsonb_array_length(j -> 'targets') <> 0 or (j ->> 'limited')::boolean is not true then raise exception 'FAIL: rate limit: %', j; end if;
end $$;

-- Visitors: no roster, no emails, no email functions.
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.club_players limit 1; raise exception 'FAIL: anon reads the roster';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.club_player_emails limit 1; raise exception 'FAIL: anon reads emails';
  exception when insufficient_privilege then null; end;
  begin perform public.claim_email_batch(gen_random_uuid(), null, 'live'); raise exception 'FAIL: anon emailed';
  exception when insufficient_privilege then null; end;
end $$;
select 'phase3_m4 ok';
rollback;
