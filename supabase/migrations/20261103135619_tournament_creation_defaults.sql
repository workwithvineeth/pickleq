-- New app-created tournaments start hidden and closed. Publication and entry
-- opening remain separate, explicit operations on the saved tournament.
create function public.guard_tournament_creation_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.listing := 'none';
    new.registration_open := false;
  end if;
  return new;
end $$;
revoke execute on function public.guard_tournament_creation_defaults() from public, anon, authenticated;
create trigger tournaments_guard_creation_defaults before insert on public.tournaments
for each row execute function public.guard_tournament_creation_defaults();
