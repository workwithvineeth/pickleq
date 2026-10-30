-- Applied on the server as club_mode_13_pin_sign_in_logo.
-- Sign-in without email codes (the email sender isn't set up, and most helpers don't want an account anyway):
--   1. One event PIN per tournament. Every court's scorer link uses it, and desk helpers sign in with it through the
--      tournament's helper link. Helpers become the club's coaches while the tournament runs (and drop back to players
--      when it's marked finished).
--   2. A personal sign-in PIN for organisers: set once in My club, then sign in with email + PIN.
-- Sign-in itself happens in the edge function pin-sign-in, which calls the service-only functions below and then makes a
-- one-off sign-in token (no email is sent).
-- 3. A club logo, shown on the club's pages, its event pages and public results.
-- Nothing here removes rows (the Supabase connector cancels that).

-- ---------- 1. Event PIN ----------

create table public.tournament_pins (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  pin text not null default lpad((floor(random() * 10000))::int::text, 4, '0') check (pin ~ '^[0-9]{4,6}$'),
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.tournament_pins enable row level security;
-- Only the club's staff see the PIN (players in the club don't). Changes go through set_event_pin.
create policy "staff see event pin" on public.tournament_pins for select to authenticated using (public.is_staff(club_id));

-- Existing tournaments: keep the PIN of their first working scorer link, so links already handed out keep working.
insert into public.tournament_pins (tournament_id, club_id, pin)
select t.id, t.club_id, coalesce(
  (select l.pin from public.scorer_links l where l.tournament_id = t.id and not l.revoked order by l.court nulls last, l.created_at limit 1),
  lpad((floor(random() * 10000))::int::text, 4, '0'))
from public.tournaments t
on conflict (tournament_id) do nothing;
update public.scorer_links l set pin = p.pin from public.tournament_pins p where p.tournament_id = l.tournament_id and l.pin <> p.pin;

-- The event PIN of a tournament, made on first use.
create function public.event_pin_of(tid uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare p text;
begin
  insert into public.tournament_pins (tournament_id, club_id) select id, club_id from public.tournaments where id = tid
    on conflict (tournament_id) do nothing;
  select pin into p from public.tournament_pins where tournament_id = tid;
  return p;
end $$;

-- Sets the event PIN and puts it on every scorer link of the tournament (clearing lockouts).
create function public.apply_event_pin(tid uuid, new_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.event_pin_of(tid);
  update public.tournament_pins set pin = new_pin, failed_attempts = 0, locked_until = null, updated_at = now() where tournament_id = tid;
  update public.scorer_links set pin = new_pin, failed_attempts = 0, locked_until = null where tournament_id = tid and pin <> new_pin;
end $$;

create function public.tournaments_make_pin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tournament_pins (tournament_id, club_id) values (new.id, new.club_id) on conflict (tournament_id) do nothing;
  return new;
end $$;
create trigger tournaments_make_pin after insert on public.tournaments for each row execute function public.tournaments_make_pin();

-- A new scorer link always gets the event PIN. Changing one link's PIN (the old "New PIN" button) changes the event PIN.
create function public.scorer_links_event_pin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p text;
begin
  p := public.event_pin_of(new.tournament_id);
  if tg_op = 'INSERT' then
    new.pin := p;
  elsif new.pin is distinct from old.pin and new.pin is distinct from p then
    perform public.apply_event_pin(new.tournament_id, new.pin);
  end if;
  return new;
end $$;
create trigger scorer_links_event_pin before insert or update of pin on public.scorer_links
  for each row execute function public.scorer_links_event_pin();

create function public.weak_pin(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p !~ '^[0-9]{4,6}$'
    or p ~ '^(.)\1+$'
    or position(p in '0123456789') > 0
    or position(p in '9876543210') > 0
$$;

-- For the organiser: a new event PIN (4 to 6 digits), or a random one when p_pin is null.
create function public.set_event_pin(p_tournament uuid, p_pin text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  p text := p_pin;
begin
  select club_id into cid from public.tournaments where id = p_tournament;
  if cid is null or not public.is_staff(cid) then raise exception 'Only the club''s coaches and admins can change the PIN'; end if;
  if p is null then
    loop
      p := lpad((floor(random() * 10000))::int::text, 4, '0');
      exit when not public.weak_pin(p);
    end loop;
  elsif p !~ '^[0-9]{4,6}$' then raise exception 'A PIN is 4 to 6 digits';
  end if;
  perform public.apply_event_pin(p_tournament, p);
  return p;
end $$;

-- Desk helpers who signed in with an event PIN.
create table public.club_helpers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create index club_helpers_tournament_idx on public.club_helpers (tournament_id);
alter table public.club_helpers enable row level security;
create policy "staff see helpers" on public.club_helpers for select to authenticated using (public.is_staff(club_id));

-- Service only (edge function pin-sign-in): checks a helper link's PIN. Five wrong tries lock it for a while.
create function public.helper_pin_check(p_slug text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
  p public.tournament_pins;
begin
  select * into t from public.tournaments where public_slug = p_slug;
  if t.id is null then return jsonb_build_object('error', 'This helper link isn''t valid. Ask the organiser for the link again.'); end if;
  if t.status = 'done' then return jsonb_build_object('error', 'This tournament is finished. Ask the organiser to reopen it.'); end if;
  perform public.event_pin_of(t.id);
  select * into p from public.tournament_pins where tournament_id = t.id for update;
  if p.locked_until is not null and p.locked_until > now() then
    return jsonb_build_object('error', 'Too many wrong PINs. Wait a few minutes, then try again.');
  end if;
  if p.pin <> coalesce(p_pin, '') then
    update public.tournament_pins set failed_attempts = failed_attempts + 1,
      locked_until = case when (failed_attempts + 1) % 5 = 0 then now() + least(interval '30 minutes', interval '1 minute' * power(2, (failed_attempts + 1) / 5)) else locked_until end
      where tournament_id = t.id;
    return jsonb_build_object('error', 'Wrong PIN');
  end if;
  update public.tournament_pins set failed_attempts = 0, locked_until = null where tournament_id = t.id;
  return jsonb_build_object('tournament_id', t.id, 'club_id', t.club_id, 'name', t.name);
end $$;

-- Service only: makes a new helper user one of the club's coaches.
create function public.helper_join(p_tournament uuid, p_user uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select club_id into cid from public.tournaments where id = p_tournament;
  if cid is null then raise exception 'No such tournament'; end if;
  insert into public.profiles (id, display_name) values (p_user, left(trim(p_name), 40) || ' (helper)')
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.club_members (club_id, user_id, role) values (cid, p_user, 'coach') on conflict (club_id, user_id) do nothing;
  insert into public.club_helpers (user_id, club_id, tournament_id, name) values (p_user, cid, p_tournament, left(trim(p_name), 40))
    on conflict (user_id) do nothing;
end $$;

-- Helpers stop being coaches when their tournament is marked finished, and come back if it's reopened.
create function public.tournaments_helper_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    update public.club_members m set role = 'player' from public.club_helpers h
      where h.tournament_id = new.id and m.user_id = h.user_id and m.club_id = h.club_id and m.role = 'coach';
  elsif old.status = 'done' and new.status <> 'done' then
    update public.club_members m set role = 'coach' from public.club_helpers h
      where h.tournament_id = new.id and m.user_id = h.user_id and m.club_id = h.club_id and m.role = 'player';
  end if;
  return new;
end $$;
create trigger tournaments_helper_roles after update of status on public.tournaments
  for each row execute function public.tournaments_helper_roles();

-- ---------- 2. Personal sign-in PIN ----------

create table public.sign_in_pins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
-- Nobody reads this table directly; only the functions below.
alter table public.sign_in_pins enable row level security;

create function public.set_my_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in first'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then raise exception 'A PIN is 4 to 6 digits'; end if;
  if public.weak_pin(p_pin) then raise exception 'That PIN is too easy to guess. Avoid repeats like 1111 and runs like 1234.'; end if;
  insert into public.sign_in_pins (user_id, pin_hash) values (me, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
    on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  return true;
end $$;

create function public.has_my_pin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sign_in_pins where user_id = (select auth.uid()))
$$;

-- Service only: checks email + PIN. Five wrong tries lock the account's PIN for a while (doubling, up to 30 minutes).
create function public.pin_login_check(p_email text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u record;
  s public.sign_in_pins;
  wrong constant jsonb := jsonb_build_object('error', 'That email and PIN don''t match. No PIN yet? Sign in once with the email link, then set one in My club.');
begin
  select id, email into u from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if u.id is null then return wrong; end if;
  select * into s from public.sign_in_pins where user_id = u.id for update;
  if s.user_id is null then return wrong; end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('error', 'Too many wrong PINs. Wait a few minutes, then try again.');
  end if;
  if s.pin_hash <> extensions.crypt(coalesce(p_pin, ''), s.pin_hash) then
    update public.sign_in_pins set failed_attempts = failed_attempts + 1,
      locked_until = case when (failed_attempts + 1) % 5 = 0 then now() + least(interval '30 minutes', interval '1 minute' * power(2, (failed_attempts + 1) / 5)) else locked_until end
      where user_id = u.id;
    return wrong;
  end if;
  update public.sign_in_pins set failed_attempts = 0, locked_until = null where user_id = u.id;
  return jsonb_build_object('email', u.email);
end $$;

-- ---------- 3. Club logo ----------

alter table public.clubs
  add column logo_url text check (logo_url is null or (logo_url ~ '^https://[^\s<>"]+$' and char_length(logo_url) <= 400));

-- Logos live in the posters bucket as <club id>/logo.jpg, uploaded only by the club's staff.
create function public.can_post_logo(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clubs c
    where (storage.foldername(object_name))[1] = c.id::text
      and storage.filename(object_name) ~ '^logo\.(jpg|png|webp)$'
      and public.is_staff(c.id))
$$;
create policy "club staff upload logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'posters' and public.can_post_logo(name));
create policy "club staff replace logos" on storage.objects for update to authenticated
  using (bucket_id = 'posters' and public.can_post_logo(name))
  with check (bucket_id = 'posters' and public.can_post_logo(name));

-- Staff (coaches too, not only admins) set the logo address.
create function public.set_club_logo(p_club uuid, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff(p_club) then raise exception 'Only the club''s coaches and admins can change the logo'; end if;
  if p_url is not null and (p_url !~ '^https://[^\s<>"]+$' or char_length(p_url) > 400) then raise exception 'That logo address isn''t valid'; end if;
  update public.clubs set logo_url = p_url where id = p_club;
end $$;

-- Public: the club name and logo for a tournament's public link or event page (no login).
create function public.public_club_logo(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('club', c.name, 'logo_url', c.logo_url)
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.public_slug = p_slug and (t.is_public or t.listing <> 'none' or t.entry_mode = 'registration')
$$;

-- ---------- Robot: a fresh event PIN every run ----------

create or replace function public.robot_reset() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  p text;
begin
  loop
    p := lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not public.weak_pin(p);
  end loop;
  perform public.apply_event_pin('e2e00000-0000-4000-8000-000000000201', p);
  r := public.robot_reset_courts();
  perform public.robot_reset_events();
  return r || jsonb_build_object('event', 'pqe2ereg01');
end $$;

-- ---------- Permissions ----------

revoke execute on function public.event_pin_of(uuid), public.apply_event_pin(uuid, text), public.tournaments_make_pin(),
  public.scorer_links_event_pin(), public.helper_pin_check(text, text), public.helper_join(uuid, uuid, text),
  public.tournaments_helper_roles(), public.pin_login_check(text, text), public.can_post_logo(text), public.robot_reset()
  from public, anon, authenticated;
grant execute on function public.helper_pin_check(text, text), public.helper_join(uuid, uuid, text), public.pin_login_check(text, text),
  public.robot_reset() to service_role;
grant execute on function public.can_post_logo(text) to authenticated;
revoke execute on function public.weak_pin(text), public.set_event_pin(uuid, text), public.set_my_pin(text), public.has_my_pin(),
  public.set_club_logo(uuid, text), public.public_club_logo(text) from public, anon;
grant execute on function public.set_event_pin(uuid, text), public.set_my_pin(text), public.has_my_pin(), public.set_club_logo(uuid, text)
  to authenticated;
grant execute on function public.public_club_logo(text) to anon, authenticated;
