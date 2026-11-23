-- Check the real Realtime outbox in Supabase and use a rollback-only stand-in on the local shim.
begin;
create temp table out (step int, result text) on commit drop;

do $$
declare
  stub boolean := to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null;
  c uuid := (select id from public.clubs where name = 'Pickleyard');
  t uuid;
  d uuid;
  m uuid;
  slug constant text := 'live-score-rollback';
  topic_name constant text := 'live:' || slug;
  score_games constant jsonb := '[{"a":2,"b":1,"rallies":"ABA","serve":"A","mode":"rally","points":"ABA","notes":"private"}]';
  expected_games constant jsonb := '[{"a":2,"b":1,"rallies":"ABA","serve":"A","mode":"rally"}]';
  sent jsonb;
  messages integer;
begin
  if stub then
    create schema if not exists realtime;
    create table realtime.messages (topic text, event text, payload jsonb, private boolean);
    execute $stub$
      create function realtime.send(jsonb, text, text, boolean) returns void language sql as $send$
        insert into realtime.messages (topic, event, payload, private) values ($3, $2, $1, $4)
      $send$
    $stub$;
  end if;

  insert into public.tournaments (club_id, name, start_date, status, approval, is_public, public_slug)
    values (c, 'Live Score Rollback', current_date, 'live', 'approved', true, slug) returning id into t;
  insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance)
    values (t, c, 'Live Doubles', 'doubles', '{"bestOf":1,"pointsTo":11}', 1, 0) returning id into d;
  insert into public.club_matches (club_id, tournament_id, division_id, stage, format, status, court, slot)
    values (c, t, d, 'pool', '{"bestOf":1,"pointsTo":11}', 'live', 2, 0) returning id into m;

  select count(*) into messages from realtime.messages where payload ->> 'id' = m::text;
  insert into out values (1, case when messages = 1 and exists (
    select 1 from realtime.messages where topic = topic_name and event = 'score' and private = false
      and payload ->> 'id' = m::text and payload -> 'games' = '[]'::jsonb
  ) then 'new public matches are broadcast' else 'FAIL public match insert' end);

  update public.club_matches set games = score_games where id = m;
  select count(*) into messages from realtime.messages where payload ->> 'id' = m::text;
  select payload into sent from realtime.messages where topic = topic_name and event = 'score' and private = false
    and payload ->> 'id' = m::text and payload -> 'games' = expected_games;
  insert into out values (2, case when messages = 2 and sent is not null
    then 'one public score update on the expected topic' else 'FAIL score update was missing or duplicated' end);
  insert into out values (3, case when jsonb_typeof(sent -> 'at') = 'number' and sent - 'at' = jsonb_build_object(
    'id', m, 'court', 2, 'slot', 0, 'status', 'live', 'winner', null, 'entryA', null, 'entryB', null, 'games', expected_games
  ) then 'only the public fields are sent' else 'FAIL unexpected payload fields or values' end);

  update public.club_matches set updated_at = clock_timestamp() where id = m;
  insert into out values (4, case when (select count(*) from realtime.messages where payload ->> 'id' = m::text) = messages
    then 'unrelated updates do not broadcast' else 'FAIL unrelated update broadcast' end);

  update public.tournaments set is_public = false where id = t;
  update public.club_matches set games = '[{"a":3,"b":1}]' where id = m;
  insert into out values (5, case when (select count(*) from realtime.messages where payload ->> 'id' = m::text) = messages
    then 'private scores stay private' else 'FAIL private score broadcast' end);

  update public.tournaments set is_public = true, approval = 'draft' where id = t;
  -- The normal approval guard rejects this write. Exercise the broadcast guard independently.
  alter table public.club_matches disable trigger club_matches_guard_approval;
  update public.club_matches set games = '[{"a":4,"b":1}]' where id = m;
  alter table public.club_matches enable trigger club_matches_guard_approval;
  insert into out values (6, case when (select count(*) from realtime.messages where payload ->> 'id' = m::text) = messages
    then 'unapproved scores stay private' else 'FAIL unapproved score broadcast' end);

  if stub then
    execute $stub$
      create or replace function realtime.send(jsonb, text, text, boolean) returns void language plpgsql as $send$
      begin
        raise exception 'Realtime is unavailable';
      end
      $send$
    $stub$;
    update public.tournaments set approval = 'approved' where id = t;
    update public.club_matches set games = '[{"a":5,"b":1}]' where id = m;
    insert into out values (7, case when (select games from public.club_matches where id = m) = '[{"a":5,"b":1}]'::jsonb
      then 'the score saves when Realtime raises' else 'FAIL broadcast failure blocked the save' end);
  end if;

  insert into out values (8, case when not has_function_privilege('anon', 'public.live_score_broadcast()', 'execute')
    and not has_function_privilege('authenticated', 'public.live_score_broadcast()', 'execute')
    then 'client roles cannot call the trigger function' else 'FAIL trigger function is executable by a client role' end);
end $$;

select step, result from out order by step;
rollback;
