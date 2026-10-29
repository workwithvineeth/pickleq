-- Poster storage rules on the real server. Acts as the owner's account (Vineeth, owner of Pickleyard), rolls back,
-- and needs no confirmation in the connector. Expected: every step reads as allowed/refused as labelled (no FAIL).
-- Passed on 29 Oct 2026 when posters were added (club_mode_11_posters).
begin;
create temp table out (step int, result text) on commit drop;
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on out, ids to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}', true);
insert into ids select 'club', id from public.clubs where name = 'Pickleyard';
with x as (insert into public.tournaments (club_id, name, start_date) select v, 'Poster Rollback', current_date + 3 from ids where k = 'club' returning id) insert into ids select 't', id from x;
do $$
declare c uuid := (select v from ids where k='club'); t uuid := (select v from ids where k='t'); n int;
begin
  insert into storage.objects (bucket_id, name, owner_id) values ('posters', c::text || '/' || t::text || '.jpg', '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
  insert into out values (1, 'own club poster upload: ok');
  begin insert into storage.objects (bucket_id, name) values ('posters', 'e2e00000-0000-4000-8000-000000000001/e2e00000-0000-4000-8000-000000000201.jpg');
    insert into out values (2, 'FAIL other club upload allowed');
  exception when insufficient_privilege then insert into out values (2, 'other club refused'); end;
  begin insert into storage.objects (bucket_id, name) values ('posters', c::text || '/anything.jpg');
    insert into out values (3, 'FAIL non-tournament name allowed');
  exception when insufficient_privilege then insert into out values (3, 'non-tournament file name refused'); end;
  update public.tournaments set poster_url = 'https://bgaorexagktxxofdkbcm.supabase.co/storage/v1/object/public/posters/x.jpg?v=1' where id = t; get diagnostics n = row_count;
  insert into out values (4, 'poster_url set by organiser rows (expect 1): ' || n);
  begin update public.tournaments set poster_url = 'javascript:alert(1)' where id = t; insert into out values (5, 'FAIL bad url allowed');
  exception when check_violation then insert into out values (5, 'non-https poster url refused'); end;
end $$;
set local role anon;
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('posters', 'x/y.jpg'); insert into out values (6, 'FAIL visitor upload allowed');
  exception when insufficient_privilege then insert into out values (6, 'visitor upload refused'); end;
end $$;
reset role;
select step, result from out order by step;
rollback;
