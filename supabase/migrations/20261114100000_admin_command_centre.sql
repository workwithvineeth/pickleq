-- S5 · Admin command centre (written 14 Nov 2026, NOT applied: freeze starts 15 Nov 2:30 pm; Vineeth applies it after the event).
-- PaddleQ (platform) admins can: delete a club or a tournament for good (type the name to confirm, one audit row each),
-- fix a finished match's score (override of the pool and knockout locks, still never changing a knockout winner),
-- and assign club roles (add by email, change role, remove) without opening a support session.
-- Every function: security definer, search_path '', platform admins only, revoked from public/anon. Nothing here is callable by clubs.

-- 1) Delete a tournament, whoever entered. A live one must be finished first (so a running event is never wiped by a mis-tap).
create or replace function public.admin_delete_tournament(p_tournament uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tournaments; n_matches int; n_people int;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can delete a tournament for good'; end if;
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null then raise exception 'Tournament not found'; end if;
  if t.status = 'live' then raise exception 'This tournament is live. Mark it finished first, then delete it.'; end if;
  if trim(coalesce(p_confirm_name, '')) is distinct from trim(t.name) then raise exception 'Type the tournament name exactly to confirm'; end if;
  select count(*) into n_matches from public.club_matches where tournament_id = t.id;
  select count(*) into n_people from public.registrations r join public.divisions d on d.id = r.division_id where d.tournament_id = t.id;
  perform public.audit('admin_tournament_delete', t.club_id, t.id,
    format('%s (%s): %s match(es), %s registration(s), status %s', t.name, t.start_date, n_matches, n_people, t.status));
  -- score-correction history is kept with "restrict" for normal use; a deliberate platform delete removes it with its matches.
  delete from public.club_score_corrections where match_id in (select id from public.club_matches where tournament_id = t.id);
  delete from public.club_matches where tournament_id = t.id;
  delete from public.divisions where tournament_id = t.id;
  delete from public.tournaments where id = t.id;
end $$;
revoke execute on function public.admin_delete_tournament(uuid, text) from public, anon;
grant execute on function public.admin_delete_tournament(uuid, text) to authenticated;

-- 2) Delete a whole club with everything in it (tournaments, players, members, entries). Refuses while any of its tournaments is live.
create or replace function public.admin_delete_club(p_club uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clubs; n_t int; n_m int;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can delete a club'; end if;
  select * into c from public.clubs where id = p_club;
  if c.id is null then raise exception 'Club not found'; end if;
  if exists (select 1 from public.tournaments where club_id = c.id and status = 'live') then
    raise exception 'This club has a live tournament. Mark it finished first, then delete the club.';
  end if;
  if trim(coalesce(p_confirm_name, '')) is distinct from trim(c.name) then raise exception 'Type the club name exactly to confirm'; end if;
  select count(*) into n_t from public.tournaments where club_id = c.id;
  select count(*) into n_m from public.club_members where club_id = c.id;
  perform public.audit('admin_club_delete', c.id, null, format('%s (%s): %s tournament(s), %s member(s)', c.name, coalesce(c.city, 'no city'), n_t, n_m));
  delete from public.club_score_corrections where club_id = c.id;
  delete from public.clubs where id = c.id; -- cascades to tournaments, divisions, matches, entries, players, members
end $$;
revoke execute on function public.admin_delete_club(uuid, text) from public, anon;
grant execute on function public.admin_delete_club(uuid, text) to authenticated;

-- 3) Fix a finished match's result. Same score rules as correct_club_match, but a platform admin may also fix pool results after
--    the pool is complete or the knockout draw exists. A knockout winner still cannot change (the bracket depends on it).
create or replace function public.admin_edit_match_result(p_match uuid, p_games jsonb, p_reason text, p_updated_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.club_matches; game jsonb; a numeric; b numeric; a_wins int := 0; b_wins int := 0; target int; need int; golden boolean;
  new_winner text; reason text := trim(coalesce(p_reason, ''));
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can edit a result here'; end if;
  select * into m from public.club_matches where id = p_match;
  if m.id is null or m.tournament_id is null then raise exception 'Match not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(m.division_id::text, 7));
  select * into m from public.club_matches where id = p_match for update;
  if m.status <> 'done' or m.updated_at is distinct from p_updated_at then raise exception 'This result changed. Reload before editing it.'; end if;
  if char_length(reason) not between 3 and 300 then raise exception 'Enter a reason of 3 to 300 characters'; end if;
  if cardinality(m.side_a) = 0 or cardinality(m.side_b) = 0 then raise exception 'A bye cannot be edited'; end if;
  if public.score_problem(p_games) is not null then raise exception 'Enter valid game scores'; end if;
  target := (m.format->>'pointsTo')::int;
  need := (m.format->>'bestOf')::int / 2 + 1;
  golden := coalesce((m.format->>'golden')::boolean, false);
  for game in select value from jsonb_array_elements(p_games) loop
    a := (game->>'a')::numeric; b := (game->>'b')::numeric;
    if a_wins >= need or b_wins >= need or a = b or a <> trunc(a) or b <> trunc(b)
      or greatest(a, b) <> (case when golden then target else greatest(target, least(a, b) + 2) end)
      or coalesce(game->>'points', '') <> '' then raise exception 'Enter a complete legal score for each game'; end if;
    if a > b then a_wins := a_wins + 1; else b_wins := b_wins + 1; end if;
  end loop;
  if a_wins < need and b_wins < need then raise exception 'Enter enough games to decide the match'; end if;
  new_winner := case when a_wins >= need then 'A' else 'B' end;
  if m.stage not in ('pool', 'friendly') and new_winner is distinct from m.winner then
    raise exception 'A knockout winner cannot change here, because the bracket depends on it';
  end if;
  insert into public.club_score_corrections (match_id, club_id, corrected_by, reason, old_games, new_games, old_winner, new_winner)
    values (m.id, m.club_id, auth.uid(), 'PaddleQ admin: ' || left(reason, 280), m.games, p_games, m.winner, new_winner);
  perform public.audit('admin_result_edit', m.club_id, m.tournament_id, left(format('match %s: %s', m.id, reason), 450));
  perform set_config('paddleq.correcting_match', m.id::text, true);
  update public.club_matches set games = p_games, winner = new_winner, updated_at = clock_timestamp(), updated_by = auth.uid() where id = m.id;
  perform set_config('paddleq.correcting_match', '', true);
end $$;
revoke execute on function public.admin_edit_match_result(uuid, jsonb, text, timestamptz) from public, anon;
grant execute on function public.admin_edit_match_result(uuid, jsonb, text, timestamptz) to authenticated;

-- 4) Club roles. The people list (with user ids, which admin_club does not carry).
create or replace function public.admin_club_members(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can see this'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', m.user_id, 'email', u.email, 'role', m.role,
      'helper', exists (select 1 from public.club_helpers h where h.user_id = m.user_id),
      'support', m.support_until is not null,
      'name', (select p.name from public.club_players p where p.club_id = m.club_id and p.user_id = m.user_id limit 1)
    ) order by (m.role = 'owner') desc, u.email), '[]'::jsonb)
    from public.club_members m join auth.users u on u.id = m.user_id where m.club_id = p_club and m.support_until is null);
end $$;
revoke execute on function public.admin_club_members(uuid) from public, anon;
grant execute on function public.admin_club_members(uuid) to authenticated;

create or replace function public.admin_set_member_role(p_club uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare cur text;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can assign club roles'; end if;
  if p_role not in ('owner', 'admin', 'coach', 'player') then raise exception 'Unknown role'; end if;
  select role into cur from public.club_members where club_id = p_club and user_id = p_user and support_until is null;
  if cur is null then raise exception 'That person is not in this club'; end if;
  if cur = 'owner' and p_role <> 'owner'
    and (select count(*) from public.club_members where club_id = p_club and role = 'owner' and support_until is null) < 2 then
    raise exception 'A club needs an owner. Make someone else an owner first.';
  end if;
  update public.club_members set role = p_role where club_id = p_club and user_id = p_user;
  perform public.audit('admin_role_set', p_club, null, format('%s: %s to %s', p_user, cur, p_role));
end $$;
revoke execute on function public.admin_set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_member_role(uuid, uuid, text) to authenticated;

-- Add someone by email: a person who already has an account joins straight away; otherwise the role waits for them (club_claims).
create or replace function public.admin_add_club_member(p_club uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare em text := lower(trim(coalesce(p_email, ''))); uid uuid;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can assign club roles'; end if;
  if p_role not in ('owner', 'admin', 'coach', 'player') then raise exception 'Unknown role'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 200 then raise exception 'Enter a valid email'; end if;
  if not exists (select 1 from public.clubs where id = p_club) then raise exception 'Club not found'; end if;
  select id into uid from auth.users where lower(email) = em limit 1;
  if uid is not null then
    insert into public.club_members (club_id, user_id, role) values (p_club, uid, p_role)
      on conflict (club_id, user_id) do update set role = excluded.role, support_until = null;
    perform public.audit('admin_role_add', p_club, null, format('%s as %s', em, p_role));
    return 'added';
  end if;
  insert into public.club_claims (club_id, email, role) values (p_club, em, p_role)
    on conflict (club_id, email) do update set role = excluded.role;
  perform public.audit('admin_role_invite', p_club, null, format('%s as %s (waiting for sign-up)', em, p_role));
  return 'invited';
end $$;
revoke execute on function public.admin_add_club_member(uuid, text, text) from public, anon;
grant execute on function public.admin_add_club_member(uuid, text, text) to authenticated;

create or replace function public.admin_remove_club_member(p_club uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cur text;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can remove club members'; end if;
  select role into cur from public.club_members where club_id = p_club and user_id = p_user and support_until is null;
  if cur is null then raise exception 'That person is not in this club'; end if;
  if cur = 'owner' and (select count(*) from public.club_members where club_id = p_club and role = 'owner' and support_until is null) < 2 then
    raise exception 'A club needs an owner. Make someone else an owner first.';
  end if;
  delete from public.club_members where club_id = p_club and user_id = p_user;
  perform public.audit('admin_role_remove', p_club, null, format('%s (was %s)', p_user, cur));
end $$;
revoke execute on function public.admin_remove_club_member(uuid, uuid) from public, anon;
grant execute on function public.admin_remove_club_member(uuid, uuid) to authenticated;
