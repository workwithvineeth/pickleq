-- Check the stream RPCs with the same database roles and JWT claims as their callers.
begin;

create temp table results (step text, result text) on commit drop;
grant insert on results to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000301', 'stream-owner@example.test'),
  ('00000000-0000-4000-8000-000000000302', 'stream-admin@example.test'),
  ('00000000-0000-4000-8000-000000000303', 'stream-coach@example.test'),
  ('00000000-0000-4000-8000-000000000304', 'stream-outsider@example.test');

insert into public.club_members (club_id, user_id, role)
select id, member.user_id, member.role
from public.clubs
cross join (values
  ('00000000-0000-4000-8000-000000000301'::uuid, 'owner'),
  ('00000000-0000-4000-8000-000000000302'::uuid, 'admin'),
  ('00000000-0000-4000-8000-000000000303'::uuid, 'coach')
) member(user_id, role)
where name = 'Pickleyard';

insert into public.tournaments (id, club_id, name, start_date, status, approval, is_public, public_slug)
select event.id, c.id, 'Stream Rollback', current_date, 'live', event.approval, event.is_public, event.slug
from public.clubs c
cross join (values
  ('00000000-0000-4000-8000-000000000311'::uuid, 'approved', true, 'stream-check-public'),
  ('00000000-0000-4000-8000-000000000312'::uuid, 'approved', false, 'stream-check-private'),
  ('00000000-0000-4000-8000-000000000313'::uuid, 'submitted', true, 'stream-check-pending')
) event(id, approval, is_public, slug)
where c.name = 'Pickleyard';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}';

do $$
declare
  t constant uuid := '00000000-0000-4000-8000-000000000311';
  s public.court_streams;
begin
  s := public.set_court_stream(t, 1, 'Ab3dEfG_h-1');
  insert into results values ('owner sets a hidden link', case when s.court = 1 and not s.visible
    and s.created_by = auth.uid() and s.status = 'unknown' then 'OK' else 'FAIL' end);
  perform public.set_court_stream(t, 2, 'Ab3dEfG_h-1');
  s := public.set_court_stream_visible(t, 1, true);
  insert into results values ('owner shows a link', case when s.visible then 'OK' else 'FAIL' end);
  s := public.set_court_stream(t, 1, 'Ab3dEfG_h-2');
  insert into results values ('replacing keeps visibility', case when s.visible and s.video_id = 'Ab3dEfG_h-2' then 'OK' else 'FAIL' end);
  insert into results values ('owner can see hidden rows', case when (select count(*) from public.court_streams_for(t)) = 2 then 'OK' else 'FAIL' end);

  begin
    perform public.set_court_stream(t, 1, 'invalid');
    insert into results values ('invalid video ID refused', 'FAIL');
  exception when invalid_parameter_value then
    insert into results values ('invalid video ID refused', 'OK');
  end;
  begin
    perform public.set_court_stream(t, 65, 'Ab3dEfG_h-1');
    insert into results values ('out-of-range court refused', 'FAIL');
  exception when invalid_parameter_value then
    insert into results values ('out-of-range court refused', 'OK');
  end;

  perform public.set_court_stream('00000000-0000-4000-8000-000000000312', 1, 'Ab3dEfG_h-1');
  perform public.set_court_stream_visible('00000000-0000-4000-8000-000000000312', 1, true);
  perform public.set_court_stream('00000000-0000-4000-8000-000000000313', 1, 'Ab3dEfG_h-1');
  perform public.set_court_stream_visible('00000000-0000-4000-8000-000000000313', 1, true);
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}';
insert into results values ('club admin can read', case when (
  select count(*) from public.court_streams_for('00000000-0000-4000-8000-000000000311')
) = 2 then 'OK' else 'FAIL' end);

set local request.jwt.claims = '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}';
-- The seeded platform admin is also the owner of Pickleyard, so test platform access after removing that membership.
reset role;
delete from public.club_members where club_id = (select id from public.clubs where name = 'Pickleyard')
  and user_id = '81b32feb-1a70-47c3-b0b4-9eb4a81a12dd';
set local role authenticated;
insert into results values ('platform admin can read without membership', case when (
  select count(*) from public.court_streams_for('00000000-0000-4000-8000-000000000311')
) = 2 then 'OK' else 'FAIL' end);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

insert into results select 'anon receives only the visible row and public columns',
  case when jsonb_agg(to_jsonb(s)) = '[{"court":1,"video_id":"Ab3dEfG_h-2","status":"unknown","embeddable":null,"checked_at":null}]'
  then 'OK' else 'FAIL' end
from public.public_court_streams('stream-check-public') s;
insert into results values ('anon sees no private or unapproved links', case when
  not exists (select from public.public_court_streams('stream-check-private'))
  and not exists (select from public.public_court_streams('stream-check-pending'))
  then 'OK' else 'FAIL' end);

do $$
declare
  role_under_test text;
  command text;
  target constant text := '''00000000-0000-4000-8000-000000000311''';
begin
  foreach role_under_test in array array['anon', 'outsider', 'coach'] loop
    if role_under_test <> 'anon' then
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', jsonb_build_object(
        'role', 'authenticated', 'sub', case when role_under_test = 'outsider'
        then '00000000-0000-4000-8000-000000000304' else '00000000-0000-4000-8000-000000000303' end
      )::text, true);
    end if;
    foreach command in array array[
      'select public.set_court_stream(' || target || ', 1, ''Ab3dEfG_h-1'')',
      'select public.set_court_stream_visible(' || target || ', 1, false)',
      'select public.clear_court_stream(' || target || ', 1)',
      'select public.court_streams_for(' || target || ')',
      'select public.require_court_stream_organiser(' || target || ')',
      'select * from public.court_streams'
    ] loop
      begin
        execute command;
        insert into results values (role_under_test || ' blocked: ' || command, 'FAIL');
      exception when insufficient_privilege then
        insert into results values (role_under_test || ' blocked: ' || command, 'OK');
      end;
    end loop;
  end loop;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}';

do $$
declare t constant uuid := '00000000-0000-4000-8000-000000000311';
begin
  perform public.set_court_stream_visible(t, 1, false);
  insert into results values ('owner hides a link', case when
    not exists (select from public.public_court_streams('stream-check-public')) then 'OK' else 'FAIL' end);
  perform public.clear_court_stream(t, 1);
  insert into results values ('owner clears a link', case when
    not exists (select from public.court_streams_for(t) where court = 1) then 'OK' else 'FAIL' end);
end $$;

reset role;
select step, result from results order by step;
rollback;
