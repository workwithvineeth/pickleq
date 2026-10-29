-- Applied on the server as club_mode_7_events_board_registration.
-- Club Module 2: post a tournament before entries exist, a public events board (approved by platform admins),
-- player registration with eligibility checks, and the organiser's entries inbox.
-- Nothing here removes rows: registrations are withdrawn or rejected, never erased.

-- ---------- Platform admins (Vineeth and people he assigns; separate from club roles) ----------

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy "see yourself" on public.platform_admins for select to authenticated using (user_id = (select auth.uid()));

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

-- ---------- New columns ----------

-- verified: the club's first listing was approved, so later ones go straight onto the board.
-- is_test: the robot's sandbox; never shown on the public board.
alter table public.clubs
  add column verified boolean not null default false,
  add column is_test boolean not null default false;

alter table public.tournaments
  add column city text check (city is null or char_length(city) <= 60),
  add column venue text check (venue is null or char_length(venue) <= 120),
  add column about text check (about is null or char_length(about) <= 1000),
  add column contact text check (contact is null or char_length(contact) <= 120),
  add column link text check (link is null or (link ~ '^https://[^\s<>"]+$' and char_length(link) <= 300)),
  -- roster: players picked by the organiser (Module 1). registration: players sign up, then the organiser draws.
  add column entry_mode text not null default 'roster' check (entry_mode in ('roster', 'registration')),
  add column registration_open boolean not null default false,
  add column entries_close date,
  add column upi_id text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$'),
  -- none: not on the board. listed: on the board only (players contact the organiser). run: run on PICKLEQ.
  add column listing text not null default 'none' check (listing in ('none', 'listed', 'run')),
  add column listing_status text not null default 'none' check (listing_status in ('none', 'pending', 'approved', 'rejected')),
  add column reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  add column reviewed_at timestamptz,
  add column drawn_at timestamptz,
  add column created_by uuid references auth.users (id) on delete set null default auth.uid();

alter table public.divisions
  add column max_dupr numeric(4, 3) check (max_dupr is null or max_dupr between 1 and 8),
  add column gender text not null default 'open' check (gender in ('open', 'men', 'women', 'mixed')),
  add column min_age int check (min_age is null or min_age between 18 and 99),
  add column cap int check (cap is null or cap between 2 and 256),
  add column fee int check (fee is null or fee between 0 and 100000);

-- Divisions of a registration event start with no entries, which Module 1's rules never allowed for: nothing to change there.

-- ---------- Registrations ----------

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  division_id uuid not null references public.divisions (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  -- Who registered online. Empty for entries the organiser adds (offline).
  user_id uuid references auth.users (id) on delete set null,
  source text not null default 'online' check (source in ('online', 'offline')),
  -- [{ "name", "phone", "duprId", "dupr", "gender": "m"|"f"|"x", "age" }], one player for singles, two for doubles.
  players jsonb not null check (jsonb_typeof(players) = 'array' and jsonb_array_length(players) between 1 and 2 and pg_column_size(players) < 4000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'waitlist', 'rejected', 'withdrawn')),
  -- unpaid; venue: will pay at the venue; claimed: player says they paid (UPI reference); paid: organiser confirmed.
  payment text not null default 'unpaid' check (payment in ('unpaid', 'venue', 'claimed', 'paid')),
  payment_ref text check (payment_ref is null or char_length(payment_ref) <= 60),
  -- The organiser's note to the player (e.g. why an entry was rejected). The player sees it.
  note text check (note is null or char_length(note) <= 300),
  entry_id uuid references public.entries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index registrations_tournament_idx on public.registrations (tournament_id);
create index registrations_user_idx on public.registrations (user_id);
alter table public.registrations enable row level security;

create policy "own or staff see registrations" on public.registrations for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff(club_id));
create policy "staff add offline entries" on public.registrations for insert to authenticated
  with check (public.is_staff(club_id) and source = 'offline' and user_id is null);
create policy "staff manage registrations" on public.registrations for update to authenticated
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));

-- ---------- Guards: only server functions change approval and verification ----------

create function public.guard_listing() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Direct changes from the app (not from the server functions below) can't approve their own listing.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.listing_status := 'none'; new.reject_reason := null; new.reviewed_at := null; new.created_by := (select auth.uid());
    elsif new.listing_status is distinct from old.listing_status or new.reject_reason is distinct from old.reject_reason
      or new.reviewed_at is distinct from old.reviewed_at or new.created_by is distinct from old.created_by then
      raise exception 'Listings are approved by PICKLEQ, not changed directly';
    end if;
  end if;
  return new;
end $$;
create trigger tournaments_guard_listing before insert or update on public.tournaments for each row execute function public.guard_listing();

create function public.guard_club_flags() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (new.verified is distinct from old.verified or new.is_test is distinct from old.is_test) then
    raise exception 'Only PICKLEQ can verify a club';
  end if;
  return new;
end $$;
create trigger clubs_guard_flags before update on public.clubs for each row execute function public.guard_club_flags();

-- Registrations: nobody rewrites who registered or move it to another event's club.
create function public.guard_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d public.divisions;
  problem text;
begin
  -- Every entry follows the event's rules (adults only, rating cap, gender, age), however it was added.
  if tg_op = 'INSERT' or new.players is distinct from old.players or new.division_id is distinct from old.division_id then
    select * into d from public.divisions where id = new.division_id;
    problem := public.entry_problem(d, new.players, new.source = 'online');
    if problem is not null then raise exception '%', problem; end if;
  end if;
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id
    or new.tournament_id is distinct from old.tournament_id or new.club_id is distinct from old.club_id or new.source is distinct from old.source
    or new.created_at is distinct from old.created_at) then
    raise exception 'That part of a registration can''t be changed';
  end if;
  if tg_op = 'UPDATE' and new.division_id is distinct from old.division_id
    and not exists (select 1 from public.divisions d where d.id = new.division_id and d.tournament_id = new.tournament_id) then
    raise exception 'That event isn''t part of this tournament';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger registrations_guard before insert or update on public.registrations for each row execute function public.guard_registration();

-- ---------- Eligibility (the app checks the same rules first, for quick messages) ----------

-- Returns null if the players may enter this event, or a message saying why not.
-- need_phone: online registrations need a phone number; the organiser's offline entries may leave it empty.
create function public.entry_problem(d public.divisions, players jsonb, need_phone boolean) returns text
language plpgsql stable set search_path = '' as $$
declare
  need int := case when d.kind = 'doubles' then 2 else 1 end;
  p jsonb;
  genders text[] := '{}';
  min_age int := greatest(18, coalesce(d.min_age, 18));
  n int := 0;
begin
  if jsonb_typeof(players) is distinct from 'array' or jsonb_array_length(players) <> need then
    return case when need = 2 then 'A doubles entry needs two players' else 'A singles entry is one player' end;
  end if;
  for p in select * from jsonb_array_elements(players) loop
    n := n + 1;
    if char_length(trim(coalesce(p ->> 'name', ''))) not between 1 and 60 then return format('Player %s: enter their name', n); end if;
    if (need_phone or coalesce(p ->> 'phone', '') <> '') and coalesce(p ->> 'phone', '') !~ '^\+?[0-9][0-9 -]{7,15}$' then
      return format('%s: enter a phone number', p ->> 'name');
    end if;
    if coalesce(p ->> 'duprId', '') <> '' and (p ->> 'duprId') !~ '^[A-Za-z0-9-]{3,20}$' then return format('%s: a DUPR ID is 3 to 20 letters or numbers', p ->> 'name'); end if;
    if coalesce(p ->> 'dupr', '') <> '' and (jsonb_typeof(p -> 'dupr') <> 'number' or (p ->> 'dupr')::numeric not between 1 and 8) then
      return format('%s: DUPR rating is a number between 1 and 8', p ->> 'name');
    end if;
    if coalesce(p ->> 'gender', '') not in ('m', 'f', 'x') then return format('%s: choose a gender', p ->> 'name'); end if;
    if jsonb_typeof(p -> 'age') <> 'number' or (p ->> 'age')::numeric <> floor((p ->> 'age')::numeric) or (p ->> 'age')::int not between 1 and 120 then
      return format('%s: enter their age', p ->> 'name');
    end if;
    if (p ->> 'age')::int < 18 then return 'Players must be 18 or over. Junior events aren''t supported yet.'; end if;
    if (p ->> 'age')::int < min_age then return format('%s: this event is for players aged %s and over', p ->> 'name', min_age); end if;
    if d.max_dupr is not null then
      if coalesce(p ->> 'dupr', '') = '' then return format('%s: this event needs a DUPR rating (%s and under)', p ->> 'name', d.max_dupr); end if;
      if (p ->> 'dupr')::numeric > d.max_dupr then return format('%s: rating %s is above this event''s cap of %s', p ->> 'name', p ->> 'dupr', d.max_dupr); end if;
    end if;
    genders := genders || (p ->> 'gender');
  end loop;
  if d.gender = 'men' and genders <> array_fill('m'::text, array[need]) then return 'This event is for men'; end if;
  if d.gender = 'women' and genders <> array_fill('f'::text, array[need]) then return 'This event is for women'; end if;
  if d.gender = 'mixed' and not (need = 2 and 'm' = any (genders) and 'f' = any (genders)) then return 'A mixed doubles team is one man and one woman'; end if;
  if need = 2 and coalesce(players -> 0 ->> 'phone', '') <> '' and regexp_replace(players -> 0 ->> 'phone', '\D', '', 'g') = regexp_replace(players -> 1 ->> 'phone', '\D', '', 'g') then
    return 'The two players need different phone numbers';
  end if;
  return null;
end $$;

-- Phone numbers already entered in an event (active registrations), digits only.
create function public.entered_phones(div uuid, except_reg uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(regexp_replace(p ->> 'phone', '\D', '', 'g')), '{}')
  from public.registrations r, jsonb_array_elements(r.players) p
  where r.division_id = div and r.status in ('pending', 'accepted', 'waitlist') and r.id is distinct from except_reg and coalesce(p ->> 'phone', '') <> ''
$$;

-- ---------- Registering (signed-in player) ----------

create function public.register_entry(p_division uuid, p_players jsonb, p_payment text, p_payment_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  d public.divisions;
  t public.tournaments;
  problem text;
  taken int;
  st text;
  rid uuid;
  ph text;
begin
  if me is null then return jsonb_build_object('error', 'Sign in to register'); end if;
  select * into d from public.divisions where id = p_division;
  if d.id is null then return jsonb_build_object('error', 'That event doesn''t exist'); end if;
  select * into t from public.tournaments where id = d.tournament_id;
  if t.entry_mode <> 'registration' or not t.registration_open or t.drawn_at is not null or t.listing = 'listed' then
    return jsonb_build_object('error', 'Entries for this tournament are closed');
  end if;
  if t.listing_status = 'rejected' then return jsonb_build_object('error', 'This tournament isn''t taking entries'); end if;
  if t.entries_close is not null and (now() at time zone 'Asia/Kolkata')::date > t.entries_close then
    return jsonb_build_object('error', 'Entries closed on ' || to_char(t.entries_close, 'DD Mon'));
  end if;
  problem := public.entry_problem(d, p_players, true);
  if problem is not null then return jsonb_build_object('error', problem); end if;
  if exists (select 1 from public.registrations where division_id = d.id and user_id = me and status in ('pending', 'accepted', 'waitlist')) then
    return jsonb_build_object('error', 'You already have an entry in this event. You can withdraw it and enter again.');
  end if;
  for ph in select regexp_replace(p ->> 'phone', '\D', '', 'g') from jsonb_array_elements(p_players) p loop
    if ph = any (public.entered_phones(d.id, null)) then return jsonb_build_object('error', 'Someone with that phone number is already entered in this event'); end if;
  end loop;
  if coalesce(p_payment, 'unpaid') not in ('unpaid', 'venue', 'claimed') then return jsonb_build_object('error', 'Choose how you''ll pay'); end if;
  if p_payment = 'claimed' and char_length(trim(coalesce(p_payment_ref, ''))) not between 4 and 60 then
    return jsonb_build_object('error', 'Add the UPI reference number from your payment');
  end if;
  select count(*) into taken from public.registrations where division_id = d.id and status in ('pending', 'accepted');
  st := case when d.cap is not null and taken >= d.cap then 'waitlist' else 'pending' end;
  insert into public.registrations (tournament_id, division_id, club_id, user_id, source, players, status, payment, payment_ref)
    values (t.id, d.id, d.club_id, me, 'online',
      (select jsonb_agg(jsonb_build_object('name', trim(p ->> 'name'), 'phone', trim(p ->> 'phone'), 'duprId', nullif(upper(trim(coalesce(p ->> 'duprId', ''))), ''),
        'dupr', p -> 'dupr', 'gender', p ->> 'gender', 'age', (p ->> 'age')::int)) from jsonb_array_elements(p_players) p),
      st, coalesce(p_payment, 'unpaid'), nullif(trim(coalesce(p_payment_ref, '')), ''))
    returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'status', st);
end $$;

-- The player's own entries, with the tournament's public details.
create function public.my_entries() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'status', r.status, 'payment', r.payment, 'payment_ref', r.payment_ref, 'note', r.note, 'players', r.players, 'created_at', r.created_at,
    'division', d.name, 'kind', d.kind, 'fee', d.fee, 'slug', t.public_slug, 'tournament', t.name, 'start_date', t.start_date, 'start_time', t.start_time,
    'city', t.city, 'venue', t.venue, 'club', c.name, 'upi_id', t.upi_id, 'drawn', t.drawn_at is not null, 'results', t.is_public)
    order by t.start_date, r.created_at), '[]'::jsonb)
  from public.registrations r join public.divisions d on d.id = r.division_id join public.tournaments t on t.id = r.tournament_id join public.clubs c on c.id = r.club_id
  where r.user_id = (select auth.uid())
$$;

create function public.withdraw_my_entry(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.registrations;
begin
  select * into r from public.registrations where id = p_id and user_id = (select auth.uid());
  if r.id is null then return jsonb_build_object('error', 'Entry not found'); end if;
  if r.entry_id is not null then return jsonb_build_object('error', 'The draw is made. Ask the organiser to withdraw you.'); end if;
  if r.status in ('withdrawn', 'rejected') then return jsonb_build_object('ok', true); end if;
  update public.registrations set status = 'withdrawn' where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Organiser adds or edits an entry: the same eligibility rules, but the organiser may override the cap and duplicates check
-- only by accepting from the waitlist. Returns {"ok"} or {"error"}.
create function public.check_entry(p_division uuid, p_players jsonb, p_except uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d public.divisions;
  problem text;
  ph text;
begin
  select * into d from public.divisions where id = p_division;
  if d.id is null or not public.is_staff(d.club_id) then return jsonb_build_object('error', 'Only the organiser can do this'); end if;
  problem := public.entry_problem(d, p_players, false);
  if problem is not null then return jsonb_build_object('error', problem); end if;
  for ph in select regexp_replace(p ->> 'phone', '\D', '', 'g') from jsonb_array_elements(p_players) p where coalesce(p ->> 'phone', '') <> '' loop
    if ph = any (public.entered_phones(d.id, p_except)) then return jsonb_build_object('error', 'Someone with that phone number is already entered in this event'); end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Posting to the board, and the approval queue ----------

-- The organiser (club admin) asks for the tournament to go on the board. A verified club's listing goes straight on.
create function public.submit_listing(p_tournament uuid, p_listing text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
  v boolean;
begin
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.is_admin(t.club_id) then return jsonb_build_object('error', 'Only club admins can post to the events board'); end if;
  if p_listing not in ('none', 'listed', 'run') then return jsonb_build_object('error', 'Unknown listing'); end if;
  if p_listing <> 'none' and (coalesce(t.city, '') = '' or coalesce(t.venue, '') = '') then
    return jsonb_build_object('error', 'Add the city and venue first');
  end if;
  if p_listing = 'listed' and coalesce(t.contact, '') = '' and coalesce(t.link, '') = '' then
    return jsonb_build_object('error', 'Add a contact number or a link so players can enter');
  end if;
  select verified into v from public.clubs where id = t.club_id;
  update public.tournaments set listing = p_listing,
    listing_status = case when p_listing = 'none' then 'none' when v then 'approved' else 'pending' end,
    reject_reason = null, reviewed_at = case when p_listing <> 'none' and v then now() else null end
    where id = t.id;
  return jsonb_build_object('ok', true, 'status', case when p_listing = 'none' then 'none' when v then 'approved' else 'pending' end);
end $$;

create function public.listing_queue() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_platform_admin() then null else coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'city', t.city, 'venue', t.venue, 'about', t.about,
    'contact', t.contact, 'link', t.link, 'listing', t.listing, 'listing_status', t.listing_status, 'reject_reason', t.reject_reason,
    'reviewed_at', t.reviewed_at, 'slug', t.public_slug, 'club', c.name, 'club_city', c.city, 'verified', c.verified,
    'posted_by', (select u.email from auth.users u where u.id = t.created_by),
    'divisions', (select coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'kind', d.kind, 'max_dupr', d.max_dupr, 'gender', d.gender, 'min_age', d.min_age, 'fee', d.fee) order by d.sort), '[]'::jsonb) from public.divisions d where d.tournament_id = t.id))
    order by (t.listing_status = 'pending') desc, t.start_date), '[]'::jsonb) end
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.listing <> 'none' and not c.is_test and (t.listing_status = 'pending' or t.reviewed_at > now() - interval '30 days')
$$;

create function public.review_listing(p_tournament uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PICKLEQ admins can review listings'); end if;
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or t.listing = 'none' then return jsonb_build_object('error', 'Listing not found'); end if;
  if not p_approve and char_length(trim(coalesce(p_reason, ''))) < 3 then return jsonb_build_object('error', 'Give the organiser a reason'); end if;
  update public.tournaments set listing_status = case when p_approve then 'approved' else 'rejected' end,
    reject_reason = case when p_approve then null else trim(p_reason) end, reviewed_at = now() where id = t.id;
  if p_approve then update public.clubs set verified = true where id = t.club_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create function public.add_platform_admin(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PICKLEQ admins can add admins'); end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then return jsonb_build_object('error', 'No PICKLEQ account uses that email yet. Ask them to sign in once first.'); end if;
  insert into public.platform_admins (user_id, added_by) values (uid, (select auth.uid())) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create function public.platform_admin_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_platform_admin() then null else
    (select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'added_at', a.added_at) order by a.added_at), '[]'::jsonb)
     from public.platform_admins a join auth.users u on u.id = a.user_id) end
$$;

-- ---------- The public board and event pages (no login) ----------

create function public.event_json(t public.tournaments, detail boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', t.public_slug, 'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'city', t.city, 'venue', t.venue,
    'club', c.name, 'listing', t.listing, 'status', t.status, 'entry_mode', t.entry_mode,
    'registration_open', t.registration_open and t.drawn_at is null and t.listing <> 'listed'
      and (t.entries_close is null or (now() at time zone 'Asia/Kolkata')::date <= t.entries_close),
    'entries_close', t.entries_close, 'results', t.is_public, 'drawn', t.drawn_at is not null,
    'contact', case when t.listing = 'listed' then t.contact end, 'link', case when t.listing = 'listed' then t.link end,
    'about', case when detail then t.about end, 'upi_id', case when detail then t.upi_id end,
    'divisions', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'max_dupr', d.max_dupr, 'gender', d.gender,
        'min_age', d.min_age, 'fee', d.fee, 'cap', d.cap,
        'taken', (select count(*) from public.registrations r where r.division_id = d.id and r.status in ('pending', 'accepted')))
      order by d.sort), '[]'::jsonb) from public.divisions d where d.tournament_id = t.id))
  from public.clubs c where c.id = t.club_id
$$;

-- Upcoming approved tournaments. The robot's test club only appears when asked for (include_test).
create function public.public_events(p_include_test boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(t, false) order by t.start_date, t.start_time, t.name), '[]'::jsonb)
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.listing <> 'none' and t.listing_status = 'approved' and t.start_date >= (now() at time zone 'Asia/Kolkata')::date - 1
    and t.status <> 'done' and (not c.is_test or p_include_test)
$$;

-- One tournament's page: approved listings, or any tournament taking registrations (its organiser shares the link).
create function public.public_event(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.event_json(t, true) from public.tournaments t
  where t.public_slug = p_slug and t.listing_status <> 'rejected'
    and ((t.listing <> 'none' and t.listing_status = 'approved') or t.entry_mode = 'registration')
$$;

-- ---------- The robot's sandbox gets a registration event too ----------

alter function public.robot_reset() rename to robot_reset_courts;

update public.clubs set is_test = true where id = 'e2e00000-0000-4000-8000-000000000001';

create or replace function public.robot_reset_events() returns void
language plpgsql security definer set search_path = '' as $$
declare
  club constant uuid := 'e2e00000-0000-4000-8000-000000000001';
  tid constant uuid := 'e2e00000-0000-4000-8000-000000000211';
  fmt constant jsonb := '{"pool": {"pointsTo": 11, "bestOf": 1, "scoring": "sideout", "golden": true}, "ko": {"pointsTo": 11, "bestOf": 1, "scoring": "sideout", "golden": true}}';
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  insert into public.tournaments (id, club_id, name, start_date, start_time, courts, slot_minutes, status, is_public, public_slug, city, venue, about,
      entry_mode, registration_open, entries_close, upi_id, listing, listing_status, reviewed_at)
    values (tid, club, 'E2E Test Open', today + 7, '07:30', 4, 20, 'draft', false, 'pqe2ereg01', 'Robotville', 'Test Courts, Court Road',
      'A test event for the PICKLEQ robot.', 'registration', true, today + 5, 'robot@upi', 'run', 'approved', now())
    on conflict (id) do update set start_date = excluded.start_date, entries_close = excluded.entries_close, registration_open = true, drawn_at = null,
      listing = 'run', listing_status = 'approved', status = 'draft', entry_mode = 'registration';
  insert into public.divisions (id, tournament_id, club_id, name, kind, format, pools, advance, sort, max_dupr, gender, min_age, cap, fee) values
    ('e2e00000-0000-4000-8000-000000000311', tid, club, 'Men''s Doubles 3.5', 'doubles', fmt, 1, 0, 0, 3.5, 'men', null, 16, 800),
    ('e2e00000-0000-4000-8000-000000000312', tid, club, 'Open Singles 35+', 'singles', fmt, 1, 0, 1, null, 'open', 35, null, 500)
    on conflict (id) do update set max_dupr = excluded.max_dupr, gender = excluded.gender, min_age = excluded.min_age, cap = excluded.cap, fee = excluded.fee;
  update public.registrations set status = 'withdrawn' where club_id = club and status <> 'withdrawn';
end $$;

create or replace function public.robot_reset() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := public.robot_reset_courts();
  perform public.robot_reset_events();
  return r || jsonb_build_object('event', 'pqe2ereg01');
end $$;

-- ---------- Permissions ----------

revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_club(text, text, text), public.join_club(text, text, text),
  public.set_member_role(uuid, uuid, text), public.share_my_summary(uuid, jsonb),
  public.club_role(uuid), public.is_member(uuid), public.is_staff(uuid), public.is_admin(uuid),
  public.shares_club(uuid), public.public_tournament(text), public.claim_pending(), public.leave_club(uuid), public.set_my_sharing(uuid, jsonb),
  public.is_platform_admin(), public.register_entry(uuid, jsonb, text, text), public.my_entries(), public.withdraw_my_entry(uuid),
  public.check_entry(uuid, jsonb, uuid), public.submit_listing(uuid, text), public.listing_queue(), public.review_listing(uuid, boolean, text),
  public.add_platform_admin(text), public.platform_admin_list() to authenticated;
grant execute on function public.public_tournament(text), public.public_events(boolean), public.public_event(text) to anon, authenticated;
grant execute on function public.scorer_open(text, text), public.scorer_save(text, text, uuid, jsonb, text, text, date) to anon, authenticated;
revoke execute on function public.scorer_check(text, text) from authenticated;
revoke execute on function public.robot_reset() from public, anon, authenticated;
grant execute on function public.robot_reset() to service_role;
-- Supabase also grants new functions to signed-in users directly; the helpers below are for the server only
-- (entered_phones would otherwise reveal other players' phone numbers).
revoke execute on function public.entered_phones(uuid, uuid), public.event_json(public.tournaments, boolean),
  public.entry_problem(public.divisions, jsonb, boolean), public.robot_reset_courts(), public.robot_reset_events(),
  public.guard_listing(), public.guard_club_flags(), public.guard_registration() from authenticated;
