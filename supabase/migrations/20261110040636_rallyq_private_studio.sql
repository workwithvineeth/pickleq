-- RallyQ My Player Studio. Self-logged rows never enter tournament ratings or ranking.
-- `player` is the account owner, not a transferable club roster row.
create table public.practice_sessions (
 id uuid primary key default gen_random_uuid(),
 player uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check (kind in ('practice_match','drill','training')),
 score_text text not null default '' check(char_length(score_text)<=160),
 minutes integer check(minutes between 1 and 600),
 focus_tags text[] not null default '{}' check(cardinality(focus_tags)<=12 and char_length(array_to_string(focus_tags,','))<=500),
 feel integer check(feel between 1 and 5),
 played_at date not null default current_date check(played_at<='2100-12-31'),
 partner text check(char_length(partner)<=120),
 opponents text check(char_length(opponents)<=240),
 created_at timestamptz not null default now(),
 check ((kind='practice_match' and char_length(trim(score_text))>0) or (kind in ('drill','training') and minutes is not null))
);
create index practice_sessions_player_date_idx on public.practice_sessions(player,played_at desc);
create table public.player_goals (
 id uuid primary key default gen_random_uuid(),
 player uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(char_length(trim(title)) between 1 and 160),
 target numeric not null check(target>0 and target<=1000000),
 progress numeric not null default 0 check(progress>=0 and progress<=1000000),
 due date,
 created_at timestamptz not null default now()
);
create index player_goals_player_due_idx on public.player_goals(player,due);
create table public.profile_sharing (
 player uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 practice_results boolean not null default false,
 practice_vs_tournament boolean not null default false,
 training_hours boolean not null default false,
 coach_notes boolean not null default false,
 goals_badges boolean not null default false,
 -- A deliberate snapshot of the existing Studio notes, published only when coach_notes is true.
 coach_notes_text text[] not null default '{}' check(cardinality(coach_notes_text)<=8 and char_length(array_to_string(coach_notes_text,''))<=5000),
 updated_at timestamptz not null default now()
);

alter table public.practice_sessions enable row level security;
alter table public.player_goals enable row level security;
alter table public.profile_sharing enable row level security;
revoke all on public.practice_sessions,public.player_goals,public.profile_sharing from public,anon,authenticated;
grant select,insert,update,delete on public.practice_sessions,public.player_goals,public.profile_sharing to authenticated;
create policy "practice owner read" on public.practice_sessions for select to authenticated using(player=(select auth.uid()));
create policy "practice owner insert" on public.practice_sessions for insert to authenticated with check(player=(select auth.uid()));
create policy "practice owner update" on public.practice_sessions for update to authenticated using(player=(select auth.uid())) with check(player=(select auth.uid()));
create policy "practice owner delete" on public.practice_sessions for delete to authenticated using(player=(select auth.uid()));
create policy "goal owner read" on public.player_goals for select to authenticated using(player=(select auth.uid()));
create policy "goal owner insert" on public.player_goals for insert to authenticated with check(player=(select auth.uid()));
create policy "goal owner update" on public.player_goals for update to authenticated using(player=(select auth.uid())) with check(player=(select auth.uid()));
create policy "goal owner delete" on public.player_goals for delete to authenticated using(player=(select auth.uid()));
create policy "sharing owner read" on public.profile_sharing for select to authenticated using(player=(select auth.uid()));
create policy "sharing owner insert" on public.profile_sharing for insert to authenticated with check(player=(select auth.uid()));
create policy "sharing owner update" on public.profile_sharing for update to authenticated using(player=(select auth.uid())) with check(player=(select auth.uid()));
create policy "sharing owner delete" on public.profile_sharing for delete to authenticated using(player=(select auth.uid()));

-- The sole public projection. It needs definer access because raw roster/diary tables remain private.
-- Fixed search_path, explicit grants, approved/public tournament guard, no accounts/phones/emails/claim keys.
-- Private content is joined to the CURRENT claim owner, so a later claimant cannot inherit prior consent.
create function public.rallyq_public_player(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.club_players; c public.clubs; consent public.profile_sharing; history jsonb; shared jsonb:='{}';
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
   and exists(select 1 from jsonb_array_elements(m.games) g where coalesce(g->>'points','') ~ '^[AB]+$')
 ) h;
 if jsonb_array_length(history)=0 then return null; end if;
 select * into consent from public.profile_sharing where player=p.user_id;
 if consent.practice_results then
  shared:=shared||jsonb_build_object('practice_results',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'score_text',score_text,'minutes',minutes,'played_at',played_at) order by played_at desc),'[]') from public.practice_sessions where player=p.user_id));
 end if;
 if consent.training_hours then
  shared:=shared||jsonb_build_object('training_hours',(select round(coalesce(sum(minutes),0)::numeric/60,1) from public.practice_sessions where player=p.user_id and kind in ('drill','training')));
 end if;
 if consent.practice_vs_tournament then
  shared:=shared||jsonb_build_object('practice_vs_tournament',jsonb_build_object('official',jsonb_array_length(history),'practice',(select count(*) from public.practice_sessions where player=p.user_id and kind='practice_match')));
 end if;
 if consent.coach_notes then shared:=shared||jsonb_build_object('coach_notes',to_jsonb(consent.coach_notes_text)); end if;
 if consent.goals_badges then
  shared:=shared||jsonb_build_object('goals_badges',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'target',target,'progress',progress,'due',due) order by created_at),'[]') from public.player_goals where player=p.user_id));
 end if;
 return jsonb_build_object('player_id',p.id,'name',p.name,'club',c.name,'city',c.city,
  'dupr_singles',p.dupr_singles,'dupr_doubles',p.dupr_doubles,'official',history,'shared',shared);
end $$;
revoke all on function public.rallyq_public_player(uuid) from public,anon,authenticated;
grant execute on function public.rallyq_public_player(uuid) to anon,authenticated;
