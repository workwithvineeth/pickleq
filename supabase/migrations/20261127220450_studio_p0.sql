-- The diary remains owner-only. Fields for the new session types are optional on older rows.
alter table public.practice_sessions
  drop constraint practice_sessions_kind_check,
  drop constraint practice_sessions_check,
  add column venue text check (char_length(venue) <= 120),
  add column game_count integer,
  add column game_wins integer,
  add constraint practice_sessions_kind_check check (kind in ('practice_match', 'drill', 'training', 'casual')),
  add constraint practice_sessions_content_check check (
    (kind = 'practice_match' and char_length(trim(score_text)) > 0)
    or (kind in ('drill', 'training') and minutes is not null)
    or (kind = 'casual' and game_count is not null and game_wins is not null
      and game_count between 1 and 999 and game_wins between 0 and game_count)
  );

-- An explicitly shared copy goes here. Existing private covers stay in their owner-only bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-public-covers', 'player-public-covers', true, 1048576, array['image/jpeg']);

create policy "players upload their public cover" on storage.objects for insert to authenticated
  with check (bucket_id = 'player-public-covers' and name = (select auth.uid())::text || '/cover.jpg');
create policy "players see their public cover object" on storage.objects for select to authenticated
  using (bucket_id = 'player-public-covers' and name = (select auth.uid())::text || '/cover.jpg');
create policy "players replace their public cover" on storage.objects for update to authenticated
  using (bucket_id = 'player-public-covers' and name = (select auth.uid())::text || '/cover.jpg')
  with check (bucket_id = 'player-public-covers' and name = (select auth.uid())::text || '/cover.jpg');
create policy "players remove their public cover" on storage.objects for delete to authenticated
  using (bucket_id = 'player-public-covers' and name = (select auth.uid())::text || '/cover.jpg');

create or replace function public.rallyq_public_player(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.club_players; c public.clubs; consent public.profile_sharing; history jsonb; active_events jsonb; cover text; shared jsonb:='{}';
begin
 select * into p from public.club_players where id=p_player;
 if not found then return null; end if;
 select * into c from public.clubs where id=p.club_id;
 select coalesce(jsonb_agg(row order by row->>'played_on' desc,row->>'id'),'[]') into history from (
  select jsonb_build_object('id',m.id,'club',c.name,'tournament',t.name,'tournament_id',t.id,
   'division',d.name,'kind',d.kind,'stage',m.stage,'played_on',coalesce(m.played_on,t.start_date),
   'format',m.format,'games',m.games,'winner',m.winner,'my_side',case when p.id=any(m.side_a) then 'A' else 'B' end,'me',p.id,
   'side_a',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) order by array_position(m.side_a,x.id)),'[]') from public.club_players x where x.id=any(m.side_a)),
   'side_b',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) order by array_position(m.side_b,x.id)),'[]') from public.club_players x where x.id=any(m.side_b))) row
  from public.club_matches m join public.tournaments t on t.id=m.tournament_id left join public.divisions d on d.id=m.division_id
  where m.club_id=p.club_id and (p.id=any(m.side_a) or p.id=any(m.side_b))
   and t.is_public and t.approval='approved' and t.cancelled_at is null and m.status='done' and m.winner is not null
   and cardinality(m.side_a)>0 and cardinality(m.side_b)>0
   and exists(select 1 from jsonb_array_elements(m.games) g
     where coalesce(g->>'rallies', g->>'points', '') ~ '^[AB]+$')
 ) h;
 -- Match IDs stay tied to this roster entry even when two players share a name.
 select coalesce(jsonb_agg(to_jsonb(e)), '[]') into active_events from (
   select t.public_slug as slug, jsonb_agg(m.id) as match_ids
   from public.club_matches m join public.tournaments t on t.id = m.tournament_id
   where m.club_id = p.club_id and (p.id = any(m.side_a) or p.id = any(m.side_b))
     and t.status = 'live' and t.is_public and t.approval = 'approved' and t.cancelled_at is null
     and t.public_slug is not null and m.status in ('scheduled', 'live')
   group by t.public_slug
 ) e;
 if jsonb_array_length(history) = 0 and jsonb_array_length(active_events) = 0 then return null; end if;

 select o.name into cover from storage.objects o
 where o.bucket_id = 'player-public-covers' and o.name = p.user_id::text || '/cover.jpg';

 select * into consent from public.profile_sharing where player=p.user_id;
 if consent.training_hours then
  shared:=shared||jsonb_build_object('training_hours',(select round(coalesce(sum(minutes),0)::numeric/60,1) from public.practice_sessions where player=p.user_id and kind in ('drill','training')));
 end if;
 if consent.coach_notes then shared:=shared||jsonb_build_object('coach_notes',to_jsonb(consent.coach_notes_text)); end if;
 if consent.goals_badges then
  shared:=shared||jsonb_build_object('goals_badges',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'target',target,'progress',progress,'due',due) order by created_at),'[]') from public.player_goals where player=p.user_id));
 end if;
 return jsonb_build_object('player_id',p.id,'name',p.name,'club',c.name,'city',c.city,
  'dupr_singles',p.dupr_singles,'dupr_doubles',p.dupr_doubles,'official',history,'live_events',active_events,'cover_path',cover,'shared',shared);
end $$;
revoke all on function public.rallyq_public_player(uuid) from public,anon,authenticated;
grant execute on function public.rallyq_public_player(uuid) to anon,authenticated;
