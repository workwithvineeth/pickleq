-- Club mode part 4: the three functions that delete rows (used invite, leaving a club, turning sharing off).
-- Grant any pending roles for the signed-in email (and link roster entries). Safe to call on every sign-in.
create function public.claim_pending() returns int
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  my_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  c record;
  n int := 0;
begin
  if me is null or my_email = '' then return 0; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  for c in select * from public.club_claims where lower(email) = my_email loop
    insert into public.club_members (club_id, user_id, role) values (c.club_id, me, c.role)
      on conflict (club_id, user_id) do update set role = excluded.role;
    if c.player_id is not null then
      update public.club_players set user_id = me where id = c.player_id and user_id is null;
    end if;
    delete from public.club_claims where club_id = c.club_id and email = c.email;
    n := n + 1;
  end loop;
  return n;
end $$;
-- A player decides what their club may see. Only the linked player can call this for their own roster entry.
create function public.set_my_sharing(pid uuid, choice jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.club_players set share = jsonb_build_object(
      'record', coalesce((choice ->> 'record')::boolean, false),
      'tags', coalesce((choice ->> 'tags')::boolean, false),
      'training', coalesce((choice ->> 'training')::boolean, false))
    where id = pid and user_id = (select auth.uid());
  if not found then raise exception 'You can only change your own sharing'; end if;
  if not (coalesce((choice ->> 'record')::boolean, false) or coalesce((choice ->> 'tags')::boolean, false) or coalesce((choice ->> 'training')::boolean, false)) then
    delete from public.shared_summaries where player_id = pid;
  end if;
end $$;
-- Leave a club: removes your membership, unlinks your roster entry and deletes anything you shared.
create function public.leave_club(cid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if public.club_role(cid) = 'owner' then raise exception 'The owner can''t leave. Hand over the club or delete it.'; end if;
  delete from public.shared_summaries s using public.club_players p where s.player_id = p.id and p.club_id = cid and p.user_id = me;
  update public.club_players set user_id = null, share = '{}'::jsonb where club_id = cid and user_id = me;
  delete from public.club_members where club_id = cid and user_id = me;
end $$;

grant execute on function public.claim_pending(), public.set_my_sharing(uuid, jsonb), public.leave_club(uuid) to authenticated;
revoke execute on function public.claim_pending(), public.set_my_sharing(uuid, jsonb), public.leave_club(uuid) from public, anon;
