-- A live score is a best-effort notification. The public tournament RPC is still the source of truth.
create function public.live_score_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  slug text;
  payload jsonb;
begin
  if tg_op = 'UPDATE' then
    if not (row(new.games, new.status, new.winner, new.court, new.slot, new.entry_a, new.entry_b)
      is distinct from row(old.games, old.status, old.winner, old.court, old.slot, old.entry_a, old.entry_b)) then
      return null;
    end if;
  end if;

  select t.public_slug into slug from public.tournaments t
    where t.id = new.tournament_id and t.is_public and t.approval = 'approved' and t.public_slug is not null;
  if slug is null then return null; end if;

  begin
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
      payload := jsonb_build_object(
        'id', new.id, 'court', new.court, 'slot', new.slot, 'status', new.status,
        'winner', new.winner, 'entryA', new.entry_a, 'entryB', new.entry_b,
        'games', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'a', g -> 'a', 'b', g -> 'b', 'rallies', g -> 'rallies', 'serve', g -> 'serve', 'mode', g -> 'mode'
        ))), '[]'::jsonb) from jsonb_array_elements(new.games) g),
        'at', extract(epoch from clock_timestamp()) * 1000
      );
      execute 'select realtime.send($1, $2, $3, $4)' using payload, 'score', 'live:' || slug, false;
    end if;
  exception when others then null;
  end;
  return null;
end $$;

revoke all on function public.live_score_broadcast() from public, anon, authenticated;

create trigger club_matches_live_broadcast
  after insert or update on public.club_matches
  for each row execute function public.live_score_broadcast();
