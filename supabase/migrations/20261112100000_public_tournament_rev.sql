-- Live pages poll every 20 s. Sending the whole tournament each time costs ~4.5 GB/h at 1,000 viewers, more than the
-- free plan allows. public_tournament_rev returns a short fingerprint of everything the live pages show that changes on
-- the day (event status, every match's court, teams, games, status and winner, every entry's status), so pages download
-- the full tournament only when something moved. It hashes the rows rather than trusting updated_at, which not every
-- writer sets.
create or replace function public.public_tournament_rev(slug text) returns text
language sql stable security definer set search_path = '' as $$
  select md5(t.status || t.name || '|' ||
    coalesce((select string_agg(concat_ws(',', m.id, m.status, m.winner, m.court, m.slot, m.entry_a, m.entry_b, m.games::text), ';' order by m.id)
      from public.club_matches m where m.tournament_id = t.id), '') || '|' ||
    coalesce((select string_agg(e.id::text || e.status, ',' order by e.id)
      from public.entries e join public.divisions d on d.id = e.division_id where d.tournament_id = t.id), ''))
  from public.tournaments t
  where t.public_slug = slug and t.is_public and t.approval = 'approved'
$$;
revoke all on function public.public_tournament_rev(text) from public;
grant execute on function public.public_tournament_rev(text) to anon, authenticated;
