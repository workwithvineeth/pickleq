-- Applied on the server as club_mode_6_robot_sandbox.
-- The test robot's sandbox: one fixed test club (id e2e00000-…-0001, already on the server), that the robot puts back to a known
-- state before each run. Only the server itself can run this (service role, used by the robot-reset edge function,
-- which first checks that the caller is this project's GitHub robot). It can't touch any other club.

create or replace function public.robot_reset() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  club constant uuid := 'e2e00000-0000-4000-8000-000000000001';
  tid constant uuid := 'e2e00000-0000-4000-8000-000000000201';
  did constant uuid := 'e2e00000-0000-4000-8000-000000000301';
  fmt constant jsonb := '{"pointsTo": 11, "bestOf": 1, "scoring": "sideout", "golden": true}';
  p1 constant uuid := 'e2e00000-0000-4000-8000-000000000101';
  p2 constant uuid := 'e2e00000-0000-4000-8000-000000000102';
  p3 constant uuid := 'e2e00000-0000-4000-8000-000000000103';
  p4 constant uuid := 'e2e00000-0000-4000-8000-000000000104';
  e1 constant uuid := 'e2e00000-0000-4000-8000-000000000401';
  e2 constant uuid := 'e2e00000-0000-4000-8000-000000000402';
  e3 constant uuid := 'e2e00000-0000-4000-8000-000000000403';
  e4 constant uuid := 'e2e00000-0000-4000-8000-000000000404';
  l1 constant uuid := 'e2e00000-0000-4000-8000-000000000601';
  l2 constant uuid := 'e2e00000-0000-4000-8000-000000000602';
  l3 constant uuid := 'e2e00000-0000-4000-8000-000000000603';
  today date := (now() at time zone 'Asia/Kolkata')::date;
  links jsonb;
begin
  -- The robot has no account, so it can only score matches. Putting the fixed rows back is enough.
  insert into public.club_players (id, club_id, name, dupr_singles, sample) values
    (p1, club, 'Asha Test', 4.10, true), (p2, club, 'Ravi Test', 3.90, true), (p3, club, 'Meera Test', 3.60, true), (p4, club, 'Kiran Test', 3.30, true)
    on conflict (id) do update set name = excluded.name, dupr_singles = excluded.dupr_singles, dupr_id = null;

  insert into public.tournaments (id, club_id, name, start_date, start_time, courts, slot_minutes, status, is_public, public_slug)
    values (tid, club, 'E2E Test Round Robin', today, '08:00', 2, 20, 'live', true, 'pqe2etest1')
    on conflict (id) do update set name = excluded.name, start_date = excluded.start_date, courts = 2, status = 'live', is_public = true, public_slug = 'pqe2etest1';

  insert into public.divisions (id, tournament_id, club_id, name, kind, format, pools, advance, sort)
    values (did, tid, club, 'Round Robin Singles', 'singles', jsonb_build_object('pool', fmt, 'ko', fmt), 1, 0, 0)
    on conflict (id) do update set name = excluded.name, format = excluded.format, pools = 1, advance = 0;

  insert into public.entries (id, division_id, club_id, player_ids, seed, pool) values
    (e1, did, club, array[p1], 1, 1), (e2, did, club, array[p2], 2, 1), (e3, did, club, array[p3], 3, 1), (e4, did, club, array[p4], 4, 1)
    on conflict (id) do update set player_ids = excluded.player_ids, seed = excluded.seed, pool = 1, status = 'active';

  -- Older test matches (from before the sandbox had fixed rows) are cancelled, so they never show.
  update public.club_matches set status = 'void', winner = null where club_id = club and id not in (
    'e2e00000-0000-4000-8000-000000000501', 'e2e00000-0000-4000-8000-000000000502', 'e2e00000-0000-4000-8000-000000000503',
    'e2e00000-0000-4000-8000-000000000504', 'e2e00000-0000-4000-8000-000000000505', 'e2e00000-0000-4000-8000-000000000506');
  -- Court 1: one finished match (Ravi came back from 2–7 on the golden point), then two to play. Court 2: three to play.
  insert into public.club_matches (id, club_id, tournament_id, division_id, stage, pool, round, slot, court, entry_a, entry_b, side_a, side_b, format, games, status, winner, played_on) values
    ('e2e00000-0000-4000-8000-000000000501', club, tid, did, 'pool', 1, 1, 0, 1, e1, e2, array[p1], array[p2], fmt, '[{"points": "AABAAABAABABBBBBBBAAB", "a": 10, "b": 11}]', 'done', 'B', today),
    ('e2e00000-0000-4000-8000-000000000502', club, tid, did, 'pool', 1, 1, 0, 2, e3, e4, array[p3], array[p4], fmt, '[]', 'scheduled', null, today),
    ('e2e00000-0000-4000-8000-000000000503', club, tid, did, 'pool', 1, 2, 1, 1, e1, e3, array[p1], array[p3], fmt, '[]', 'scheduled', null, today),
    ('e2e00000-0000-4000-8000-000000000504', club, tid, did, 'pool', 1, 2, 1, 2, e2, e4, array[p2], array[p4], fmt, '[]', 'scheduled', null, today),
    ('e2e00000-0000-4000-8000-000000000505', club, tid, did, 'pool', 1, 3, 2, 1, e1, e4, array[p1], array[p4], fmt, '[]', 'scheduled', null, today),
    ('e2e00000-0000-4000-8000-000000000506', club, tid, did, 'pool', 1, 3, 2, 2, e2, e3, array[p2], array[p3], fmt, '[]', 'scheduled', null, today)
    on conflict (id) do update set court = excluded.court, slot = excluded.slot, side_a = excluded.side_a, side_b = excluded.side_b,
      games = excluded.games, status = excluded.status, winner = excluded.winner, played_on = excluded.played_on, updated_at = now(), updated_by = null;

  -- Fresh links and PINs every run, so a link seen in an old report is useless.
  update public.scorer_links set revoked = true where club_id = club and id not in (l1, l2, l3);
  insert into public.scorer_links (id, tournament_id, club_id, court, label, token, pin) values
    (l1, tid, club, 1, 'Robot court 1', encode(extensions.gen_random_bytes(20), 'hex'), lpad((floor(random() * 10000))::int::text, 4, '0')),
    (l2, tid, club, 2, 'Robot court 2', encode(extensions.gen_random_bytes(20), 'hex'), lpad((floor(random() * 10000))::int::text, 4, '0')),
    (l3, tid, club, null, 'Robot lockout', encode(extensions.gen_random_bytes(20), 'hex'), lpad((floor(random() * 10000))::int::text, 4, '0'))
    on conflict (id) do update set token = excluded.token, pin = excluded.pin, court = excluded.court, revoked = false, failed_attempts = 0, locked_until = null, last_used_at = null;
  select jsonb_object_agg(case when court is null then 'lockout' else 'court' || court end, jsonb_build_object('token', token, 'pin', pin))
    into links from public.scorer_links where id in (l1, l2, l3);

  return jsonb_build_object('ok', true, 'slug', 'pqe2etest1', 'tournament', tid, 'links', links);
end $$;

revoke execute on function public.robot_reset() from public, anon, authenticated;
grant execute on function public.robot_reset() to service_role;
