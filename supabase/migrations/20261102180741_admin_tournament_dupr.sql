-- Founder-approved platform-admin DUPR editing, scoped to a selected tournament's participants.
-- Does not widen club_players RLS or permit changes to identity, membership, scores or contacts.
create function public.admin_update_tournament_dupr(p_tournament uuid, p_player uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cid uuid; field text; value jsonb; event_kind text; affected int;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    return jsonb_build_object('error', 'Only PaddleQ admins can edit DUPR here');
  end if;
  if coalesce(jsonb_typeof(p_patch), '') <> 'object' or p_patch = '{}'::jsonb then
    return jsonb_build_object('error', 'Add DUPR details to save');
  end if;
  select t.club_id into cid from public.tournaments t join public.club_players p on p.club_id = t.club_id
    where t.id = p_tournament and p.id = p_player and (
      exists (select 1 from public.entries e join public.divisions d on d.id = e.division_id
        where d.tournament_id = t.id and p.id = any(e.player_ids)) or
      exists (select 1 from public.club_matches m where m.tournament_id = t.id and (p.id = any(m.side_a) or p.id = any(m.side_b))));
  if cid is null then return jsonb_build_object('error', 'Player not found in this tournament'); end if;
  for field, value in select * from jsonb_each(p_patch) loop
    if field not in ('duprSingles', 'duprDoubles', 'duprId') then
      return jsonb_build_object('error', 'Only DUPR details can be changed');
    end if;
    if field = 'duprId' then
      if jsonb_typeof(value) <> 'string' or trim(p_patch->>'duprId') !~ '^[A-Za-z0-9-]{3,20}$' then
        return jsonb_build_object('error', 'A DUPR ID is 3 to 20 letters or numbers');
      end if;
    else
      if jsonb_typeof(value) <> 'number' then return jsonb_build_object('error', 'A DUPR rating is a number from 1 to 8'); end if;
      if (value::text)::numeric not between 1 and 8 then return jsonb_build_object('error', 'A DUPR rating is a number from 1 to 8'); end if;
      event_kind := case field when 'duprSingles' then 'singles' else 'doubles' end;
      if not exists (select 1 from public.divisions d where d.tournament_id = p_tournament and d.kind = event_kind and (
        exists (select 1 from public.entries e where e.division_id = d.id and p_player = any(e.player_ids)) or
        exists (select 1 from public.club_matches m where m.tournament_id = p_tournament and m.division_id = d.id and (p_player = any(m.side_a) or p_player = any(m.side_b))))) then
        return jsonb_build_object('error', 'This player did not enter that format');
      end if;
    end if;
  end loop;
  update public.club_players set
    dupr_singles = case when p_patch ? 'duprSingles' then (p_patch->>'duprSingles')::numeric else dupr_singles end,
    dupr_doubles = case when p_patch ? 'duprDoubles' then (p_patch->>'duprDoubles')::numeric else dupr_doubles end,
    dupr_id = case when p_patch ? 'duprId' then upper(trim(p_patch->>'duprId')) else dupr_id end
    where id = p_player and club_id = cid;
  get diagnostics affected = row_count;
  if affected <> 1 then return jsonb_build_object('error', 'No player details were saved'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.admin_update_tournament_dupr(uuid, uuid, jsonb) from public, anon;
grant execute on function public.admin_update_tournament_dupr(uuid, uuid, jsonb) to authenticated;
