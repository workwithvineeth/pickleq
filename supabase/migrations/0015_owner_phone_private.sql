-- Applied on the server as club_mode_19_owner_phone_private.
-- The club owner's phone and note (sent when asking PaddleQ to host) are kept, but only PaddleQ admins and the club's own owner and
-- admins can see them (QA review 31 Oct 2026, bug 2; Vineeth's decision: keep the phone, hide it from other members — DPDP).
-- Before, any club member (even a player) could read clubs.hosting_phone through the API. Now the phone and note live in their own
-- table, club_contacts, readable only by those people; clubs.hosting_phone/hosting_note stay empty (old app versions just see none).
-- Nothing here removes rows.

create table public.club_contacts (
  club_id uuid primary key references public.clubs (id) on delete cascade,
  phone text check (phone is null or char_length(phone) <= 20),
  note text check (note is null or char_length(note) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.club_contacts enable row level security;
create policy "club owner and admins, and PaddleQ admins, see the contact" on public.club_contacts for select to authenticated
  using (public.is_admin(club_id) or public.is_platform_admin());

-- Move what's there now, then empty the old columns.
insert into public.club_contacts (club_id, phone, note)
  select id, hosting_phone, hosting_note from public.clubs where hosting_phone is not null or hosting_note is not null
  on conflict (club_id) do update set phone = excluded.phone, note = excluded.note;
update public.clubs set hosting_phone = null, hosting_note = null where hosting_phone is not null or hosting_note is not null;

-- The old columns stay empty, however a club row is written.
create function public.clubs_no_contact() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.hosting_phone := null;
  new.hosting_note := null;
  return new;
end $$;
create trigger clubs_no_contact before insert or update of hosting_phone, hosting_note on public.clubs
  for each row execute function public.clubs_no_contact();

-- The owner or admins send (or re-send) the request: the phone and note go to club_contacts.
create or replace function public.request_hosting(p_club uuid, p_phone text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.clubs;
begin
  if (select auth.uid()) is null then return jsonb_build_object('error', 'Sign in first'); end if;
  if not public.is_admin(p_club) then return jsonb_build_object('error', 'Only the club’s owner and admins can ask to host tournaments'); end if;
  select * into c from public.clubs where id = p_club;
  if c.hosting = 'approved' then return jsonb_build_object('error', 'This club can already host tournaments'); end if;
  if char_length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then return jsonb_build_object('error', 'Add a phone number PaddleQ can call (10 digits)'); end if;
  insert into public.club_contacts (club_id, phone, note, updated_at)
    values (p_club, left(trim(p_phone), 20), left(nullif(trim(coalesce(p_note, '')), ''), 500), now())
    on conflict (club_id) do update set phone = excluded.phone, note = excluded.note, updated_at = now();
  update public.clubs set hosting = 'pending', hosting_reason = null, hosting_requested_at = now(), hosting_reviewed_at = null
  where id = p_club;
  return jsonb_build_object('ok', true);
end $$;

-- The admin dashboard reads the phone and note from club_contacts.
create or replace function public.admin_clubs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'city', c.city, 'verified', c.verified, 'is_test', c.is_test, 'created_at', c.created_at, 'logo_url', c.logo_url,
      'hosting', c.hosting, 'hosting_phone', k.phone, 'hosting_note', k.note, 'hosting_reason', c.hosting_reason,
      'hosting_requested_at', c.hosting_requested_at,
      'owners', (select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb) from public.club_members m join auth.users u on u.id = m.user_id
                 where m.club_id = c.id and m.role = 'owner'),
      'members', (select count(*) from public.club_members m where m.club_id = c.id),
      'tournaments', (select count(*) from public.tournaments t where t.club_id = c.id),
      'last_event', (select max(t.start_date) from public.tournaments t where t.club_id = c.id)
    ) order by c.is_test, (c.hosting = 'pending') desc, c.created_at desc), '[]'::jsonb)
    from public.clubs c left join public.club_contacts k on k.club_id = c.id);
end $$;

create or replace function public.admin_club(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.clubs;
  k public.club_contacts;
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  select * into c from public.clubs where id = p_club;
  if c.id is null then return jsonb_build_object('error', 'Club not found'); end if;
  select * into k from public.club_contacts where club_id = p_club;
  return jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city, 'verified', c.verified, 'is_test', c.is_test, 'logo_url', c.logo_url,
    'hosting', c.hosting, 'hosting_phone', k.phone, 'hosting_note', k.note, 'hosting_reason', c.hosting_reason,
    'hosting_requested_at', c.hosting_requested_at,
    'people', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(nullif(h.name, ''), nullif(p.display_name, ''), split_part(u.email, '@', 1)),
                 'email', case when h.user_id is null then u.email end, 'role', m.role, 'helper', h.user_id is not null, 'joined_at', m.joined_at)
                 order by array_position(array['owner', 'admin', 'coach', 'player'], m.role), m.joined_at), '[]'::jsonb)
               from public.club_members m join auth.users u on u.id = m.user_id
               left join public.profiles p on p.id = m.user_id left join public.club_helpers h on h.user_id = m.user_id
               where m.club_id = c.id),
    'tournaments', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'start_date', t.start_date, 'status', t.status) order by t.start_date desc), '[]'::jsonb)
                    from public.tournaments t where t.club_id = c.id));
end $$;

revoke execute on function public.clubs_no_contact() from public, anon, authenticated;
