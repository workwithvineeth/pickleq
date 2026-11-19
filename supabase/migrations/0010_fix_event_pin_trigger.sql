-- Applied on the server as club_mode_14_fix_event_pin_trigger.
-- Changing one scorer link's PIN must not update that same row again from inside its own trigger (Postgres refuses:
-- "tuple to be updated was already modified"). Now the trigger updates the event PIN and the other links only.
create or replace function public.scorer_links_event_pin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p text;
begin
  p := public.event_pin_of(new.tournament_id);
  if tg_op = 'INSERT' then
    new.pin := p;
  elsif new.pin is distinct from old.pin and new.pin is distinct from p then
    update public.tournament_pins set pin = new.pin, failed_attempts = 0, locked_until = null, updated_at = now() where tournament_id = new.tournament_id;
    update public.scorer_links set pin = new.pin, failed_attempts = 0, locked_until = null
      where tournament_id = new.tournament_id and id <> new.id and pin <> new.pin;
    new.failed_attempts := 0;
    new.locked_until := null;
  end if;
  return new;
end $$;
revoke execute on function public.scorer_links_event_pin() from public, anon, authenticated;
