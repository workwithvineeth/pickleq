alter table public.tournaments add column platform_draft_creator uuid;

create function public.create_platform_tournament_draft(p_tournament jsonb, p_divisions jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments := jsonb_populate_record(null::public.tournaments, p_tournament);
  d public.divisions;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can create a club draft'; end if;
  if not exists (select 1 from public.clubs where id=t.club_id and not is_test) then raise exception 'Choose a club'; end if;
  if jsonb_typeof(p_divisions) is distinct from 'array' or jsonb_array_length(p_divisions) not between 1 and 20 then
    raise exception 'Add between 1 and 20 events';
  end if;
  insert into public.tournaments(id,club_id,name,start_date,start_time,courts,slot_minutes,status,is_public,public_slug,
    city,venue,about,upi_id,entries_close,entry_mode,registration_open,platform_draft_creator)
  values(t.id,t.club_id,t.name,t.start_date,t.start_time,t.courts,t.slot_minutes,'draft',false,t.public_slug,
    t.city,t.venue,t.about,t.upi_id,t.entries_close,'registration',false,auth.uid());
  for d in select * from jsonb_populate_recordset(null::public.divisions,p_divisions) loop
    insert into public.divisions(id,tournament_id,club_id,name,kind,format,pools,advance,sort,max_dupr,dupr_cap,gender,min_age,cap,fee)
    values(d.id,t.id,t.club_id,d.name,d.kind,d.format,d.pools,d.advance,d.sort,d.max_dupr,d.dupr_cap,d.gender,d.min_age,d.cap,d.fee);
  end loop;
end $$;
revoke execute on function public.create_platform_tournament_draft(jsonb,jsonb) from public, anon;
grant execute on function public.create_platform_tournament_draft(jsonb,jsonb) to authenticated;

create function public.guard_platform_draft_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated','anon') then new.platform_draft_creator := null; end if;
    return new;
  end if;
  if new.platform_draft_creator is distinct from old.platform_draft_creator then raise exception 'Draft creator cannot change'; end if;
  if new.approval is distinct from old.approval and new.approval in ('approved','rejected')
    and old.platform_draft_creator = auth.uid()
    and not exists (select 1 from public.clubs where id = old.club_id and (trusted or is_test))
  then raise exception 'Another PaddleQ admin must review the draft you created'; end if;
  return new;
end $$;
create trigger tournaments_guard_platform_draft_review before insert or update on public.tournaments
for each row execute function public.guard_platform_draft_review();
revoke execute on function public.guard_platform_draft_review() from public, anon, authenticated;
