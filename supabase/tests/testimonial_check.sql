-- Testimonials check (club_mode_23): owner/admins only, consent required, clubs see only their own,
-- PaddleQ admins approve/hide/feature, no phones or emails, withdraw clears it. Rolls back; problems raise "FAIL: …".
begin;

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-8000-0000000000b1', 'tm-owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000b2', 'tm-coach@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-0000000000b3', 'tm-other@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into auth.users (id, email, aud, role, instance_id)
values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') on conflict (id) do nothing;
insert into public.platform_admins (user_id) values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd') on conflict do nothing;

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, anon;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
insert into ids values ('other', public.create_club('Other Club', 'Goa', 'Olu'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
insert into ids values ('club', public.create_club('Story Club', 'Pune', 'Sana'));
reset role;
insert into public.club_members (club_id, user_id, role) values (pg_temp.id('club'), '00000000-0000-4000-8000-0000000000b2', 'coach');
-- Phase 3: only clubs with a finished tournament can share a testimonial.
insert into public.tournaments (club_id, name, start_date, status, approval) values (pg_temp.id('club'), 'Story Open', current_date - 1, 'done', 'approved');
do $$ begin
  begin
    insert into public.club_testimonials (club_id, rating, quote, person_name, person_role, consent) values (pg_temp.id('other'), 5, 'We have not hosted anything yet at all.', 'Olu', 'Owner', true);
    raise exception 'FAIL: a club with no finished tournament shared a testimonial';
  exception when others then
    if sqlerrm <> 'Share your experience after your first finished tournament' then raise; end if;
  end;
end $$;
set local role authenticated;

do $$
declare r jsonb; failed boolean;
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
  r := public.submit_testimonial(pg_temp.id('club'), 5, 'PaddleQ ran our whole Diwali event without a single hitch.', 'Sana', 'Owner, Story Club', null, false);
  if r ->> 'error' is null then raise exception 'FAIL: saved without the permission tick'; end if;
  r := public.submit_testimonial(pg_temp.id('club'), 6, 'PaddleQ ran our whole Diwali event without a single hitch.', 'Sana', 'Owner, Story Club', null, true);
  if r ->> 'error' is null then raise exception 'FAIL: rating 6 accepted'; end if;
  r := public.submit_testimonial(pg_temp.id('club'), 5, repeat('a', 401), 'Sana', 'Owner', null, true);
  if r ->> 'error' is null then raise exception 'FAIL: 401 characters accepted'; end if;
  r := public.submit_testimonial(pg_temp.id('club'), 5, 'Call me on 98765 43210 any time, great app!', 'Sana', 'Owner', null, true);
  if r ->> 'error' is null then raise exception 'FAIL: phone number accepted'; end if;
  r := public.submit_testimonial(pg_temp.id('club'), 5, 'Write to sana@example.com, great app for clubs!', 'Sana', 'Owner', null, true);
  if r ->> 'error' is null then raise exception 'FAIL: email accepted'; end if;
  r := public.submit_testimonial(pg_temp.id('club'), 5, 'Great app for our club, all good.', 'Sana', 'Owner', pg_temp.id('other')::text || '/x.jpg', true);
  if r ->> 'error' is null then raise exception 'FAIL: another club''s photo path accepted'; end if;
  r := public.submit_testimonial(pg_temp.id('club'), 5, 'PaddleQ ran our whole Diwali event without a single hitch.', 'Sana', 'Owner, Story Club', pg_temp.id('club')::text || '/a.jpg', true);
  if r ->> 'ok' is null then raise exception 'FAIL: a valid testimonial was refused: %', r; end if;
  insert into ids values ('tm', (r ->> 'id')::uuid);
  if (select status from public.club_testimonials where id = pg_temp.id('tm')) <> 'pending' then raise exception 'FAIL: not pending'; end if;
  failed := false; begin update public.club_testimonials set status = 'approved' where id = pg_temp.id('tm'); exception when insufficient_privilege then failed := true; end;
  if not failed and (select status from public.club_testimonials where id = pg_temp.id('tm')) = 'approved' then raise exception 'FAIL: the club approved its own testimonial'; end if;
  if public.admin_set_testimonial(pg_temp.id('tm'), 'approved', true) ->> 'error' is null then raise exception 'FAIL: an organiser used the admin function'; end if;
  if public.admin_testimonials() ->> 'error' is null then raise exception 'FAIL: an organiser read every club''s testimonials'; end if;

  -- A coach can't add one or see them; another club can't see them.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000b2');
  if public.submit_testimonial(pg_temp.id('club'), 4, 'Coaches like it too, really easy to use.', 'Cal', 'Coach', null, true) ->> 'error' is null then raise exception 'FAIL: a coach added a testimonial'; end if;
  if exists (select 1 from public.club_testimonials) then raise exception 'FAIL: a coach sees testimonials'; end if;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000b3');
  if exists (select 1 from public.club_testimonials) then raise exception 'FAIL: another club sees them'; end if;
  if public.withdraw_testimonial(pg_temp.id('tm')) ->> 'error' is null then raise exception 'FAIL: another club withdrew it'; end if;

  -- PaddleQ: sees it with no emails or phones; feature needs approval; approve + feature; hide clears feature.
  perform pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
  r := public.admin_testimonials();
  if r::text not like '%without a single hitch%' then raise exception 'FAIL: the admin can''t see it'; end if;
  if r::text ~* '@|example\.test' then raise exception 'FAIL: the admin list shows an email: %', r; end if;
  if public.admin_set_testimonial(pg_temp.id('tm'), 'hidden', true) ->> 'error' is null then raise exception 'FAIL: featured a hidden one'; end if;
  if public.admin_set_testimonial(pg_temp.id('tm'), 'approved', true) ->> 'ok' is null then raise exception 'FAIL: approve + feature'; end if;
  if public.admin_set_testimonial(pg_temp.id('tm'), 'hidden', false) ->> 'ok' is null then raise exception 'FAIL: hide'; end if;
  if (select featured from public.club_testimonials where id = pg_temp.id('tm')) then raise exception 'FAIL: hidden but still featured'; end if;

  -- The club sees the status, then withdraws: words and photo cleared, gone from the admin list.
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
  if (select status from public.club_testimonials where id = pg_temp.id('tm')) <> 'hidden' then raise exception 'FAIL: the club doesn''t see the status'; end if;
  r := public.withdraw_testimonial(pg_temp.id('tm'));
  if r ->> 'photo' <> pg_temp.id('club')::text || '/a.jpg' then raise exception 'FAIL: withdraw: %', r; end if;
  if exists (select 1 from public.club_testimonials where id = pg_temp.id('tm') and (status <> 'withdrawn' or quote <> '' or photo_path is not null)) then
    raise exception 'FAIL: withdrawn testimonial still has its words or photo';
  end if;
  perform pg_temp.as_user('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd');
  if public.admin_testimonials()::text like '%without a single hitch%' then raise exception 'FAIL: withdrawn one still listed'; end if;
end $$;

-- Visitors can't read testimonials or call the functions.
reset role;
set local role anon;
do $$
declare failed boolean := false;
begin
  begin perform 1 from public.club_testimonials; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL: visitors can read testimonials'; end if;
  failed := false;
  begin perform public.admin_testimonials(); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL: visitors can call admin_testimonials'; end if;
end $$;

reset role;
select 'All testimonial checks passed' as result;
rollback;
