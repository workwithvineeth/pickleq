create table public.club_score_corrections (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.club_matches(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  corrected_by uuid not null,
  corrected_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 3 and 300),
  old_games jsonb not null,
  new_games jsonb not null,
  old_winner text,
  new_winner text not null
);
create index on public.club_score_corrections(match_id);
create index on public.club_score_corrections(club_id);
alter table public.club_score_corrections enable row level security;
revoke all on public.club_score_corrections from public, anon, authenticated;
grant select on public.club_score_corrections to authenticated;
create policy "staff read score corrections" on public.club_score_corrections for select to authenticated
  using (public.is_staff(club_id) or public.is_platform_admin());

create function public.correct_club_match(p_match uuid, p_games jsonb, p_reason text, p_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.club_matches;
  game jsonb;
  a numeric;
  b numeric;
  a_wins integer := 0;
  b_wins integer := 0;
  target integer;
  need integer;
  golden boolean;
  corrected_winner text;
  reason text := trim(coalesce(p_reason, ''));
begin
  select * into m from public.club_matches where id = p_match;
  if auth.uid() is null or m.id is null or m.tournament_id is null
    or not (public.is_staff(m.club_id) or public.is_platform_admin())
  then raise exception 'Only authorised organisers can correct this match'; end if;
  perform pg_advisory_xact_lock(hashtextextended(m.division_id::text, 7));
  select * into m from public.club_matches where id = p_match for update;
  if m.id is null or m.status <> 'done' or m.updated_at is distinct from p_updated_at then
    raise exception 'This result changed. Reload before correcting it.';
  end if;
  if char_length(reason) not between 3 and 300 then raise exception 'Enter a reason of 3 to 300 characters'; end if;
  if cardinality(m.side_a) = 0 or cardinality(m.side_b) = 0 then raise exception 'A bye cannot be corrected'; end if;
  if public.score_problem(p_games) is not null then raise exception 'Enter valid game scores'; end if;
  target := (m.format->>'pointsTo')::integer;
  need := (m.format->>'bestOf')::integer / 2 + 1;
  golden := coalesce((m.format->>'golden')::boolean, false);
  for game in select value from jsonb_array_elements(p_games) loop
    a := (game->>'a')::numeric;
    b := (game->>'b')::numeric;
    if a_wins >= need or b_wins >= need or a = b or a <> trunc(a) or b <> trunc(b)
      or greatest(a,b) <> (case when golden then target else greatest(target, least(a,b) + 2) end)
      or coalesce(game->>'points','') <> '' then raise exception 'Enter a complete legal score for each game'; end if;
    if a > b then a_wins := a_wins + 1; else b_wins := b_wins + 1; end if;
  end loop;
  if a_wins < need and b_wins < need then raise exception 'Enter enough games to decide the match'; end if;
  corrected_winner := case when a_wins >= need then 'A' else 'B' end;
  if m.stage = 'pool' and exists (select 1 from public.divisions d where d.id = m.division_id and d.advance > 0) and not exists (
    select 1 from public.club_matches k where k.division_id = m.division_id and k.stage = 'pool' and k.status in ('scheduled','live')
  ) then raise exception 'Pool play is complete. The knockout draw may already be in progress.'; end if;
  if m.stage = 'pool' and exists (
    select 1 from public.club_matches k where k.division_id = m.division_id and k.stage not in ('pool','friendly') and k.status <> 'void'
  ) then raise exception 'The knockout draw exists. Pool results are locked.';
  end if;
  if m.stage not in ('pool','friendly') and corrected_winner is distinct from m.winner then
    raise exception 'A knockout winner cannot change through score correction';
  end if;
  insert into public.club_score_corrections(match_id,club_id,corrected_by,reason,old_games,new_games,old_winner,new_winner)
    values(m.id,m.club_id,auth.uid(),reason,m.games,p_games,m.winner,corrected_winner);
  perform set_config('paddleq.correcting_match', m.id::text, true);
  update public.club_matches set games=p_games, winner=corrected_winner, updated_at=clock_timestamp(), updated_by=auth.uid() where id=m.id;
  perform set_config('paddleq.correcting_match', '', true);
end $$;
revoke execute on function public.correct_club_match(uuid,jsonb,text,timestamptz) from public, anon;
grant execute on function public.correct_club_match(uuid,jsonb,text,timestamptz) to authenticated;

create function public.guard_completed_club_score() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'done' and old.tournament_id is not null and
    (new.games is distinct from old.games or new.winner is distinct from old.winner or new.status is distinct from old.status)
    and (current_user in ('authenticated','anon') or current_setting('paddleq.correcting_match',true) is distinct from old.id::text)
  then raise exception 'Use the audited correction option for completed matches'; end if;
  return new;
end $$;
create trigger club_matches_guard_completed_score before update on public.club_matches
for each row execute function public.guard_completed_club_score();
revoke execute on function public.guard_completed_club_score() from public, anon, authenticated;
