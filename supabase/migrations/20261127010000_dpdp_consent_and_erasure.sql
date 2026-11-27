-- DPDP Act 2023: a record of each consent (who, what for, which notice version, when; withdrawn when),
-- withdrawing consent, and a "delete my data" request a signed-in person makes for themselves.
-- Deletion wipes the person's own data now. Entries in tournaments that have not finished keep their
-- contact details until the event is over (the organiser needs them to run it); a PaddleQ admin then
-- finishes the request (blank those entries, delete the account) and marks it done.

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('entry', 'account')),
  notice_version text not null check (notice_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index consent_records_user on public.consent_records (user_id);
alter table public.consent_records enable row level security;
-- People read their own records; every write goes through the functions below.
create policy consent_records_own on public.consent_records for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.consent_records from anon, authenticated;

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key: the request must outlive the account it deleted (proof the request was handled).
  user_id uuid not null,
  email text,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'done')),
  -- Entries the person still has in tournaments that are not finished; blanked when an admin finishes the request.
  open_entries int not null default 0,
  done_at timestamptz,
  done_by uuid
);
create unique index deletion_requests_one_pending on public.deletion_requests (user_id) where status = 'pending';
alter table public.deletion_requests enable row level security;
create policy deletion_requests_own on public.deletion_requests for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
revoke insert, update, delete on public.deletion_requests from anon, authenticated;

-- Contact details removed from an entry's players; names stay so played results still read correctly.
create function public.dpdp_strip_players(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(x - 'phone' - 'email' - 'age' - 'gender' - 'duprId'), '[]'::jsonb) from jsonb_array_elements(p) x
$$;
revoke all on function public.dpdp_strip_players(jsonb) from public, anon, authenticated;

-- The entry guard (0006) re-checks players on every change; removing contact details for a deletion would fail
-- "enter a phone number". Same guard, except a change that only strips those fields is let through,
-- and so is the account's foreign key emptying user_id when the account is deleted.
create or replace function public.guard_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  div public.divisions;
  problem text;
begin
  if (tg_op = 'INSERT' or new.players is distinct from old.players or new.division_id is distinct from old.division_id)
    and not (tg_op = 'UPDATE' and new.division_id = old.division_id and new.players = public.dpdp_strip_players(old.players)) then
    select * into div from public.divisions where id = new.division_id;
    problem := public.entry_problem(div, new.players, new.source = 'online');
    if problem is not null then raise exception '%', problem; end if;
  end if;
  -- A deleted account empties user_id through its foreign key (on delete set null); that runs as a nested trigger.
  if tg_op = 'UPDATE' and ((new.user_id is distinct from old.user_id and not (new.user_id is null and pg_trigger_depth() > 1))
    or new.tournament_id is distinct from old.tournament_id or new.club_id is distinct from old.club_id or new.source is distinct from old.source
    or new.created_at is distinct from old.created_at) then
    raise exception 'That part of a registration can''t be changed';
  end if;
  if tg_op = 'UPDATE' and new.division_id is distinct from old.division_id
    and not exists (select 1 from public.divisions x where x.id = new.division_id and x.tournament_id = new.tournament_id) then
    raise exception 'That event isn''t part of this tournament';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_registration() from public, anon, authenticated;

create function public.record_consent(p_purpose text, p_notice_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_purpose not in ('entry', 'account') then raise exception 'Unknown consent purpose'; end if;
  insert into public.consent_records (user_id, purpose, notice_version) values (auth.uid(), p_purpose, p_notice_version) returning id into v;
  return v;
end $$;

create function public.withdraw_consent() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update public.consent_records set withdrawn_at = now() where user_id = auth.uid() and withdrawn_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.request_data_deletion() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); open_n int; req uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  -- Your own diary, goals and sharing choices.
  delete from public.player_studio_sessions where owner_id = uid;
  delete from public.player_studio_logs where owner_id = uid;
  delete from public.player_studio_ratings where owner_id = uid;
  delete from public.player_studio_settings where user_id = uid;
  delete from public.player_goals where player = uid;
  delete from public.profile_sharing where player = uid;
  -- Emails clubs hold for the roster players you claimed; then the claims are undone.
  delete from public.club_player_emails e using public.club_players p where p.id = e.player_id and p.user_id = uid;
  update public.claim_email_log l set sent_to = '' from public.club_players p where p.id = l.player_id and p.user_id = uid;
  update public.club_players set user_id = null, claimed_at = null where user_id = uid;
  -- Your entries in finished tournaments lose their contact details now; upcoming and live ones keep them until the event is over.
  update public.registrations r set players = public.dpdp_strip_players(r.players)
    from public.tournaments t where t.id = r.tournament_id and r.user_id = uid and t.status = 'done';
  select count(*) into open_n from public.registrations r join public.tournaments t on t.id = r.tournament_id
    where r.user_id = uid and t.status <> 'done' and r.status not in ('withdrawn', 'rejected');
  update public.consent_records set withdrawn_at = now() where user_id = uid and withdrawn_at is null;
  insert into public.deletion_requests (user_id, email, open_entries)
    values (uid, (select email from auth.users where id = uid), open_n)
    on conflict (user_id) where status = 'pending' do update set open_entries = excluded.open_entries, requested_at = now()
    returning id into req;
  return jsonb_build_object('id', req, 'openEntries', open_n);
end $$;

-- PaddleQ admins: the requests still to finish.
create function public.admin_deletion_requests() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.is_platform_admin() then null else coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'userId', d.user_id, 'email', d.email, 'requestedAt', d.requested_at,
    'openEntries', (select count(*) from public.registrations r join public.tournaments t on t.id = r.tournament_id
      where r.user_id = d.user_id and t.status <> 'done' and r.status not in ('withdrawn', 'rejected')))
    order by d.requested_at), '[]'::jsonb) end
  from public.deletion_requests d where d.status = 'pending'
$$;

-- PaddleQ admins: finish a request once its tournaments are over. Blanks the remaining entries and deletes the account.
create function public.admin_finish_deletion(p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.deletion_requests;
begin
  if not public.is_platform_admin() then raise exception 'PaddleQ admins only'; end if;
  select * into d from public.deletion_requests where id = p_request and status = 'pending' for update;
  if not found then return jsonb_build_object('error', 'No pending request'); end if;
  if exists (select 1 from public.registrations r join public.tournaments t on t.id = r.tournament_id
      where r.user_id = d.user_id and t.status <> 'done' and r.status not in ('withdrawn', 'rejected')) then
    return jsonb_build_object('error', 'They still have an entry in a tournament that is not finished. Finish this after the event.');
  end if;
  update public.registrations set players = public.dpdp_strip_players(players) where user_id = d.user_id;
  begin
    delete from auth.users where id = d.user_id;
  exception when foreign_key_violation then
    return jsonb_build_object('error', 'This account still owns or runs a club or tournament. Hand it over first.');
  end;
  update public.deletion_requests set status = 'done', done_at = now(), done_by = auth.uid(), email = null where id = p_request;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.record_consent(text, text) from public, anon;
revoke all on function public.withdraw_consent() from public, anon;
revoke all on function public.request_data_deletion() from public, anon;
revoke all on function public.admin_deletion_requests() from public, anon;
revoke all on function public.admin_finish_deletion(uuid) from public, anon;
grant execute on function public.record_consent(text, text), public.withdraw_consent(), public.request_data_deletion(),
  public.admin_deletion_requests(), public.admin_finish_deletion(uuid) to authenticated;
