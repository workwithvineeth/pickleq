-- Phase 3 Module 4: close two roster loopholes, store player emails, and email claim links.
-- 1. Club members could read every player's claim_code (and, with the club invite code, link themselves to someone
--    else's roster entry through join_club). Now only the server functions can read it.
-- 2. Organisers could set club_players.user_id directly (link any account to a player). Now only the claim and join
--    functions change user_id / claimed_at; organisers can only undo a Player Studio claim, which is logged.
-- 3. Optional email per player (online entry, offline entry, import), visible only to the club's staff and the player.
-- 4. Claim-link emails: the send-claim-email Edge Function asks claim_email_batch for the targets (staff only,
--    rate-limited, logged), sends through Brevo, and reports back with claim_email_result.

-- ---------- 1. Roster: column grants (claim_code is never readable through the API) ----------
revoke all on public.club_players from anon;
revoke select, insert, update on public.club_players from authenticated;
grant select (id, club_id, name, dupr_singles, dupr_doubles, dupr_id, user_id, share, sample, created_at, claimed_at) on public.club_players to authenticated;
grant insert (id, club_id, name, dupr_singles, dupr_doubles, dupr_id) on public.club_players to authenticated;
grant update (name, dupr_singles, dupr_doubles, dupr_id) on public.club_players to authenticated;

-- ---------- 2. Roster: only the server functions link accounts ----------
create function public.guard_player_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and (new.user_id is not null or new.claimed_at is not null or new.sample) then
      raise exception 'Players are linked to accounts by claiming, not directly';
    end if;
    if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.claimed_at is distinct from old.claimed_at
      or new.claim_code is distinct from old.claim_code or new.sample is distinct from old.sample or new.club_id is distinct from old.club_id) then
      raise exception 'Players are linked to accounts by claiming, not directly';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_player_link() from public, anon, authenticated;
create trigger club_players_guard_link before insert or update on public.club_players for each row execute function public.guard_player_link();

-- The organiser undoes a Player Studio claim (e.g. the wrong person claimed). Logged; the player can be sent a new link.
create function public.staff_unlink_player(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.club_players;
begin
  select * into p from public.club_players where id = p_player;
  if p.id is null or not public.is_staff(p.club_id) then raise exception 'Only the club’s organisers can do that'; end if;
  if p.claimed_at is null then raise exception 'This player wasn’t claimed in Player Studio'; end if;
  update public.club_players set user_id = null, claimed_at = null where id = p.id;
  insert into public.platform_audit (action, club_id, detail) values ('player_unlinked', p.club_id, format('%s: claim undone by the organiser', p.name));
end $$;

-- ---------- 3. Player emails ----------
-- An email as stored: trimmed, lower case; null when blank. Raises on anything that doesn't look like an address.
create function public.clean_email(x text) returns text
language plpgsql immutable set search_path = '' as $$
declare e text := lower(btrim(coalesce(x, '')));
begin
  if e = '' then return null; end if;
  if char_length(e) > 254 or e !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' then
    raise exception '% isn’t an email address', x using errcode = 'check_violation';
  end if;
  return e;
end $$;

-- Whether a roster entry is linked to you (claimed players aren't club members, so they can't read the roster itself).
create function public.is_my_player(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_players where id = pid and user_id = (select auth.uid()))
$$;
revoke execute on function public.is_my_player(uuid) from public, anon;
grant execute on function public.is_my_player(uuid) to authenticated;

create table public.club_player_emails (
  player_id uuid primary key references public.club_players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  email text not null check (email = public.clean_email(email)),
  updated_at timestamptz not null default now()
);
create function public.clean_player_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := public.clean_email(new.email);
  if new.email is null then raise exception 'Enter an email address' using errcode = 'check_violation'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.clean_player_email() from public, anon, authenticated;
create trigger club_player_emails_clean before insert or update on public.club_player_emails for each row execute function public.clean_player_email();
create index club_player_emails_club_idx on public.club_player_emails (club_id);
create index club_player_emails_email_idx on public.club_player_emails (email);
alter table public.club_player_emails enable row level security;
revoke all on public.club_player_emails from public, anon, authenticated;
grant select, insert, update, delete on public.club_player_emails to authenticated;
create policy "staff and the player see the email" on public.club_player_emails for select to authenticated
  using (public.is_staff(club_id) or public.is_my_player(player_id));
create policy "staff add emails" on public.club_player_emails for insert to authenticated
  with check (public.is_staff(club_id) and exists (select 1 from public.club_players p where p.id = player_id and p.club_id = club_player_emails.club_id));
create policy "staff change emails" on public.club_player_emails for update to authenticated
  using (public.is_staff(club_id)) with check (public.is_staff(club_id) and exists (select 1 from public.club_players p where p.id = player_id and p.club_id = club_player_emails.club_id));
create policy "staff remove emails" on public.club_player_emails for delete to authenticated using (public.is_staff(club_id));

-- Registrations: each player may carry an "email"; it's cleaned (or refused) before saving.
create function public.guard_registration_emails() returns trigger
language plpgsql set search_path = '' as $$
declare
  p jsonb;
  out jsonb := '[]'::jsonb;
  e text;
begin
  if jsonb_typeof(new.players) <> 'array' then return new; end if;
  for p in select * from jsonb_array_elements(new.players) loop
    if jsonb_typeof(p) = 'object' and p ? 'email' then
      e := public.clean_email(p ->> 'email');
      p := case when e is null then p - 'email' else jsonb_set(p, '{email}', to_jsonb(e)) end;
    end if;
    out := out || jsonb_build_array(p);
  end loop;
  new.players := out;
  return new;
end $$;
revoke execute on function public.guard_registration_emails() from public, anon, authenticated;
-- Runs before registrations_guard (triggers fire in name order), so the main checks see the cleaned list.
create trigger registrations_clean_emails before insert or update on public.registrations for each row execute function public.guard_registration_emails();

-- Import keeps the email column (copied from 0008 with 'email' added).
create or replace function public.import_entries(p_tournament uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
  d public.divisions;
  r jsonb;
  i int := 0;
  added int := 0;
  waitlisted int := 0;
  skipped int := 0;
  problems jsonb := '[]'::jsonb;
  st text;
  pay text;
  players jsonb;
  taken int;
begin
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.is_staff(t.club_id) then return jsonb_build_object('error', 'Only the organiser can import entries'); end if;
  if t.entry_mode <> 'registration' then return jsonb_build_object('error', 'Importing is for tournaments where players register'); end if;
  if t.drawn_at is not null then return jsonb_build_object('error', 'The draw is made. Add new players as late entries.'); end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 400 then return jsonb_build_object('error', 'Import up to 400 rows at a time'); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    select * into d from public.divisions where id = (r ->> 'division')::uuid and tournament_id = t.id;
    if d.id is null then problems := problems || jsonb_build_object('row', i, 'error', 'That event isn''t part of this tournament'); continue; end if;
    if jsonb_typeof(r -> 'players') is distinct from 'array' then problems := problems || jsonb_build_object('row', i, 'error', 'No players'); continue; end if;
    if exists (select 1 from public.registrations x, jsonb_array_elements(x.players) xp, jsonb_array_elements(r -> 'players') np
               where x.division_id = d.id and public.person_key(xp) = public.person_key(np)) then
      skipped := skipped + 1; continue;
    end if;
    players := (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name', trim(p ->> 'name'), 'phone', trim(coalesce(p ->> 'phone', '')),
        'duprId', nullif(upper(trim(coalesce(p ->> 'duprId', ''))), ''), 'dupr', p -> 'dupr', 'gender', p ->> 'gender',
        'age', case when jsonb_typeof(p -> 'age') = 'number' then p -> 'age' end,
        'adult', case when coalesce(p ->> 'adult', '') = 'true' then true end,
        'email', nullif(trim(coalesce(p ->> 'email', '')), ''))))
      from jsonb_array_elements(r -> 'players') p);
    st := case when r ->> 'status' = 'pending' then 'pending' else 'accepted' end;
    pay := case when r ->> 'payment' in ('venue', 'paid') then r ->> 'payment' else 'unpaid' end;
    select count(*) into taken from public.registrations where division_id = d.id and status in ('pending', 'accepted');
    if d.cap is not null and taken >= d.cap then st := 'waitlist'; end if;
    begin
      insert into public.registrations (tournament_id, division_id, club_id, source, players, status, payment)
        values (t.id, d.id, d.club_id, 'offline', players, st, pay);
      added := added + 1;
      if st = 'waitlist' then waitlisted := waitlisted + 1; end if;
    exception when others then
      problems := problems || jsonb_build_object('row', i, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('ok', true, 'added', added, 'waitlisted', waitlisted, 'skipped', skipped, 'problems', problems);
end $$;
revoke execute on function public.import_entries(uuid, jsonb) from public, anon;
grant execute on function public.import_entries(uuid, jsonb) to authenticated;

-- Online entry keeps each player's email (copied from 0004 with 'email' added).
create or replace function public.register_entry(p_division uuid, p_players jsonb, p_payment text, p_payment_ref text) returns jsonb
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
        'dupr', p -> 'dupr', 'gender', p ->> 'gender', 'age', (p ->> 'age')::int, 'email', nullif(trim(coalesce(p ->> 'email', '')), ''))) from jsonb_array_elements(p_players) p),
      st, coalesce(p_payment, 'unpaid'), nullif(trim(coalesce(p_payment_ref, '')), ''))
    returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid, 'status', st);
end $$;

-- Player Studio also finds players whose stored email is your (verified) sign-in email.
create function public.studio_may_claim(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.registrations r join public.entries e on e.id = r.entry_id
                 where r.user_id = (select auth.uid()) and r.source = 'online' and e.player_ids[1] = p_player)
      or exists (select 1 from public.club_player_emails x
                 where x.player_id = p_player and x.email = lower(coalesce((select auth.jwt()) ->> 'email', '')) and x.email <> '')
$$;
revoke execute on function public.studio_may_claim(uuid) from public, anon, authenticated;

create or replace function public.studio_found_players() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('player_id', x.id, 'name', x.name, 'club', x.club) || public.studio_match_summary(x.id)), '[]'::jsonb)
  from (
    select distinct p.id, p.name, c.name as club
    from public.club_players p join public.clubs c on c.id = p.club_id
    where p.user_id is null and not p.sample and public.studio_may_claim(p.id)
      and (p.id in (select e.player_ids[1] from public.registrations r join public.entries e on e.id = r.entry_id
                    where r.user_id = (select auth.uid()) and r.source = 'online')
        or p.id in (select x.player_id from public.club_player_emails x where x.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))))
  ) x
$$;

create or replace function public.studio_claim(p_token text, p_player uuid, p_use_in_stats boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  l public.player_claim_links;
  p public.club_players;
  other text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if nullif(btrim(coalesce(p_token, '')), '') is not null then
    select * into l from public.player_claim_links where token = btrim(p_token) for update;
    if l.token is null or l.used_at is not null or l.expires_at <= now() then raise exception 'This claim link isn’t valid any more. Ask the organiser for a new one.'; end if;
    select * into p from public.club_players where id = l.player_id for update;
  else
    if not public.studio_may_claim(p_player) then raise exception 'You can only claim yourself from your own registrations. Ask the organiser for a claim link.'; end if;
    select * into p from public.club_players where id = p_player for update;
  end if;
  if p.id is null then raise exception 'You can only claim yourself from your own registrations. Ask the organiser for a claim link.'; end if;
  if p.user_id = me then return jsonb_build_object('ok', true, 'player_id', p.id); end if;
  if p.user_id is not null or p.sample then raise exception 'Someone has already claimed this player. If that wasn’t you, tell the organiser.'; end if;
  select name into other from public.club_players where club_id = p.club_id and user_id = me;
  if other is not null then
    raise exception 'Your account is already linked to “%” at this club. Ask the organiser to merge the two players.', other;
  end if;
  update public.club_players set user_id = me, claimed_at = now() where id = p.id;
  update public.player_claim_links set used_at = now(), used_by = me where player_id = p.id and used_at is null;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  insert into public.player_studio_settings (user_id, use_official) values (me, coalesce(p_use_in_stats, true))
    on conflict (user_id) do update set use_official = excluded.use_official, updated_at = now();
  return jsonb_build_object('ok', true, 'player_id', p.id);
end $$;

-- ---------- 4. Claim-link emails ----------
create table public.claim_email_log (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete set null,
  player_id uuid references public.club_players (id) on delete set null,
  sent_by uuid references auth.users (id) on delete set null,
  -- Masked (a•••@gmail.com): enough to show the organiser, without keeping a second copy of the address.
  sent_to text not null check (char_length(sent_to) <= 254),
  -- test: sent to the PaddleQ test address instead of the player.
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'test')),
  detail text not null default '' check (char_length(detail) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index claim_email_log_club_idx on public.claim_email_log (club_id, created_at desc);
create index claim_email_log_tournament_idx on public.claim_email_log (tournament_id);
create index claim_email_log_player_idx on public.claim_email_log (player_id);
create index claim_email_log_sent_by_idx on public.claim_email_log (sent_by);
create index claim_email_log_created_idx on public.claim_email_log (created_at desc);
alter table public.claim_email_log enable row level security;
revoke all on public.claim_email_log from public, anon, authenticated;
grant select on public.claim_email_log to authenticated;
create policy "staff see their club's claim emails" on public.claim_email_log for select to authenticated using (public.is_staff(club_id));

create function public.mask_email(e text) returns text
language sql immutable set search_path = '' as $$
  select case when position('@' in e) > 1 then left(e, 1) || '•••' || substr(e, position('@' in e)) else '•••' end
$$;

-- Limits: Brevo's free plan sends 300 a day; PaddleQ keeps 50 spare and gives each club up to 100 a day.
create function public.claim_email_batch(p_tournament uuid, p_players uuid[], p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
  club_name text;
  room int;
  rows jsonb := '[]'::jsonb;
  x record;
  tok text;
  log_id bigint;
  skipped int := 0;
  wanted int;
begin
  if p_mode not in ('test', 'live') then raise exception 'Email sending isn’t switched on'; end if;
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.is_staff(t.club_id) then raise exception 'Only the club’s organisers can email results'; end if;
  if not exists (select 1 from public.club_matches where tournament_id = t.id and status = 'done') then raise exception 'Email results once matches are finished'; end if;
  select name into club_name from public.clubs where id = t.club_id;
  room := least(
    100 - (select count(*) from public.claim_email_log where club_id = t.club_id and created_at > now() - interval '24 hours' and (status in ('sent', 'test') or (status = 'queued' and created_at > now() - interval '15 minutes'))),
    250 - (select count(*) from public.claim_email_log where created_at > now() - interval '24 hours' and (status in ('sent', 'test') or (status = 'queued' and created_at > now() - interval '15 minutes'))));
  select count(*) into wanted from (
    select distinct p.id from public.entries e join public.divisions d on d.id = e.division_id
      join public.club_players p on p.id = any(e.player_ids)
    where d.tournament_id = t.id and (p_players is null or p.id = any(p_players))) w;
  for x in
    select distinct p.id, p.name, m.email
    from public.entries e join public.divisions d on d.id = e.division_id
    join public.club_players p on p.id = any(e.player_ids)
    join public.club_player_emails m on m.player_id = p.id
    where d.tournament_id = t.id and (p_players is null or p.id = any(p_players))
      and p.user_id is null and not p.sample
      -- Already emailed for this tournament in the last 7 days (live sends; a "queued" row older than 15 minutes never
      -- went out): don't send again.
      and not exists (select 1 from public.claim_email_log g where g.player_id = p.id and g.tournament_id = t.id and g.created_at > now() - interval '7 days'
                      and (g.status = 'sent' or (g.status = 'queued' and g.created_at > now() - interval '15 minutes')))
    order by p.name
  loop
    exit when room <= 0;
    select token into tok from public.player_claim_links
      where player_id = x.id and used_at is null and expires_at > now() + interval '7 days' order by created_at desc limit 1;
    if tok is null then
      insert into public.player_claim_links (player_id, club_id, created_by) values (x.id, t.club_id, (select auth.uid())) returning token into tok;
    end if;
    insert into public.claim_email_log (club_id, tournament_id, player_id, sent_by, sent_to, status)
      values (t.club_id, t.id, x.id, (select auth.uid()), public.mask_email(x.email), case when p_mode = 'test' then 'test' else 'queued' end)
      returning id into log_id;
    rows := rows || jsonb_build_object('log_id', log_id, 'player_id', x.id, 'name', x.name, 'email', x.email, 'token', tok);
    room := room - 1;
  end loop;
  skipped := wanted - jsonb_array_length(rows);
  return jsonb_build_object('tournament', t.name, 'club', club_name, 'targets', rows, 'skipped', skipped, 'limited', room <= 0);
end $$;

-- The Edge Function (service role) records what Brevo said. Never callable from the app.
create function public.claim_email_result(p_log bigint, p_ok boolean, p_detail text) returns void
language sql security definer set search_path = '' as $$
  update public.claim_email_log set status = case when status = 'test' then 'test' when p_ok then 'sent' else 'failed' end,
    detail = left(coalesce(p_detail, ''), 300), updated_at = now() where id = p_log
$$;

-- ---------- Permissions ----------
revoke execute on function public.staff_unlink_player(uuid), public.claim_email_batch(uuid, uuid[], text), public.claim_email_result(bigint, boolean, text),
  public.mask_email(text), public.clean_email(text) from public, anon, authenticated;
grant execute on function public.staff_unlink_player(uuid), public.claim_email_batch(uuid, uuid[], text) to authenticated;
grant execute on function public.claim_email_result(bigint, boolean, text) to service_role;
-- clean_email is used by a table check, so the roles that write that table need it.
grant execute on function public.clean_email(text) to authenticated;
