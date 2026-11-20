-- Late entries with full player details (migration 20261121030000). Rolls back; a row that says FAIL is a problem.
begin;
create temp table lt (club uuid, tournament uuid, division uuid, p1 uuid, p2 uuid, p3 uuid, p4 uuid, e1 uuid, e2 uuid, m1 uuid, p5 uuid, p6 uuid);
grant select on lt to authenticated;
insert into lt select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
insert into auth.users(id,email) values ('ab000000-0000-4000-8000-000000000001','late-owner@example.test'), ('ab000000-0000-4000-8000-000000000002','late-stranger@example.test');
insert into public.clubs(id,name) select club,'Late Team Fixture' from lt;
insert into public.club_members(club_id,user_id,role) select club,'ab000000-0000-4000-8000-000000000001','owner' from lt;
insert into public.tournaments(id,club_id,name,start_date,approval,entry_mode,drawn_at) select tournament,club,'Late Team Fixture',current_date,'approved','registration',now() from lt;
-- A paid women's doubles event: the old late entry refused it outright.
insert into public.divisions(id,club_id,tournament_id,name,kind,format,pools,advance,sort,fee,gender)
select division,club,tournament,'Women''s Doubles','doubles','{"pool":{"pointsTo":11,"bestOf":1,"golden":true,"scoring":"rally"}}',1,0,0,500,'women' from lt;
insert into public.club_players(id,club_id,name) select p1,club,'Asha Fixture' from lt union all select p2,club,'Bela Fixture' from lt
  union all select p5,club,'Roster One' from lt union all select p6,club,'Roster Two' from lt;
insert into public.entries(id,club_id,division_id,player_ids,pool) select e1,club,division,array[p1,p2],1 from lt;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare f lt; e jsonb; m jsonb; ppl jsonb;
begin
  select * into f from lt;
  e := jsonb_build_object('id',f.e2,'club_id',f.club,'division_id',f.division,'player_ids',array[f.p3,f.p4],'pool',1,'status','active');
  m := jsonb_build_array(jsonb_build_object('id',f.m1,'entry_a',f.e1,'round',1,'slot',3,'court',1));
  -- Roster late entry still refuses a fee event, and now says what to do instead.
  begin
    perform public.add_late_pool_entry(jsonb_set(e,'{player_ids}',to_jsonb(array[f.p5,f.p6])), m);
    raise exception 'FAIL roster late entry accepted for a fee event';
  exception when others then
    if sqlerrm not like 'This event needs each player%' then raise; end if;
  end;
  -- Wrong gender for a women's event is refused by the usual rules.
  ppl := jsonb_build_array(
    jsonb_build_object('id',f.p3,'name','Chitra Fixture','phone','','email','chitra@example.test','duprId','','dupr',3.2,'gender','f','age',30),
    jsonb_build_object('id',f.p4,'name','Dev Fixture','phone','','duprId','','dupr',null,'gender','m','age',31));
  begin
    perform public.add_late_team(ppl,'paid',e,m);
    raise exception 'FAIL man accepted in a women''s event';
  exception when others then
    if sqlerrm <> 'This event is for women' then raise; end if;
  end;
  if exists(select 1 from public.club_players where id in (f.p3,f.p4)) then raise exception 'FAIL players left behind after a refused entry'; end if;
  -- Under 18 is refused.
  ppl := jsonb_set(jsonb_set(ppl,'{1,gender}','"f"'),'{1,age}','16');
  begin
    perform public.add_late_team(ppl,'paid',e,m);
    raise exception 'FAIL under-18 accepted';
  exception when others then
    if sqlerrm not like 'Players must be 18%' then raise; end if;
  end;
  -- A good team: roster rows, email, accepted registration with payment, entry and its match, in one go.
  ppl := jsonb_set(ppl,'{1,age}','29');
  perform public.add_late_team(ppl,'venue',e,m);
  if (select count(*) from public.club_players where id in (f.p3,f.p4)) <> 2 then raise exception 'FAIL players not added'; end if;
  if not exists(select 1 from public.club_player_emails where player_id=f.p3 and email='chitra@example.test') then raise exception 'FAIL email not saved for the Studio claim'; end if;
  if not exists(select 1 from public.registrations where entry_id=f.e2 and status='accepted' and payment='venue' and source='offline') then raise exception 'FAIL registration not saved'; end if;
  if exists(select 1 from public.registrations r, jsonb_array_elements(r.players) p where r.entry_id=f.e2 and p ? 'id') then raise exception 'FAIL internal ids kept in the registration'; end if;
  if not exists(select 1 from public.club_matches where id=f.m1 and entry_a=f.e1 and entry_b=f.e2) then raise exception 'FAIL match not created'; end if;
end $$;
-- Someone who isn't staff can't add a late team.
select set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare f lt;
begin
  select * into f from lt;
  begin
    perform public.add_late_team('[]','paid',jsonb_build_object('id',gen_random_uuid(),'division_id',f.division),'[]');
    raise exception 'FAIL stranger added a late team';
  exception when others then
    if sqlerrm <> 'Only club staff can add entries' then raise; end if;
  end;
end $$;
-- The internal helpers stay closed to signed-in users.
select case when has_function_privilege('authenticated','public.late_team_internal(jsonb,text,jsonb,jsonb)','execute')
  or has_function_privilege('authenticated','public.add_late_pool_entry_core(jsonb,jsonb,boolean)','execute')
  then 'FAIL internal late-entry helpers are callable' else 'ok internal helpers closed' end as late_team_privileges;
select 'ok late team checks' as late_team_check;
rollback;
