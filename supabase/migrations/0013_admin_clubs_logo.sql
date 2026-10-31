-- club_mode_17_admin_clubs_logo: the admin club list also gives each club's logo, so Admin → Clubs and the admin home show it.
create or replace function public.admin_clubs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then return jsonb_build_object('error', 'Only PaddleQ admins can see this'); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'city', c.city, 'verified', c.verified, 'is_test', c.is_test, 'created_at', c.created_at, 'logo_url', c.logo_url,
      'hosting', c.hosting, 'hosting_phone', c.hosting_phone, 'hosting_note', c.hosting_note, 'hosting_reason', c.hosting_reason,
      'hosting_requested_at', c.hosting_requested_at,
      'owners', (select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb) from public.club_members m join auth.users u on u.id = m.user_id
                 where m.club_id = c.id and m.role = 'owner'),
      'members', (select count(*) from public.club_members m where m.club_id = c.id),
      'tournaments', (select count(*) from public.tournaments t where t.club_id = c.id),
      'last_event', (select max(t.start_date) from public.tournaments t where t.club_id = c.id)
    ) order by c.is_test, (c.hosting = 'pending') desc, c.created_at desc), '[]'::jsonb) from public.clubs c);
end $$;
