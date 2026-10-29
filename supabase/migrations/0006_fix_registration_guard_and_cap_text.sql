-- Applied on the server as club_mode_9_fix_registration_guard and club_mode_10_cap_text.
-- 1. guard_registration used "d" both as a variable and as a table alias, so every new registration failed with
--    "column reference d.id is ambiguous" (found by the real-server check on 29 Oct 2026). Same checks, alias renamed.
-- 2. Entry messages show a DUPR cap as players write it (3.5, not 3.500): see cap_text, used in entry_problem.
--    The full new entry_problem is as in 0004 with public.cap_text(d.max_dupr) in the two cap messages.
create or replace function public.guard_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  div public.divisions;
  problem text;
begin
  if tg_op = 'INSERT' or new.players is distinct from old.players or new.division_id is distinct from old.division_id then
    select * into div from public.divisions where id = new.division_id;
    problem := public.entry_problem(div, new.players, new.source = 'online');
    if problem is not null then raise exception '%', problem; end if;
  end if;
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id
    or new.tournament_id is distinct from old.tournament_id or new.club_id is distinct from old.club_id or new.source is distinct from old.source
    or new.created_at is distinct from old.created_at) then
    raise exception 'That part of a registration can''t be changed';
  end if;
  if tg_op = 'UPDATE' and new.division_id is distinct from old.division_id
    and not exists (select 1 from public.divisions x where x.id = new.division_id and x.tournament_id = new.tournament_id) then
    raise exception 'That event isn''t part of this tournament';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_registration() from public, anon, authenticated;

create or replace function public.cap_text(x numeric) returns text
language sql immutable set search_path = '' as $$ select rtrim(rtrim(x::text, '0'), '.') $$;
revoke execute on function public.cap_text(numeric) from public, anon, authenticated;
