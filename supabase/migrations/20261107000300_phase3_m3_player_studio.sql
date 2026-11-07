-- Phase 3 Module 3: Player Studio.
-- 1. Claim: a player links their account to their roster entry, either from a private claim link the organiser shares
--    (one per roster entry, staff-only, expires) or automatically from an online registration they made themselves.
--    Claiming never makes anyone a club member and never shows them the club's roster.
-- 2. Official history: read-only results of the matches a claimed player played (names and scores only).
-- 3. Diary: private practice sessions next to the private casual/practice match logs (20261104052658).
--    Tournament matches can't be logged by players; they only come from official results.

-- ---------- 1. Claim ----------

alter table public.club_players add column if not exists claimed_at timestamptz;

-- One private link per roster entry. Never readable directly: only the functions below use it.
create table public.player_claim_links (
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  player_id uuid not null references public.club_players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
create index player_claim_links_player_idx on public.player_claim_links (player_id);
create index player_claim_links_club_idx on public.player_claim_links (club_id);
create index player_claim_links_created_by_idx on public.player_claim_links (created_by);
create index player_claim_links_used_by_idx on public.player_claim_links (used_by);
alter table public.player_claim_links enable row level security;
revoke all on public.player_claim_links from public, anon, authenticated;

-- The organiser (or PaddleQ support) gets the claim link for one player, to send on WhatsApp or in the recap email.
create function public.studio_claim_link(p_player uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.club_players;
  tok text;
begin
  select * into p from public.club_players where id = p_player;
  if p.id is null or not public.is_staff(p.club_id) then raise exception 'Only the club’s organisers can share claim links'; end if;
  if p.sample then raise exception 'Sample players can’t be claimed'; end if;
  if p.user_id is not null then return jsonb_build_object('claimed', true); end if;
  select token into tok from public.player_claim_links
    where player_id = p.id and used_at is null and expires_at > now() + interval '7 days' order by created_at desc limit 1;
  if tok is null then
    insert into public.player_claim_links (player_id, club_id, created_by) values (p.id, p.club_id, (select auth.uid())) returning token into tok;
  end if;
  return jsonb_build_object('claimed', false, 'token', tok);
end $$;

-- What a claim would give you: the player, club and finished official matches. Signed in only; a wrong token says nothing.
create function public.studio_match_summary(p_player uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.winner, (p_player = any(m.side_a)) as on_a, t.id as tid, t.name, t.start_date
    from public.club_matches m join public.tournaments t on t.id = m.tournament_id
    where m.status = 'done' and m.winner is not null and t.cancelled_at is null
      and cardinality(m.side_a) > 0 and cardinality(m.side_b) > 0 and (p_player = any(m.side_a) or p_player = any(m.side_b))
  )
  select jsonb_build_object(
    'matches', (select count(*) from mine),
    'wins', (select count(*) from mine where (winner = 'A') = on_a),
    'tournaments', coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'date', x.start_date) order by x.start_date desc)
      from (select distinct tid, name, start_date from mine) x), '[]'::jsonb))
$$;
revoke execute on function public.studio_match_summary(uuid) from public, anon, authenticated;

create function public.studio_claim_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.player_claim_links;
  p public.club_players;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  select * into l from public.player_claim_links where token = btrim(coalesce(p_token, ''));
  if l.token is null then return jsonb_build_object('error', 'This claim link isn’t valid. Ask the organiser for a new one.'); end if;
  select * into p from public.club_players where id = l.player_id;
  if p.user_id = (select auth.uid()) then return jsonb_build_object('error', 'You’ve already claimed these matches.', 'mine', true); end if;
  if l.used_at is not null or p.user_id is not null then return jsonb_build_object('error', 'Someone has already claimed this player. If that wasn’t you, tell the organiser.'); end if;
  if l.expires_at <= now() then return jsonb_build_object('error', 'This claim link has expired. Ask the organiser for a new one.'); end if;
  return jsonb_build_object('player_id', p.id, 'name', p.name, 'club', (select name from public.clubs where id = p.club_id))
    || public.studio_match_summary(p.id);
end $$;

-- Roster entries you entered yourself online ("You" is the first player of your own registration), not yet claimed.
create function public.studio_found_players() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('player_id', x.id, 'name', x.name, 'club', x.club) || public.studio_match_summary(x.id)), '[]'::jsonb)
  from (
    select distinct p.id, p.name, c.name as club
    from public.registrations r
    join public.entries e on e.id = r.entry_id
    join public.club_players p on p.id = e.player_ids[1]
    join public.clubs c on c.id = p.club_id
    where r.user_id = (select auth.uid()) and r.source = 'online' and p.user_id is null and not p.sample
  ) x
$$;

-- Claim with a link, or a player found from your own registration. You choose whether Stats and Coach use these results.
create function public.studio_claim(p_token text, p_player uuid, p_use_in_stats boolean default true) returns jsonb
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
    select p2.* into p from public.club_players p2
      where p2.id = p_player and exists (
        select 1 from public.registrations r join public.entries e on e.id = r.entry_id
        where r.user_id = me and r.source = 'online' and e.player_ids[1] = p2.id)
      for update;
    if p.id is null then raise exception 'You can only claim yourself from your own registrations. Ask the organiser for a claim link.'; end if;
  end if;
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

-- "Not me": undo your own claim. The organiser can send a new link later.
create function public.studio_unclaim(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.club_players set user_id = null, claimed_at = null
    where id = p_player and user_id = (select auth.uid()) and claimed_at is not null;
  if not found then raise exception 'That isn’t one of your claimed players'; end if;
end $$;

-- Your claimed roster entries (players aren't club members, so they can't read the roster table itself).
create function public.studio_my_players() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('player_id', p.id, 'name', p.name, 'club', c.name, 'claimed_at', p.claimed_at,
      'dupr_singles', p.dupr_singles, 'dupr_doubles', p.dupr_doubles) order by p.claimed_at desc nulls last), '[]'::jsonb)
  from public.club_players p join public.clubs c on c.id = p.club_id
  where p.user_id = (select auth.uid()) and p.claimed_at is not null
$$;

-- ---------- 2. Official history (read-only) ----------

-- Finished tournament matches of your claimed players. Names and scores only: no ratings, phones or accounts of others.
create function public.studio_official_history() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row order by (row ->> 'played_on') desc, (row ->> 'id')), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', m.id, 'club', c.name, 'tournament', t.name, 'tournament_id', t.id, 'division', d.name, 'kind', d.kind,
      'stage', m.stage, 'played_on', coalesce(m.played_on, t.start_date), 'format', m.format, 'games', m.games, 'winner', m.winner,
      'my_side', case when p.id = any(m.side_a) then 'A' else 'B' end, 'me', p.id,
      'side_a', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by array_position(m.side_a, x.id)), '[]'::jsonb) from public.club_players x where x.id = any(m.side_a)),
      'side_b', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by array_position(m.side_b, x.id)), '[]'::jsonb) from public.club_players x where x.id = any(m.side_b))
    ) as row
    from public.club_players p
    join public.club_matches m on m.club_id = p.club_id and (p.id = any(m.side_a) or p.id = any(m.side_b))
    join public.tournaments t on t.id = m.tournament_id
    join public.clubs c on c.id = p.club_id
    left join public.divisions d on d.id = m.division_id
    where p.user_id = (select auth.uid()) and p.claimed_at is not null and m.status = 'done' and m.winner is not null
      and cardinality(m.side_a) > 0 and cardinality(m.side_b) > 0 and t.cancelled_at is null
  ) h
$$;

-- ---------- 3. Diary ----------

create table public.player_studio_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Whether Stats and Coach include official results (the history itself is always shown).
  use_official boolean not null default true,
  -- Up to five goals: [{ "kind": "rating" | "weekly-minutes" | "drill-rate" | "streak" | "win-rate", "target": number, "drill"?: text, "rating"?: "singles" | "doubles" }]
  goals jsonb not null default '[]' check (jsonb_typeof(goals) = 'array' and jsonb_array_length(goals) <= 5 and octet_length(goals::text) <= 2000),
  updated_at timestamptz not null default now()
);
alter table public.player_studio_settings enable row level security;
revoke all on public.player_studio_settings from public, anon, authenticated;
grant select, insert, update, delete on public.player_studio_settings to authenticated;
create policy "players read own studio settings" on public.player_studio_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "players add own studio settings" on public.player_studio_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "players change own studio settings" on public.player_studio_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "players delete own studio settings" on public.player_studio_settings for delete to authenticated using (user_id = (select auth.uid()));

-- Practice sessions (the Phase 1 diary): session type, minutes, measured drills, 1–5 shot self-ratings, or a rest day.
create table public.player_studio_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_on date not null check (session_on between date '2020-01-01' and current_date + 1),
  kind text not null check (kind in ('solo', 'partner', 'coaching', 'clinic', 'fitness', 'rest')),
  minutes smallint not null check (minutes between 0 and 600),
  intensity smallint check (intensity between 1 and 5),
  -- [{ "category": text, "made": int, "attempts": int }], made never more than attempts.
  drills jsonb not null default '[]' check (
    jsonb_typeof(drills) = 'array' and jsonb_array_length(drills) <= 20 and octet_length(drills::text) <= 4000
    and not jsonb_path_exists(drills, '$[*] ? (!(@.category.type() == "string") || !(@.made.type() == "number") || !(@.attempts.type() == "number") || @.attempts < 1 || @.made < 0 || @.made > @.attempts || @.attempts > 10000)')
  ),
  -- { "Serve": 1..5, … } your own estimates, never mixed with measured drills.
  ratings jsonb not null default '{}' check (
    jsonb_typeof(ratings) = 'object' and octet_length(ratings::text) <= 1000
    and not jsonb_path_exists(ratings, '$.* ? (@.type() != "number" || @ < 1 || @ > 5)')
  ),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  check ((kind = 'rest' and minutes = 0) or (kind <> 'rest' and minutes > 0)),
  check (kind <> 'rest' or (drills = '[]'::jsonb and ratings = '{}'::jsonb))
);
create index player_studio_sessions_owner_date_idx on public.player_studio_sessions (owner_id, session_on desc);
alter table public.player_studio_sessions enable row level security;
revoke all on public.player_studio_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.player_studio_sessions to authenticated;
create policy "players read own sessions" on public.player_studio_sessions for select to authenticated using (owner_id = (select auth.uid()));
create policy "players add own sessions" on public.player_studio_sessions for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "players change own sessions" on public.player_studio_sessions for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "players delete own sessions" on public.player_studio_sessions for delete to authenticated using (owner_id = (select auth.uid()));

-- Match logs get the Phase 1 details: game-by-game scores, singles/doubles/mixed, energy, 1–5 shot ratings,
-- indoor/outdoor and how strong the opponents were. score_for/score_against stay as the match total
-- (games won when there are several games, points when there is one). Players may delete their own logs.
alter table public.player_studio_logs
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists match_type text check (match_type in ('singles', 'doubles', 'mixed')),
  add column if not exists games jsonb not null default '[]' check (
    jsonb_typeof(games) = 'array' and jsonb_array_length(games) <= 5
    and not jsonb_path_exists(games, '$[*] ? (!(@.you.type() == "number") || !(@.them.type() == "number") || @.you < 0 || @.them < 0 || @.you > 99 || @.them > 99)')
  ),
  add column if not exists energy smallint check (energy between 1 and 5),
  add column if not exists shot_ratings jsonb not null default '{}' check (
    jsonb_typeof(shot_ratings) = 'object' and octet_length(shot_ratings::text) <= 1000
    and not jsonb_path_exists(shot_ratings, '$.* ? (@.type() != "number" || @ < 1 || @ > 5)')
  ),
  add column if not exists setting text check (setting in ('indoor', 'outdoor')),
  add column if not exists opponent_strength text check (opponent_strength in ('stronger', 'equal', 'weaker'));

-- DUPR readings the player types in (DUPR is the source of truth; PaddleQ never calculates ratings).
-- The organiser's numbers from registration are shown alongside, labelled as theirs, and never copied here silently.
create table public.player_studio_ratings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('singles', 'doubles')),
  value numeric(4, 3) not null check (value between 1 and 8),
  rated_on date not null check (rated_on between date '2015-01-01' and current_date + 1),
  created_at timestamptz not null default now()
);
create index player_studio_ratings_owner_idx on public.player_studio_ratings (owner_id, kind, rated_on desc);
alter table public.player_studio_ratings enable row level security;
revoke all on public.player_studio_ratings from public, anon, authenticated;
grant select, insert, update, delete on public.player_studio_ratings to authenticated;
create policy "players read own ratings" on public.player_studio_ratings for select to authenticated using (owner_id = (select auth.uid()));
create policy "players add own ratings" on public.player_studio_ratings for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "players change own ratings" on public.player_studio_ratings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "players delete own ratings" on public.player_studio_ratings for delete to authenticated using (owner_id = (select auth.uid()));
grant delete on public.player_studio_logs to authenticated;
create policy "players delete own practice logs" on public.player_studio_logs for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------- Permissions ----------
revoke execute on function public.studio_claim_link(uuid), public.studio_claim_preview(text), public.studio_found_players(),
  public.studio_claim(text, uuid, boolean), public.studio_unclaim(uuid), public.studio_my_players(), public.studio_official_history()
  from public, anon;
grant execute on function public.studio_claim_link(uuid), public.studio_claim_preview(text), public.studio_found_players(),
  public.studio_claim(text, uuid, boolean), public.studio_unclaim(uuid), public.studio_my_players(), public.studio_official_history()
  to authenticated;
