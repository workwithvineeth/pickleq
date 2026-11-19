-- Referee (event) PIN, personal sign-in PIN and club logo rules (club_mode_13_pin_sign_in_logo; desk access moved in club_mode_18). Acts as the owner's account
-- (Vineeth, owner of Pickleyard), then as a visitor, then as the server (like the pin-sign-in edge function). Rolls
-- back and needs no confirmation in the connector. Expected: no row says FAIL.
begin;
create temp table out (step int, result text) on commit drop;
create temp table ids (k text primary key, v uuid) on commit drop;
create temp table vals (k text primary key, v text) on commit drop;
grant all on out, ids, vals to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}', true);
insert into ids select 'club', id from public.clubs where name = 'Pickleyard';
with x as (insert into public.tournaments (club_id, name, start_date, status, is_public) select v, 'PIN Rollback', current_date + 3, 'live', true from ids where k = 'club' returning id, public_slug)
  insert into ids select 't', id from x;
insert into vals select 'slug', public_slug from public.tournaments where id = (select v from ids where k = 't');
do $$
declare
  c uuid := (select v from ids where k = 'club');
  t uuid := (select v from ids where k = 't');
  p text; q text; n int;
begin
  select pin into p from public.tournament_pins where tournament_id = t;
  insert into out values (1, case when p ~ '^[0-9]{4}$' then 'new tournament gets an event PIN, visible to staff' else 'FAIL no event PIN' end);
  insert into public.scorer_links (tournament_id, club_id, court, pin) values (t, c, 1, '1111'), (t, c, 2, '2222'), (t, c, null, '3333');
  select count(*) into n from public.scorer_links where tournament_id = t and pin = p;
  insert into out values (2, case when n = 3 then 'new links get the event PIN' else 'FAIL links have other PINs: ' || n end);
  update public.scorer_links set pin = '5829' where tournament_id = t and court = 1;
  select count(*) into n from public.scorer_links where tournament_id = t and pin = '5829';
  select pin into q from public.tournament_pins where tournament_id = t;
  insert into out values (3, case when n = 3 and q = '5829' then 'changing one link''s PIN changes them all' else 'FAIL pins not in step' end);
  q := public.set_event_pin(t, '4371');
  select count(*) into n from public.scorer_links where tournament_id = t and pin = '4371';
  insert into out values (4, case when q = '4371' and n = 3 then 'set_event_pin reaches every link' else 'FAIL set_event_pin' end);
  q := public.set_event_pin(t);
  insert into out values (5, case when q ~ '^[0-9]{4}$' and not public.weak_pin(q) then 'random event PIN is 4 digits and not weak' else 'FAIL random pin ' || q end);
  perform public.set_event_pin(t, '4371');
  begin perform public.set_event_pin(t, '12'); insert into out values (6, 'FAIL short PIN allowed');
  exception when others then insert into out values (6, 'short event PIN refused'); end;
  begin perform public.set_my_pin('1234'); insert into out values (7, 'FAIL weak personal PIN allowed');
  exception when others then insert into out values (7, 'weak personal PIN refused'); end;
  perform public.set_my_pin('4826');
  insert into out values (8, case when public.has_my_pin() then 'personal PIN saved (hashed)' else 'FAIL personal PIN' end);
  begin perform public.set_club_logo(c, 'javascript:alert(1)'); insert into out values (9, 'FAIL bad logo url allowed');
  exception when others then insert into out values (9, 'non-https logo refused'); end;
  perform public.set_club_logo(c, 'https://bgaorexagktxxofdkbcm.supabase.co/storage/v1/object/public/posters/logo-test.jpg?v=1');
  insert into storage.objects (bucket_id, name, owner_id) values ('posters', c::text || '/logo.jpg', '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
  insert into out values (10, 'own club logo upload: ok');
  begin insert into storage.objects (bucket_id, name) values ('posters', 'e2e00000-0000-4000-8000-000000000001/logo.jpg');
    insert into out values (11, 'FAIL other club logo upload allowed');
  exception when insufficient_privilege then insert into out values (11, 'other club logo refused'); end;
  begin perform public.helper_pin_check('x', '0000'); insert into out values (12, 'FAIL signed-in user can call helper_pin_check');
  exception when insufficient_privilege then insert into out values (12, 'signed-in users can''t call helper_pin_check'); end;
  begin perform public.pin_login_check('x', '0000'); insert into out values (13, 'FAIL signed-in user can call pin_login_check');
  exception when insufficient_privilege then insert into out values (13, 'signed-in users can''t call pin_login_check'); end;
end $$;
set local role anon;
do $$
declare r jsonb; n int;
begin
  r := public.public_club_logo((select v from vals where k = 'slug'));
  insert into out values (14, case when r->>'logo_url' like 'https://%' and r->>'club' = 'Pickleyard' then 'visitors see the club name and logo' else 'FAIL public logo ' || coalesce(r::text, 'null') end);
  select count(*) into n from public.tournament_pins;
  insert into out values (15, case when n = 0 then 'visitors see no event PINs' else 'FAIL visitor sees PINs' end);
exception when insufficient_privilege then insert into out values (15, 'visitors can''t read event PINs');
end $$;
do $$ begin
  begin perform public.helper_pin_check('x', '0000'); insert into out values (16, 'FAIL visitor can call helper_pin_check');
  exception when insufficient_privilege then insert into out values (16, 'visitors can''t call helper_pin_check'); end;
end $$;
reset role;
-- As the server (what the edge function does with the service key).
do $$
declare
  s text := (select v from vals where k = 'slug');
  t uuid := (select v from ids where k = 't');
  e text := (select email from auth.users where id = '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
  r jsonb; i int;
begin
  -- The old desk sign-in (helper link + event PIN → a coach account) is switched off (club_mode_18): it points to the desk link.
  r := public.helper_pin_check(s, '4371');
  insert into out values (17, case when r->>'error' like 'The desk now has its own link%' then 'old helper sign-in refused before any account is made' else 'FAIL ' || r::text end);
  begin perform public.helper_join(t, '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd', 'x'); insert into out values (18, 'FAIL helper_join still makes coaches');
  exception when others then insert into out values (18, 'helper_join no longer makes anyone a coach'); end;
  r := public.pin_login_check(e, '4826');
  insert into out values (22, case when r->>'email' = e then 'organiser: email + PIN accepted' else 'FAIL ' || r::text end);
  r := public.pin_login_check(e, '9999');
  insert into out values (23, case when r->>'error' like 'That email and PIN%' then 'organiser: wrong PIN refused' else 'FAIL ' || r::text end);
  r := public.pin_login_check('nobody@example.com', '4826');
  insert into out values (24, case when r->>'error' like 'That email and PIN%' then 'organiser: unknown email gets the same message' else 'FAIL ' || r::text end);
end $$;
select step, result from out order by step;
rollback;
