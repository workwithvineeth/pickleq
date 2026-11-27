-- Player Studio photo rules. Rolls back (the runner wraps it; ends with rollback). Passed on the real server 20 Nov 2026. Rows say FAIL on a problem.
begin;
create temp table out (step int, result text) on commit drop;
grant all on out to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}', true);
do $$ declare x uuid; begin
  insert into storage.objects (bucket_id, name, owner_id) values ('player-photos', '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd/cover.jpg', '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd') returning id into x;
  insert into out values (1, 'own photo upload (insert … returning): ok');
  begin insert into storage.objects (bucket_id, name) values ('player-photos', 'e2e00000-0000-4000-8000-000000000001/cover.jpg');
    insert into out values (2, 'FAIL upload to another player allowed');
  exception when insufficient_privilege then insert into out values (2, 'another player''s photo refused'); end;
  begin insert into storage.objects (bucket_id, name) values ('player-photos', '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd/other.jpg');
    insert into out values (3, 'FAIL other file name allowed');
  exception when insufficient_privilege then insert into out values (3, 'other file name refused'); end;
  insert into out select 4, case when count(*) = 1 then 'player sees only their own photo' else 'FAIL player sees ' || count(*) end
    from storage.objects where bucket_id = 'player-photos';
end $$;
select set_config('request.jwt.claims', '{"sub":"e2e00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into out select 5, case when count(*) = 0 then 'other player sees no photos' else 'FAIL other player sees a photo' end from storage.objects where bucket_id = 'player-photos';
set local role anon;
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('player-photos', 'x/cover.jpg'); insert into out values (6, 'FAIL visitor upload allowed');
  exception when insufficient_privilege then insert into out values (6, 'visitor upload refused'); end;
  insert into out select 7, case when count(*) = 0 then 'visitor sees no photos' else 'FAIL visitor sees photos' end from storage.objects where bucket_id = 'player-photos';
end $$;
reset role;
select case when b.public then 'FAIL bucket is public' else 'bucket is private' end from storage.buckets b where b.id = 'player-photos';
select step, result from out order by step;
rollback;
