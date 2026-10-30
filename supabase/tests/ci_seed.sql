-- CI only: makes a fresh local database look like the real one for the signed-in checks.
-- Vineeth's account (sub 81b32feb-…), a PICKLEQ platform admin and the owner of the club "Pickleyard".
insert into auth.users (id, email, aud, role, instance_id)
  values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd', 'owner@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')
  on conflict (id) do nothing;
insert into public.platform_admins (user_id) values ('81b32feb-1a70-47c3-b0b4-9eb4a81a12dd') on conflict do nothing;
do $$ begin
  if not exists (select 1 from public.clubs where name = 'Pickleyard') then
    perform set_config('request.jwt.claims', '{"sub":"81b32feb-1a70-47c3-b0b4-9eb4a81a12dd","role":"authenticated"}', true);
    perform public.create_club('Pickleyard', 'Hyderabad', 'Vineeth');
  end if;
end $$;
