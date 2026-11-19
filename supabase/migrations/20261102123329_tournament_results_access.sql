-- A results-only API. Platform admins can inspect tournament results without joining
-- the club or gaining write access. Existing club/table RLS remains unchanged.
create function public.tournament_results_bundle(p_tournament uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t public.tournaments;
  member_role text;
begin
  if (select auth.uid()) is null then return jsonb_build_object('error', 'Sign in first'); end if;
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null then return jsonb_build_object('error', 'Results unavailable or you do not have access to this tournament'); end if;
  member_role := public.club_role(t.club_id);
  if member_role is null and not public.is_platform_admin() then
    return jsonb_build_object('error', 'Results unavailable or you do not have access to this tournament');
  end if;
  return jsonb_build_object(
    'role', coalesce(member_role, 'player'),
    'club', (select jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city, 'logo_url', c.logo_url) from public.clubs c where c.id = t.club_id),
    'tournament', jsonb_build_object('id', t.id, 'club_id', t.club_id, 'name', t.name, 'start_date', t.start_date,
      'start_time', t.start_time, 'courts', t.courts, 'slot_minutes', t.slot_minutes, 'status', t.status,
      'is_public', t.is_public, 'public_slug', t.public_slug, 'city', t.city, 'venue', t.venue),
    'divisions', (select coalesce(jsonb_agg(to_jsonb(d) order by d.sort), '[]'::jsonb) from public.divisions d where d.tournament_id = t.id),
    'entries', (select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) from public.entries e
      join public.divisions d on d.id = e.division_id where d.tournament_id = t.id),
    'matches', (select coalesce(jsonb_agg(to_jsonb(m) - 'updated_by' order by m.slot nulls last, m.id), '[]'::jsonb) from public.club_matches m where m.tournament_id = t.id),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'club_id', p.club_id, 'name', p.name,
      'dupr_singles', p.dupr_singles, 'dupr_doubles', p.dupr_doubles, 'dupr_id', p.dupr_id) order by p.id), '[]'::jsonb)
      from public.club_players p where p.club_id = t.club_id and (
        exists (select 1 from public.entries e join public.divisions d on d.id = e.division_id where d.tournament_id = t.id and p.id = any(e.player_ids))
        or exists (select 1 from public.club_matches m where m.tournament_id = t.id and (p.id = any(m.side_a) or p.id = any(m.side_b)))))
  );
end $$;
revoke execute on function public.tournament_results_bundle(uuid) from public, anon;
grant execute on function public.tournament_results_bundle(uuid) to authenticated;
