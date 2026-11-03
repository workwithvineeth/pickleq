begin;
create temp table ops_fixture (club uuid, tournament uuid, division uuid, p1 uuid, p2 uuid, e1 uuid, e2 uuid, match uuid);
grant select on ops_fixture to authenticated;
insert into ops_fixture select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
insert into auth.users(id,email) values ('aa000000-0000-4000-8000-000000000001','ops-owner@example.test');
insert into public.clubs(id,name) select club,'Operations Fixture' from ops_fixture;
insert into public.club_members(club_id,user_id,role) select club,'aa000000-0000-4000-8000-000000000001','owner' from ops_fixture;
insert into public.tournaments(id,club_id,name,start_date,approval) select tournament,club,'Operations Fixture',current_date,'approved' from ops_fixture;
insert into public.divisions(id,club_id,tournament_id,name,kind,format,pools,advance,sort)
select division,club,tournament,'Singles','singles','{"pool":{"pointsTo":11,"bestOf":1,"golden":true,"scoring":"sideout"}}',1,0,0 from ops_fixture;
insert into public.club_players(id,club_id,name) select p1,club,'First Player' from ops_fixture union all select p2,club,'Second Player' from ops_fixture;
insert into public.entries(id,club_id,division_id,player_ids,pool) select e1,club,division,array[p1],1 from ops_fixture;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aa000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare f ops_fixture; e jsonb; version timestamptz;
begin
  select * into f from ops_fixture;
  e := jsonb_build_object('id',f.e2,'club_id',f.club,'division_id',f.division,'player_ids',array[f.p2],'pool',1,'status','active');
  begin
    perform public.add_late_pool_entry(e,jsonb_build_array(jsonb_build_object('id',f.match,'entry_a',f.e2)));
    raise exception 'FAIL malformed fixture accepted';
  exception when others then
    if sqlerrm <> 'The draw changed. Reload and try again.' then raise; end if;
  end;
  if exists(select 1 from public.entries where id=f.e2) then raise exception 'FAIL orphan entry'; end if;
  perform public.add_late_pool_entry(e,jsonb_build_array(jsonb_build_object('id',f.match,'entry_a',f.e1)));
  begin
    perform public.add_late_pool_entry(e,'[]');
    raise exception 'FAIL duplicate entry';
  exception when others then
    if sqlerrm <> 'A player is already entered in this event' then raise; end if;
  end;
  update public.club_matches set status='done',winner='A',games='[{"a":11,"b":6,"points":""}]' where id=f.match returning updated_at into version;
  perform public.correct_club_match(f.match,'[{"a":6,"b":11,"points":""}]','Reversed scorecards',version);
  if not exists(select 1 from public.club_score_corrections where match_id=f.match and old_winner='A' and new_winner='B') then raise exception 'FAIL missing audit'; end if;
  begin
    update public.club_matches set winner='A' where id=f.match;
    raise exception 'FAIL unaudited write accepted';
  exception when others then
    if sqlerrm <> 'Use the audited correction option for completed matches' then raise; end if;
  end;
end $$;
-- A platform admin without club membership can save a private registration draft.
select set_config('request.jwt.claims','{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}',true);
do $$
declare f ops_fixture; tid uuid := 'aa000000-0000-4000-8000-000000000010';
begin
  select * into f from ops_fixture;
  perform public.create_platform_tournament_draft(
    jsonb_build_object('id',tid,'club_id',f.club,'name','Draft Cup','start_date',current_date,'start_time','09:00','courts',2,'slot_minutes',20,'public_slug','opsdraft1','is_public',true,'registration_open',true),
    '[{"id":"aa000000-0000-4000-8000-000000000011","name":"Singles","kind":"singles","format":{"pool":{"pointsTo":11,"bestOf":1,"scoring":"sideout"}},"pools":1,"advance":0,"sort":0,"gender":"open","dupr_cap":"each"}]'
  );
  begin
    perform public.admin_decide_tournament(tid,true,null);
    raise exception 'FAIL creator approved their own draft';
  exception when others then
    if sqlerrm <> 'Another PaddleQ admin must review the draft you created' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.tournaments where id='aa000000-0000-4000-8000-000000000010' and status='draft' and approval='draft' and not registration_open and not is_public) then
    raise exception 'FAIL draft visibility';
  end if;
end $$;
rollback;
