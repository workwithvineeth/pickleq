begin;
create temp table result_ids (k text, v uuid);
grant all on result_ids to authenticated;
-- Distinct platform admin, organiser, player and outsider. All fixtures roll back.
insert into auth.users(id,email) values
 ('ab000000-0000-4000-8000-000000000001','results-organiser@example.test'),
 ('ab000000-0000-4000-8000-000000000002','results-player@example.test'),
 ('ab000000-0000-4000-8000-000000000003','results-outsider@example.test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into result_ids values ('club',public.create_club('Results Fixture','Test City','Organiser'));
reset role;
update public.clubs set hosting='approved' where id=(select v from result_ids where k='club');
insert into public.club_members(club_id,user_id,role) select v,'ab000000-0000-4000-8000-000000000002','player' from result_ids where k='club';
insert into public.tournaments(id,club_id,name,start_date,status) select 'ab000000-0000-4000-8000-000000000010',v,'Results Fixture',current_date,'live' from result_ids where k='club';
insert into public.divisions(id,tournament_id,club_id,name,kind,format,pools,advance,sort)
 select 'ab000000-0000-4000-8000-000000000011','ab000000-0000-4000-8000-000000000010',v,'Singles','singles',
 '{"pool":{"pointsTo":11,"bestOf":1,"scoring":"sideout","golden":true},"ko":{"pointsTo":11,"bestOf":1,"scoring":"sideout","golden":true}}',1,0,0 from result_ids where k='club';
insert into public.club_players(id,club_id,name,dupr_singles,dupr_doubles,dupr_id)
 select 'ab000000-0000-4000-8000-000000000012',v,'Fixture Player',3.25,4.1,'ABC123' from result_ids where k='club';
insert into public.entries(id,division_id,club_id,player_ids,pool)
 select 'ab000000-0000-4000-8000-000000000013','ab000000-0000-4000-8000-000000000011',v,array['ab000000-0000-4000-8000-000000000012'::uuid],1 from result_ids where k='club';
insert into public.club_matches(club_id,tournament_id,division_id,stage,format,updated_by)
 select v,'ab000000-0000-4000-8000-000000000010','ab000000-0000-4000-8000-000000000011','final',
 '{"pointsTo":11,"bestOf":1,"scoring":"sideout","golden":true}', 'ab000000-0000-4000-8000-000000000001' from result_ids where k='club';
set local role authenticated;
do $$ declare r jsonb; n int; begin
 r:=public.tournament_results_bundle('ab000000-0000-4000-8000-000000000010');
 if r->>'role'<>'owner' or jsonb_array_length(r->'players')<>1 then raise exception 'FAIL organiser results'; end if;
 if (r->'players'->0) ?| array['claim_code','user_id','share'] or (r->'club') ?| array['invite_code','hosting_phone','hosting_note'] then raise exception 'FAIL private fields exposed'; end if;
 if (r->'matches'->0) ? 'updated_by' then raise exception 'FAIL scoring account identity exposed'; end if;
 update public.club_players set dupr_singles=3.456 where id='ab000000-0000-4000-8000-000000000012'; get diagnostics n=row_count;
 if n<>1 then raise exception 'FAIL organiser save denied'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}',true);
do $$ declare r jsonb; n int; begin
 r:=public.tournament_results_bundle('ab000000-0000-4000-8000-000000000010');
 if r ? 'error' or r->>'role'<>'player' then raise exception 'FAIL platform admin read-only access'; end if;
 update public.club_players set dupr_singles=7 where id='ab000000-0000-4000-8000-000000000012'; get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL platform admin gained write access'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare r jsonb; n int; begin
 r:=public.tournament_results_bundle('ab000000-0000-4000-8000-000000000010');
 if r ? 'error' or r->>'role'<>'player' then raise exception 'FAIL player read access'; end if;
 update public.club_players set dupr_singles=7 where id='ab000000-0000-4000-8000-000000000012'; get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL player write access'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if not (public.tournament_results_bundle('ab000000-0000-4000-8000-000000000010') ? 'error') then raise exception 'FAIL outsider access'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.tournament_results_bundle(uuid)','execute') then raise exception 'FAIL anonymous execute'; end if;
end $$;
rollback;
