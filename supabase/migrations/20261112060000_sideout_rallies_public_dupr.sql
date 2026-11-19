-- RallyQ v1.2 scoring (12 Nov 2026, Vineeth): referees choose side-out scoring, rally scoring or final scores, and
-- the public scores carry each player's DUPR (entered by the organisers) so every public page and the win predictor can show it.
--
-- A game is still {a, b, points}. New, optional keys:
--   rallies  every rally in order, A/B = who won it (side-out scoring keeps the rallies that scored nothing too)
--   mode     'sideout' or 'rally' (how the referee scored it); absent for final scores typed in
--   serve    'A' or 'B': who served first in that game (side-out scoring)
-- Nothing else changes: points stays the scored points only, so every existing reader keeps working.

-- Score shape, shared by referee links, the desk and audited corrections.
create or replace function public.score_problem(p_games jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare g jsonb;
begin
  if jsonb_typeof(p_games) is distinct from 'array' or jsonb_array_length(p_games) > 5 then return 'Scores aren''t in the right shape'; end if;
  for g in select * from jsonb_array_elements(p_games) loop
    if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g -> 'a') is distinct from 'number' or jsonb_typeof(g -> 'b') is distinct from 'number' then
      return 'Scores aren''t in the right shape';
    end if;
    if (g ->> 'a')::numeric not between 0 and 99 or (g ->> 'b')::numeric not between 0 and 99
      or char_length(coalesce(g ->> 'points', '')) > 250 or coalesce(g ->> 'points', '') !~ '^[AB]*$' then
      return 'Scores aren''t in the right shape';
    end if;
    if (g ? 'rallies' and (jsonb_typeof(g -> 'rallies') is distinct from 'string' or char_length(g ->> 'rallies') > 600 or (g ->> 'rallies') !~ '^[AB]*$'))
      or (g ? 'mode' and coalesce(g ->> 'mode', '') not in ('sideout', 'rally'))
      or (g ? 'serve' and coalesce(g ->> 'serve', '') not in ('A', 'B')) then
      return 'Scores aren''t in the right shape';
    end if;
  end loop;
  return null;
end $$;

-- Referee links: same checks as before, now through the shared score shape (so rallies, mode and serve are checked too).
create or replace function public.scorer_save(p_token text, p_pin text, p_match uuid, p_games jsonb, p_status text, p_winner text, p_played_on date)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  m public.club_matches;
  problem text;
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
  problem := public.score_problem(p_games);
  if problem is not null then return jsonb_build_object('error', problem); end if;
  update public.club_matches set games = p_games, status = p_status, winner = case when p_status = 'done' then p_winner else null end,
    played_on = coalesce(p_played_on, played_on), updated_at = now(), updated_by = null
    where id = p_match;
  return jsonb_build_object('ok', true);
end $$;

-- Public results: as before, plus each player's DUPR for that event's kind (singles or doubles, null when unrated, in the
-- entry's player order) and, per game, the rally order and who served first. Still no accounts, phones or emails.
create or replace function public.public_tournament(slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when t.id is null then null else jsonb_build_object(
    'name', t.name, 'start_date', t.start_date, 'start_time', t.start_time, 'slot_minutes', t.slot_minutes, 'status', t.status, 'club', c.name,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'pools', d.pools, 'advance', d.advance, 'format', d.format) order by d.sort) from public.divisions d where d.tournament_id = t.id), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'division_id', e.division_id, 'seed', e.seed, 'pool', e.pool, 'status', e.status,
        'names', (select jsonb_agg(p.name order by array_position(e.player_ids, p.id)) from public.club_players p where p.id = any (e.player_ids)),
        'duprs', (select jsonb_agg(case when d.kind = 'singles' then p.dupr_singles else p.dupr_doubles end order by array_position(e.player_ids, p.id))
          from public.club_players p where p.id = any (e.player_ids))))
      from public.entries e join public.divisions d on d.id = e.division_id where d.tournament_id = t.id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'division_id', m.division_id, 'stage', m.stage, 'pool', m.pool, 'round', m.round,
        'bracket_pos', m.bracket_pos, 'slot', m.slot, 'court', m.court, 'entry_a', m.entry_a, 'entry_b', m.entry_b,
        'games', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('a', g -> 'a', 'b', g -> 'b', 'rallies', g -> 'rallies', 'serve', g -> 'serve', 'mode', g -> 'mode'))), '[]'::jsonb) from jsonb_array_elements(m.games) g),
        'status', m.status, 'winner', m.winner))
      from public.club_matches m where m.tournament_id = t.id and m.status <> 'void'), '[]'::jsonb))
  end
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.public_slug = slug and t.is_public and t.approval = 'approved'
$$;
grant execute on function public.public_tournament(text) to anon, authenticated;
grant execute on function public.scorer_save(text, text, uuid, jsonb, text, text, date) to anon, authenticated;
