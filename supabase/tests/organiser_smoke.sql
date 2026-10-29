-- Signed-in check of Module 2 on the real server, acting as the owner's own account (Vineeth: owner of Pickleyard
-- and a PICKLEQ admin). Adds no users and rolls everything back, so the Supabase connector runs it without a prompt.
-- Run after any server change to registration, the board or approval. Every step should read as expected (no FAIL).
-- Found the guard_registration bug on 29 Oct 2026 (registrations failing), which the robot can't reach without an account.
begin;
create temp table ids (k text primary key, v uuid) on commit drop;
create temp table out (step int, result text) on commit drop;
grant all on ids, out to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}', true);
insert into ids select 'club', id from public.clubs where name = 'Pickleyard';
with x as (insert into public.tournaments (club_id, name, start_date, entry_mode, registration_open, city, venue, listing_status, upi_id)
  select v, 'Rollback Cup', current_date + 4, 'registration', true, 'Hyderabad', 'Test Venue', 'approved', 'test@bank' from ids where k = 'club' returning id)
insert into ids select 't', id from x;
with x as (insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance, max_dupr, gender, cap, fee)
  select (select v from ids where k = 't'), v, 'Men 3.5', 'doubles', '{"pool":{"pointsTo":11,"bestOf":1,"scoring":"sideout","golden":true},"ko":{"pointsTo":11,"bestOf":1,"scoring":"sideout"}}', 1, 0, 3.5, 'men', 8, 600 from ids where k = 'club' returning id)
insert into ids select 'md', id from x;
do $$
declare r jsonb; n int; s text; t uuid := (select v from ids where k = 't'); md uuid := (select v from ids where k = 'md');
begin
  select listing_status into s from public.tournaments where id = t;
  insert into out values (1, 'insert forced listing_status (expect none): ' || s);
  begin update public.tournaments set listing_status = 'approved' where id = t; insert into out values (2, 'FAIL self-approve allowed');
  exception when raise_exception then insert into out values (2, 'self-approve refused: ' || sqlerrm); end;
  r := public.submit_listing(t, 'run'); insert into out values (3, 'submit (expect pending unless club verified): ' || r::text);
  insert into out values (4, 'queue has it (expect true): ' || (public.listing_queue()::text like '%Rollback Cup%'));
  r := public.review_listing(t, true, null); insert into out values (6, 'approve: ' || r::text);
  insert into out values (7, 'board after approve (expect true): ' || (public.public_events(false)::text like '%Rollback Cup%'));
  r := public.register_entry(md, '[{"name":"Vin","phone":"9800000001","gender":"m","age":30,"dupr":3.6},{"name":"Pal","phone":"9800000002","gender":"m","age":30,"dupr":3.0}]', 'venue', null);
  insert into out values (8, 'over cap (expect error, cap 3.5): ' || r::text);
  r := public.register_entry(md, '[{"name":"Vin","phone":"9800000001","gender":"m","age":30,"dupr":3.4},{"name":"Pal","phone":"9800000002","gender":"m","age":30,"dupr":3.0}]', 'claimed', 'UPI99887766');
  insert into out values (9, 'valid entry (expect pending): ' || r::text);
  insert into out values (10, 'my_entries (expect pending / claimed): ' || (public.my_entries() -> 0 ->> 'status') || ' / ' || (public.my_entries() -> 0 ->> 'payment'));
  update public.registrations set status = 'accepted', payment = 'paid' where tournament_id = t; get diagnostics n = row_count;
  insert into out values (11, 'organiser accepted rows (expect 1): ' || n);
  begin insert into public.registrations (tournament_id, division_id, club_id, source, players) values (t, md, (select v from ids where k='club'), 'offline', '[{"name":"Kid","phone":"","gender":"m","age":15,"dupr":3.0},{"name":"Dad","phone":"","gender":"m","age":45,"dupr":3.0}]');
    insert into out values (12, 'FAIL minor added');
  exception when raise_exception then insert into out values (12, 'minor refused: ' || sqlerrm); end;
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status) values (t, md, (select v from ids where k='club'), 'offline', '[{"name":"Desk","phone":"","gender":"m","age":40,"dupr":3.0},{"name":"Two","phone":"","gender":"m","age":45,"dupr":3.2}]', 'accepted');
  insert into out values (13, 'offline entry; inbox rows (expect 2): ' || (select count(*) from public.registrations where tournament_id = t));
  insert into out values (15, 'event page has no phones (expect true): ' || (public.public_event((select public_slug from public.tournaments where id = t))::text not like '%9800000001%'));
  begin perform public.entered_phones(md, null); insert into out values (16, 'FAIL phones readable');
  exception when insufficient_privilege then insert into out values (16, 'phones helper closed'); end;
  r := public.withdraw_my_entry((select id from public.registrations where tournament_id = t and source = 'online'));
  insert into out values (18, 'withdraw (expect withdrawn): ' || (public.my_entries() -> 0 ->> 'status'));
end $$;
reset role;
select step, result from out order by step;
rollback;
