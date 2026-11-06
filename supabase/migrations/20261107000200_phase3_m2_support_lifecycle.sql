-- Phase 3 · Module 2: PaddleQ admin support sessions, a platform audit log, and the tournament lifecycle
-- (delete before anyone has entered; cancel after; archive when finished or cancelled).

-- 1) Platform audit log: every privileged action by PaddleQ admins (and lifecycle actions by clubs).
create table if not exists public.platform_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  action text not null check (char_length(action) <= 80),
  club_id uuid,
  tournament_id uuid,
  detail text not null default '' check (char_length(detail) <= 500)
);
create index if not exists platform_audit_at_idx on public.platform_audit (at desc);
alter table public.platform_audit enable row level security;
revoke all on public.platform_audit from public, anon, authenticated;
grant select on public.platform_audit to authenticated;
create policy "PaddleQ admins read the audit log" on public.platform_audit for select to authenticated using (public.is_platform_admin());

create or replace function public.audit(p_action text, p_club uuid, p_tournament uuid, p_detail text) returns void
language sql security definer set search_path = '' as $$
  insert into public.platform_audit (action, club_id, tournament_id, detail) values (p_action, p_club, p_tournament, left(coalesce(p_detail, ''), 500))
$$;
revoke execute on function public.audit(text, uuid, uuid, text) from public, anon, authenticated;

-- 2) Support sessions: a PaddleQ admin joins a club as a time-limited admin, with a reason, logged.
--    Every existing club permission (RLS) then applies as for the club's own admins; nothing bypasses RLS.
alter table public.club_members add column if not exists support_until timestamptz;
comment on column public.club_members.support_until is 'Set for PaddleQ support sessions: the membership stops counting after this time.';

create or replace function public.club_role(cid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.club_members m
  where m.club_id = cid and m.user_id = (select auth.uid())
    and (m.support_until is null or m.support_until > now())
    and not exists (select 1 from public.club_helpers h where h.user_id = m.user_id)
$$;

create or replace function public.admin_start_support(p_club uuid, p_reason text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare until timestamptz := now() + interval '4 hours'; existing public.club_members;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then raise exception 'Only PaddleQ admins can start a support session'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are opening this club (3+ characters)'; end if;
  if not exists (select 1 from public.clubs where id = p_club) then raise exception 'Club not found'; end if;
  select * into existing from public.club_members where club_id = p_club and user_id = (select auth.uid());
  if existing.user_id is not null and existing.support_until is null then
    perform public.audit('support_open_member', p_club, null, trim(p_reason));
    return null; -- already a real member: nothing to grant
  end if;
  insert into public.club_members (club_id, user_id, role, support_until) values (p_club, (select auth.uid()), 'admin', until)
  on conflict (club_id, user_id) do update set support_until = until, role = 'admin'
    where public.club_members.support_until is not null;
  perform public.audit('support_start', p_club, null, trim(p_reason));
  return until;
end $$;
revoke execute on function public.admin_start_support(uuid, text) from public, anon;
grant execute on function public.admin_start_support(uuid, text) to authenticated;

create or replace function public.admin_end_support(p_club uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.club_members set support_until = now()
  where club_id = p_club and user_id = (select auth.uid()) and support_until is not null and support_until > now();
  if found then perform public.audit('support_end', p_club, null, ''); end if;
end $$;
revoke execute on function public.admin_end_support(uuid) from public, anon;
grant execute on function public.admin_end_support(uuid) to authenticated;

create or replace function public.my_support_sessions() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('clubId', m.club_id, 'club', c.name, 'until', m.support_until) order by m.support_until), '[]'::jsonb)
  from public.club_members m join public.clubs c on c.id = m.club_id
  where m.user_id = (select auth.uid()) and m.support_until > now()
$$;
revoke execute on function public.my_support_sessions() from public, anon;
grant execute on function public.my_support_sessions() to authenticated;

-- Support memberships can't take over a club: they can't be made owner, and owners see them labelled.
create or replace function public.guard_support_member() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.support_until is not null and new.role = 'owner' then raise exception 'A PaddleQ support session can''t own a club'; end if;
  if tg_op = 'UPDATE' and old.support_until is not null and new.support_until is null and current_user in ('authenticated', 'anon') then
    raise exception 'A support session can''t become a normal membership';
  end if;
  return new;
end $$;
revoke execute on function public.guard_support_member() from public, anon, authenticated;
drop trigger if exists club_members_guard_support on public.club_members;
create trigger club_members_guard_support before insert or update on public.club_members
for each row execute function public.guard_support_member();

-- 3) Tournament lifecycle.
alter table public.tournaments add column if not exists cancelled_at timestamptz;
alter table public.tournaments add column if not exists cancel_reason text check (char_length(cancel_reason) <= 300);
alter table public.tournaments add column if not exists archived_at timestamptz;

create or replace function public.tournament_has_people(p_tournament uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.registrations r join public.divisions d on d.id = r.division_id where d.tournament_id = p_tournament)
      or exists (select 1 from public.entries e join public.divisions d on d.id = e.division_id where d.tournament_id = p_tournament)
      or exists (select 1 from public.club_matches m where m.tournament_id = p_tournament and m.status <> 'void')
$$;
revoke execute on function public.tournament_has_people(uuid) from public, anon;
grant execute on function public.tournament_has_people(uuid) to authenticated;

create or replace function public.can_manage_lifecycle(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin(p_club) or public.is_platform_admin()
$$;
revoke execute on function public.can_manage_lifecycle(uuid) from public, anon, authenticated;

-- Delete: only while nobody has registered or entered and no match exists.
create or replace function public.delete_tournament(p_tournament uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.can_manage_lifecycle(t.club_id) then raise exception 'Only the club''s owner and admins (or PaddleQ admins) can delete a tournament'; end if;
  if public.tournament_has_people(p_tournament) then raise exception 'People have entered this tournament. Cancel it instead, so nothing is lost.'; end if;
  if trim(coalesce(p_confirm_name, '')) is distinct from trim(t.name) then raise exception 'Type the tournament name exactly to confirm'; end if;
  perform public.audit('tournament_delete', t.club_id, t.id, t.name);
  delete from public.club_matches where tournament_id = p_tournament;
  delete from public.divisions where tournament_id = p_tournament;
  delete from public.tournaments where id = p_tournament;
end $$;
revoke execute on function public.delete_tournament(uuid, text) from public, anon;
grant execute on function public.delete_tournament(uuid, text) to authenticated;

-- Cancel: keeps entries, payments, scores and history; closes registration, takes it off the board, stops scoring.
create or replace function public.cancel_tournament(p_tournament uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.can_manage_lifecycle(t.club_id) then raise exception 'Only the club''s owner and admins (or PaddleQ admins) can cancel a tournament'; end if;
  if t.status = 'done' then raise exception 'It has finished. Archive it instead.'; end if;
  if t.cancelled_at is not null then raise exception 'It is already cancelled'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 4 then raise exception 'Give players a reason (4+ characters)'; end if;
  update public.tournaments set cancelled_at = now(), cancel_reason = trim(p_reason), registration_open = false, listing = 'none'
  where id = p_tournament;
  perform public.audit('tournament_cancel', t.club_id, t.id, t.name || ' · ' || trim(p_reason));
end $$;
revoke execute on function public.cancel_tournament(uuid, text) from public, anon;
grant execute on function public.cancel_tournament(uuid, text) to authenticated;

create or replace function public.archive_tournament(p_tournament uuid, p_archive boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  select * into t from public.tournaments where id = p_tournament;
  if t.id is null or not public.can_manage_lifecycle(t.club_id) then raise exception 'Only the club''s owner and admins (or PaddleQ admins) can archive a tournament'; end if;
  if p_archive and t.status <> 'done' and t.cancelled_at is null then raise exception 'Only finished or cancelled tournaments can be archived'; end if;
  update public.tournaments set archived_at = case when p_archive then now() else null end, listing = case when p_archive then 'none' else listing end where id = p_tournament;
  perform public.audit(case when p_archive then 'tournament_archive' else 'tournament_unarchive' end, t.club_id, t.id, t.name);
end $$;
revoke execute on function public.archive_tournament(uuid, boolean) from public, anon;
grant execute on function public.archive_tournament(uuid, boolean) to authenticated;

-- A cancelled tournament takes no new scores, matches or registrations.
create or replace function public.guard_cancelled_tournament() returns trigger
language plpgsql set search_path = '' as $$
declare tid uuid;
begin
  if tg_table_name = 'registrations' then
    select d.tournament_id into tid from public.divisions d where d.id = new.division_id;
  else
    tid := new.tournament_id;
  end if;
  if tid is not null and exists (select 1 from public.tournaments where id = tid and cancelled_at is not null) then
    raise exception 'This tournament was cancelled';
  end if;
  return new;
end $$;
revoke execute on function public.guard_cancelled_tournament() from public, anon, authenticated;
drop trigger if exists club_matches_guard_cancelled on public.club_matches;
create trigger club_matches_guard_cancelled before insert or update on public.club_matches
for each row execute function public.guard_cancelled_tournament();
drop trigger if exists registrations_guard_cancelled on public.registrations;
create trigger registrations_guard_cancelled before insert on public.registrations
for each row execute function public.guard_cancelled_tournament();
