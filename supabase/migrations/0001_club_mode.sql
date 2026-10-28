-- Applied on the server as club_mode_1_tables, _2_access_rules, _3_functions, _5_permissions.
-- The three functions that delete rows are in 0002 (Supabase asks for a separate confirmation for those).
-- PICKLEQ Club mode: clubs, members, roster, tournaments and club matches.
-- Personal PICKLEQ data never comes here. Only club data, and summaries a player chooses to share.
-- Every table has row-level security: the database itself decides who may read or change a row.

-- ---------- Tables ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  city text check (city is null or char_length(city) <= 60),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'coach', 'player')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

-- The roster. A player may or may not have an app account (user_id) yet.
create table public.club_players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  dupr_singles numeric(3, 2) check (dupr_singles is null or dupr_singles between 1 and 8),
  dupr_doubles numeric(3, 2) check (dupr_doubles is null or dupr_doubles between 1 and 8),
  -- The player's DUPR ID, needed to send results to DUPR.
  dupr_id text check (dupr_id is null or dupr_id ~ '^[A-Za-z0-9-]{3,20}$'),
  user_id uuid references auth.users (id) on delete set null,
  -- A one-off code the club gives a player so their account links to this roster entry.
  claim_code text unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  -- What the player chose to share from their personal PICKLEQ: {"record":bool,"tags":bool,"training":bool}
  share jsonb not null default '{}'::jsonb,
  sample boolean not null default false,
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);
create index club_players_club_idx on public.club_players (club_id);

-- Pending role grants by email, used when the club exists before the person signs up. Never readable by anyone.
create table public.club_claims (
  club_id uuid not null references public.clubs (id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'coach', 'player')),
  player_id uuid references public.club_players (id) on delete set null,
  primary key (club_id, email)
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  start_date date not null,
  start_time time not null default '08:00',
  courts int not null default 4 check (courts between 1 and 64),
  slot_minutes int not null default 20 check (slot_minutes between 5 and 120),
  status text not null default 'draft' check (status in ('draft', 'live', 'done')),
  is_public boolean not null default false,
  public_slug text unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_at timestamptz not null default now()
);
create index tournaments_club_idx on public.tournaments (club_id);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('singles', 'doubles')),
  format jsonb not null,
  pools int not null check (pools between 1 and 16),
  advance int not null check (advance between 0 and 8),
  sort int not null default 0
);
create index divisions_tournament_idx on public.divisions (tournament_id);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  player_ids uuid[] not null check (cardinality(player_ids) between 1 and 2),
  seed int,
  pool int,
  -- Withdrawn entries stay in the table so played results keep their names; their unplayed matches become void.
  status text not null default 'active' check (status in ('active', 'withdrawn'))
);
create index entries_division_idx on public.entries (division_id);

-- One club match. games: [{ "points": "ABAAB…", "a": 11, "b": 7 }] where A is side_a.
-- Momentum is worked out from the point order on the phone, not stored here, so the rules can change.
create table public.club_matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete cascade,
  division_id uuid references public.divisions (id) on delete cascade,
  stage text not null default 'friendly' check (stage in ('pool', 'qf', 'sf', 'final', 'friendly')),
  pool int,
  round int,
  bracket_pos int,
  slot int,
  court int,
  entry_a uuid references public.entries (id) on delete cascade,
  entry_b uuid references public.entries (id) on delete cascade,
  side_a uuid[] not null default '{}',
  side_b uuid[] not null default '{}',
  format jsonb not null,
  games jsonb not null default '[]'::jsonb,
  -- void: not played and not counted (e.g. a team withdrew).
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'done', 'void')),
  winner text check (winner is null or winner in ('A', 'B')),
  played_on date,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index club_matches_club_idx on public.club_matches (club_id);
create index club_matches_tournament_idx on public.club_matches (tournament_id);
create index club_matches_division_idx on public.club_matches (division_id);
create index club_matches_side_a_idx on public.club_matches using gin (side_a);
create index club_matches_side_b_idx on public.club_matches using gin (side_b);

-- Links that let someone score a court (or the whole event) without an account. The token is the secret part of
-- the link; the PIN is told to the scorer separately. Only the server functions below ever check them.
create table public.scorer_links (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  court int check (court is null or court between 1 and 64),
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  pin text not null default lpad((floor(random() * 10000))::int::text, 4, '0') check (pin ~ '^[0-9]{4,6}$'),
  label text check (label is null or char_length(label) <= 40),
  revoked boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index scorer_links_tournament_idx on public.scorer_links (tournament_id);

-- A summary a player chose to share from their personal app (numbers only, never raw matches).
create table public.shared_summaries (
  player_id uuid primary key references public.club_players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Helper functions (run with owner rights, fixed search path) ----------

create function public.club_role(cid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.club_members m where m.club_id = cid and m.user_id = (select auth.uid())
$$;

create function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.club_role(cid) is not null
$$;

create function public.is_staff(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.club_role(cid) in ('owner', 'admin', 'coach'), false)
$$;

create function public.is_admin(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.club_role(cid) in ('owner', 'admin'), false)
$$;

create function public.shares_club(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_members a join public.club_members b on a.club_id = b.club_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  )
$$;

-- ---------- Row-level security ----------

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_players enable row level security;
alter table public.club_claims enable row level security;
alter table public.tournaments enable row level security;
alter table public.divisions enable row level security;
alter table public.entries enable row level security;
alter table public.club_matches enable row level security;
alter table public.shared_summaries enable row level security;
alter table public.scorer_links enable row level security;

create policy "own or clubmate profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_club(id));
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members see their club" on public.clubs for select to authenticated
  using (public.is_member(id));
create policy "admins edit their club" on public.clubs for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));
create policy "owner deletes club" on public.clubs for delete to authenticated
  using (public.club_role(id) = 'owner');

create policy "members see members" on public.club_members for select to authenticated
  using (public.is_member(club_id));
create policy "leave, or admin removes non-owner" on public.club_members for delete to authenticated
  using (role <> 'owner' and (user_id = (select auth.uid()) or public.is_admin(club_id)));

create policy "members see roster" on public.club_players for select to authenticated
  using (public.is_member(club_id));
create policy "staff add players" on public.club_players for insert to authenticated
  with check (public.is_staff(club_id));
create policy "staff edit players" on public.club_players for update to authenticated
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy "admins remove players" on public.club_players for delete to authenticated
  using (public.is_admin(club_id));

-- club_claims: no policies, so nobody can read or write it directly.

create policy "members see tournaments" on public.tournaments for select to authenticated using (public.is_member(club_id));
create policy "staff add tournaments" on public.tournaments for insert to authenticated with check (public.is_staff(club_id));
create policy "staff edit tournaments" on public.tournaments for update to authenticated using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy "admins delete tournaments" on public.tournaments for delete to authenticated using (public.is_admin(club_id));

create policy "members see divisions" on public.divisions for select to authenticated using (public.is_member(club_id));
create policy "staff add divisions" on public.divisions for insert to authenticated with check (public.is_staff(club_id));
create policy "staff edit divisions" on public.divisions for update to authenticated using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy "staff delete divisions" on public.divisions for delete to authenticated using (public.is_staff(club_id));

create policy "members see entries" on public.entries for select to authenticated using (public.is_member(club_id));
create policy "staff add entries" on public.entries for insert to authenticated with check (public.is_staff(club_id));
create policy "staff edit entries" on public.entries for update to authenticated using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy "staff delete entries" on public.entries for delete to authenticated using (public.is_staff(club_id));

create policy "members see club matches" on public.club_matches for select to authenticated using (public.is_member(club_id));
create policy "staff add club matches" on public.club_matches for insert to authenticated with check (public.is_staff(club_id));
create policy "staff score club matches" on public.club_matches for update to authenticated using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy "staff delete club matches" on public.club_matches for delete to authenticated using (public.is_staff(club_id));

-- Only coaches and admins see their event's scorer links and PINs.
create policy "staff see scorer links" on public.scorer_links for select to authenticated using (public.is_staff(club_id));
create policy "staff add scorer links" on public.scorer_links for insert to authenticated with check (public.is_staff(club_id));
create policy "staff edit scorer links" on public.scorer_links for update to authenticated using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy "staff delete scorer links" on public.scorer_links for delete to authenticated using (public.is_staff(club_id));

-- Coaches and admins see shared summaries; a player sees their own.
create policy "staff or self see summaries" on public.shared_summaries for select to authenticated
  using (public.is_staff(club_id) or exists (
    select 1 from public.club_players p where p.id = player_id and p.user_id = (select auth.uid())));

-- ---------- Server functions (the only way to do sensitive changes) ----------


create function public.create_club(club_name text, club_city text, my_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  cid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  insert into public.profiles (id, display_name) values (me, coalesce(my_name, ''))
    on conflict (id) do update set display_name = case when excluded.display_name <> '' then excluded.display_name else public.profiles.display_name end;
  insert into public.clubs (name, city, created_by) values (club_name, nullif(trim(club_city), ''), me) returning id into cid;
  insert into public.club_members (club_id, user_id, role) values (cid, me, 'owner');
  insert into public.club_players (club_id, name, user_id) values (cid, coalesce(nullif(trim(my_name), ''), 'Me'), me);
  return cid;
end $$;

-- Join with the club's invite code. A player claim code (optional) links you to your roster entry.
create function public.join_club(code text, claim text, my_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  cid uuid;
  pid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into cid from public.clubs where invite_code = trim(code);
  if cid is null then raise exception 'That invite link is not valid'; end if;
  insert into public.profiles (id, display_name) values (me, coalesce(my_name, ''))
    on conflict (id) do update set display_name = case when excluded.display_name <> '' then excluded.display_name else public.profiles.display_name end;
  insert into public.club_members (club_id, user_id, role) values (cid, me, 'player') on conflict do nothing;
  if exists (select 1 from public.club_players where club_id = cid and user_id = me) then return cid; end if;
  if claim is not null and trim(claim) <> '' then
    update public.club_players set user_id = me, claim_code = null
      where club_id = cid and claim_code = trim(claim) and user_id is null returning id into pid;
  end if;
  if pid is null then
    insert into public.club_players (club_id, name, user_id) values (cid, coalesce(nullif(trim(my_name), ''), 'New player'), me);
  end if;
  return cid;
end $$;

create function public.set_member_role(cid uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(cid) then raise exception 'Only club admins can change roles'; end if;
  if new_role not in ('admin', 'coach', 'player') then raise exception 'Unknown role'; end if;
  if (select role from public.club_members where club_id = cid and user_id = member) = 'owner' then
    raise exception 'The owner''s role can''t be changed';
  end if;
  if new_role = 'admin' and public.club_role(cid) <> 'owner' then raise exception 'Only the owner can make admins'; end if;
  update public.club_members set role = new_role where club_id = cid and user_id = member;
end $$;


create function public.share_my_summary(pid uuid, summary jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  select club_id into cid from public.club_players where id = pid and user_id = (select auth.uid());
  if cid is null then raise exception 'You can only share your own summary'; end if;
  if pg_column_size(summary) > 20000 then raise exception 'Summary too large'; end if;
  insert into public.shared_summaries (player_id, club_id, data, updated_at) values (pid, cid, summary, now())
    on conflict (player_id) do update set data = excluded.data, updated_at = now();
end $$;


-- ---------- Scorer links (no account) ----------

-- Checks a scorer link and PIN. Returns the link, or an error message the scorer can read.
-- Wrong PINs are counted (no exception, so the count is kept); 8 in a row lock the link for 15 minutes.
create function public.scorer_check(p_token text, p_pin text)
returns table (link_id uuid, link_tournament uuid, link_court int, link_label text, err text)
language plpgsql security definer set search_path = '' as $$
declare
  l public.scorer_links;
  t_status text;
begin
  select * into l from public.scorer_links where token = p_token;
  if l.id is null or l.revoked then
    return query select null::uuid, null::uuid, null::int, null::text, 'This scorer link isn''t valid. Ask the organiser for a new one.'::text; return;
  end if;
  select status into t_status from public.tournaments where id = l.tournament_id;
  if t_status = 'done' then
    return query select null::uuid, null::uuid, null::int, null::text, 'This event has finished, so the scorer link no longer works.'::text; return;
  end if;
  if l.locked_until is not null and l.locked_until > now() then
    return query select null::uuid, null::uuid, null::int, null::text, 'Too many wrong PINs. Try again in 15 minutes, or ask the organiser.'::text; return;
  end if;
  if p_pin is distinct from l.pin then
    update public.scorer_links set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 8 then now() + interval '15 minutes' else null end
      where id = l.id;
    return query select null::uuid, null::uuid, null::int, null::text, 'Wrong PIN'::text; return;
  end if;
  update public.scorer_links set failed_attempts = 0, locked_until = null, last_used_at = now() where id = l.id;
  return query select l.id, l.tournament_id, l.court, l.label, null::text;
end $$;

-- What a scorer sees: the event, and the matches on their court (or all courts). Names and scores only.
-- Returns {"error": "..."} when the link or PIN isn't accepted.
create function public.scorer_open(p_token text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  select * into r from public.scorer_check(p_token, p_pin);
  if r.err is not null then return jsonb_build_object('error', r.err); end if;
  return (select jsonb_build_object(
    'court', r.link_court, 'label', r.link_label,
    'tournament', jsonb_build_object('name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'slot_minutes', t.slot_minutes, 'courts', t.courts, 'status', t.status),
    'club', c.name,
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'stage', m.stage, 'pool', m.pool, 'round', m.round, 'slot', m.slot, 'court', m.court,
        'division', d.name, 'format', m.format, 'games', m.games, 'status', m.status, 'winner', m.winner, 'played_on', m.played_on,
        'names_a', (select jsonb_agg(p.name order by array_position(m.side_a, p.id)) from public.club_players p where p.id = any (m.side_a)),
        'names_b', (select jsonb_agg(p.name order by array_position(m.side_b, p.id)) from public.club_players p where p.id = any (m.side_b)))
      order by m.slot nulls last, m.court)
      from public.club_matches m left join public.divisions d on d.id = m.division_id
      where m.tournament_id = r.link_tournament and m.status <> 'void' and (r.link_court is null or m.court = r.link_court)), '[]'::jsonb))
    from public.tournaments t join public.clubs c on c.id = t.club_id where t.id = r.link_tournament);
end $$;

-- Saves a score from a scorer link. Only matches of that event (and court, for a court link).
-- Returns {"ok": true} or {"error": "..."}.
create function public.scorer_save(p_token text, p_pin text, p_match uuid, p_games jsonb, p_status text, p_winner text, p_played_on date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  m public.club_matches;
  g jsonb;
begin
  select * into r from public.scorer_check(p_token, p_pin);
  if r.err is not null then return jsonb_build_object('error', r.err); end if;
  select * into m from public.club_matches where id = p_match;
  if m.id is null or m.tournament_id <> r.link_tournament or (r.link_court is not null and m.court is distinct from r.link_court) then
    return jsonb_build_object('error', 'This match isn''t on your court. Ask the organiser.');
  end if;
  if m.status = 'void' then return jsonb_build_object('error', 'The organiser cancelled this match.'); end if;
  if m.status = 'done' and p_status = 'live' then return jsonb_build_object('error', 'This match is already finished.'); end if;
  if p_status not in ('live', 'done') then return jsonb_build_object('error', 'Unknown match status'); end if;
  if p_status = 'done' and (p_winner is null or p_winner not in ('A', 'B')) then return jsonb_build_object('error', 'A finished match needs a winner'); end if;
  if jsonb_typeof(p_games) is distinct from 'array' or jsonb_array_length(p_games) > 5 then return jsonb_build_object('error', 'Scores aren''t in the right shape'); end if;
  for g in select * from jsonb_array_elements(p_games) loop
    if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g -> 'a') is distinct from 'number' or jsonb_typeof(g -> 'b') is distinct from 'number' then
      return jsonb_build_object('error', 'Scores aren''t in the right shape');
    end if;
    if (g ->> 'a')::numeric not between 0 and 99 or (g ->> 'b')::numeric not between 0 and 99
      or char_length(coalesce(g ->> 'points', '')) > 250 or coalesce(g ->> 'points', '') !~ '^[AB]*$' then
      return jsonb_build_object('error', 'Scores aren''t in the right shape');
    end if;
  end loop;
  update public.club_matches set games = p_games, status = p_status, winner = case when p_status = 'done' then p_winner else null end,
    played_on = coalesce(p_played_on, played_on), updated_at = now(), updated_by = null
    where id = p_match;
  return jsonb_build_object('ok', true);
end $$;

-- Public results for a published tournament: names and scores only. No ratings, accounts or emails.
create function public.public_tournament(slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when t.id is null then null else jsonb_build_object(
    'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'slot_minutes', t.slot_minutes, 'status', t.status, 'club', c.name,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'pools', d.pools, 'advance', d.advance, 'format', d.format) order by d.sort) from public.divisions d where d.tournament_id = t.id), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'division_id', e.division_id, 'seed', e.seed, 'pool', e.pool, 'status', e.status,
        'names', (select jsonb_agg(p.name order by array_position(e.player_ids, p.id)) from public.club_players p where p.id = any (e.player_ids))))
      from public.entries e join public.divisions d on d.id = e.division_id where d.tournament_id = t.id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'division_id', m.division_id, 'stage', m.stage, 'pool', m.pool, 'round', m.round,
        'bracket_pos', m.bracket_pos, 'slot', m.slot, 'court', m.court, 'entry_a', m.entry_a, 'entry_b', m.entry_b,
        'games', (select coalesce(jsonb_agg(jsonb_build_object('a', g -> 'a', 'b', g -> 'b')), '[]'::jsonb) from jsonb_array_elements(m.games) g),
        'status', m.status, 'winner', m.winner))
      from public.club_matches m where m.tournament_id = t.id and m.status <> 'void'), '[]'::jsonb))
  end
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.public_slug = slug and t.is_public
$$;

-- Only signed-in people may call the account functions; anyone may read a published tournament.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_club(text, text, text), public.join_club(text, text, text),
  public.set_member_role(uuid, uuid, text), public.share_my_summary(uuid, jsonb),
  public.club_role(uuid), public.is_member(uuid), public.is_staff(uuid), public.is_admin(uuid),
  public.shares_club(uuid), public.public_tournament(text) to authenticated;
grant execute on function public.public_tournament(text) to anon;
grant execute on function public.scorer_open(text, text), public.scorer_save(text, text, uuid, jsonb, text, text, date) to anon, authenticated;
-- scorer_check is only called inside the two functions above.
revoke execute on function public.scorer_check(text, text) from authenticated;
