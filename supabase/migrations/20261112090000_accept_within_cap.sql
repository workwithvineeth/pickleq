-- Accepting an entry can't take a category past its limit (divisions.cap), even when two organisers accept the last
-- spot at the same moment: the division row is locked while the count is checked. Only changes to 'accepted' are
-- checked; organisers can still add walk-ins and late entries at the desk on purpose.
create or replace function public.guard_accept_within_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  taken int;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then return new; end if;
  select id, name, cap into d from public.divisions where id = new.division_id for update;
  if d.cap is null then return new; end if;
  select count(*) into taken from public.registrations r
    where r.division_id = new.division_id and r.status = 'accepted' and r.id <> new.id;
  if taken >= d.cap then
    raise exception '% is full (% of % accepted). Raise the limit in the tournament settings, or move someone out first.', d.name, taken, d.cap
      using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.guard_accept_within_cap() from public, anon, authenticated;

drop trigger if exists registrations_accept_within_cap on public.registrations;
create trigger registrations_accept_within_cap before update of status on public.registrations
  for each row execute function public.guard_accept_within_cap();
