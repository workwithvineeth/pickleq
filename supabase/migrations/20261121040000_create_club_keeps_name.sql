-- Creating a club no longer renames your account (audit 21 Nov 2026, B4).
-- Before: "Your name" on the Create club form overwrote profiles.display_name every time, so an admin who created a
-- club for someone else (or typed a nickname) silently renamed their own account everywhere. Now it only fills an
-- empty name; the club's own roster row still uses what was typed.
create or replace function public.create_club(club_name text, club_city text, my_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  cid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  insert into public.profiles (id, display_name) values (me, coalesce(trim(my_name), ''))
    on conflict (id) do update set display_name =
      case when coalesce(public.profiles.display_name, '') = '' then excluded.display_name else public.profiles.display_name end;
  insert into public.clubs (name, city, created_by) values (club_name, nullif(trim(club_city), ''), me) returning id into cid;
  insert into public.club_members (club_id, user_id, role) values (cid, me, 'owner');
  insert into public.club_players (club_id, name, user_id) values (cid, coalesce(nullif(trim(my_name), ''), 'Me'), me);
  return cid;
end $$;
revoke execute on function public.create_club(text, text, text) from public, anon;
grant execute on function public.create_club(text, text, text) to authenticated;
