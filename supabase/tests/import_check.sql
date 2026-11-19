-- Signed-in check of club_mode_12 (Google Form import, team-average DUPR cap, adults confirmed without an age, knockout
-- rounds of 16/32) on the real server, acting as Vineeth's own account. Adds no users and rolls everything back,
-- so the Supabase connector runs it without a prompt. Every step should read as expected (no FAIL).
-- Passed on the server 30 Oct 2026 (11/11).
begin;
create temp table ids (k text primary key, v uuid) on commit drop;
create temp table out (step int, result text) on commit drop;
grant all on ids, out to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}', true);
insert into ids select 'club', id from public.clubs where name = 'Pickleyard';
with x as (insert into public.tournaments (club_id, name, start_date, entry_mode, registration_open, city, venue)
  select v, 'Rollback Import Cup', current_date + 2, 'registration', true, 'Hyderabad', 'Test Venue' from ids where k = 'club' returning id)
insert into ids select 't', id from x;
with x as (insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance, max_dupr, gender, sort)
  select (select v from ids where k = 't'), v, 'Singles 3.5', 'singles', '{"pool":{"pointsTo":11,"bestOf":1,"scoring":"sideout","golden":true},"ko":{"pointsTo":15,"bestOf":1,"scoring":"sideout"},"shape":"ko"}', 1, 0, 3.5, 'open', 0 from ids where k = 'club' returning id)
insert into ids select 's', id from x;
with x as (insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance, max_dupr, dupr_cap, gender, cap, sort)
  select (select v from ids where k = 't'), v, 'Doubles 3.5', 'doubles', '{"pool":{"pointsTo":11,"bestOf":1,"scoring":"sideout","golden":true},"ko":{"pointsTo":11,"bestOf":3,"scoring":"sideout"}}', 1, 0, 3.5, 'average', 'open', 2, 1 from ids where k = 'club' returning id)
insert into ids select 'd', id from x;
do $$
declare r jsonb; t uuid := (select v from ids where k = 't'); s uuid := (select v from ids where k = 's'); d uuid := (select v from ids where k = 'd');
  rows jsonb;
begin
  rows := jsonb_build_array(
    jsonb_build_object('division', s, 'status', 'accepted', 'payment', 'unpaid', 'players', '[{"name":"Imp One","phone":"98480 11001","gender":"x","adult":true,"dupr":3.2}]'::jsonb),
    jsonb_build_object('division', s, 'status', 'accepted', 'payment', 'venue', 'players', '[{"name":"Imp Two","phone":"9848011002","gender":"x","adult":true,"dupr":3.9}]'::jsonb),
    jsonb_build_object('division', d, 'status', 'accepted', 'payment', 'paid', 'players', '[{"name":"Imp One","phone":"+91 98480 11001","gender":"x","adult":true,"dupr":3.6},{"name":"Imp Three","phone":"9848011003","gender":"x","adult":true,"dupr":3.2}]'::jsonb),
    jsonb_build_object('division', d, 'status', 'accepted', 'payment', 'unpaid', 'players', '[{"name":"Imp Four","phone":"9848011004","gender":"x","adult":true,"dupr":3.9},{"name":"Imp Five","phone":"9848011005","gender":"x","adult":true,"dupr":3.3}]'::jsonb),
    jsonb_build_object('division', d, 'status', 'accepted', 'payment', 'unpaid', 'players', '[{"name":"Imp Six","phone":"9848011006","gender":"x","adult":true,"dupr":3.0},{"name":"Imp Seven","phone":"9848011007","gender":"x","adult":true,"dupr":3.1}]'::jsonb),
    jsonb_build_object('division', d, 'status', 'accepted', 'payment', 'unpaid', 'players', '[{"name":"Imp Eight","phone":"9848011008","gender":"x","adult":true,"dupr":3.0},{"name":"Imp Nine","phone":"9848011009","gender":"x","adult":true,"dupr":3.1}]'::jsonb),
    jsonb_build_object('division', s, 'status', 'accepted', 'payment', 'unpaid', 'players', '[{"name":"Imp Kid","phone":"9848011010","gender":"x","age":16,"dupr":3.0}]'::jsonb));
  r := public.import_entries(t, rows);
  insert into out values (1, 'first import (expect added 4, waitlisted 1, skipped 0, 3 problems: cap 3.9, team avg 3.6, minor): ' || r::text);
  r := public.import_entries(t, rows);
  insert into out values (2, 'same sheet again (expect added 0, skipped 4, the same 3 problems): ' || r::text);
  insert into out values (3, 'inbox rows (expect 4): ' || (select count(*) from public.registrations where tournament_id = t));
  insert into out values (4, 'doubles with Imp One also in singles (expect 1): ' || (select count(*) from public.registrations where division_id = d and players::text like '%Imp One%'));
  insert into out values (5, 'waitlisted by cap 2 (expect 1): ' || (select count(*) from public.registrations where division_id = d and status = 'waitlist'));
  insert into out values (6, 'adult flag kept, no age (expect true): ' || (select bool_and((p ->> 'adult') = 'true' and p -> 'age' is null) from public.registrations x, jsonb_array_elements(x.players) p where x.tournament_id = t));
  insert into out values (7, 'event page says team average (expect average): ' || (public.public_event((select public_slug from public.tournaments where id = t)) -> 'divisions' -> 1 ->> 'dupr_cap'));
  insert into public.club_matches (club_id, tournament_id, division_id, stage, round, bracket_pos, format, status)
    values ((select v from ids where k = 'club'), t, s, 'r16', 1, 0, '{"pointsTo":11,"bestOf":1,"scoring":"sideout"}', 'scheduled');
  insert into out values (8, 'round of 16 match allowed (expect 1): ' || (select count(*) from public.club_matches where tournament_id = t and stage = 'r16'));
  begin perform public.person_key('{}'::jsonb); insert into out values (9, 'FAIL person_key callable');
  exception when insufficient_privilege then insert into out values (9, 'person_key helper closed'); end;
  update public.tournaments set drawn_at = now() where id = t;
  r := public.import_entries(t, rows);
  insert into out values (10, 'after the draw (expect error): ' || r::text);
end $$;
reset role;
-- A visitor (no account) can't import.
set local role anon;
do $$ begin
  perform public.import_entries('00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb);
  insert into out values (11, 'FAIL visitor could import');
exception when insufficient_privilege then insert into out values (11, 'visitor refused');
end $$;
reset role;
select step, result from out order by step;
rollback;
