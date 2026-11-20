-- create_club keeps an existing account name (migration 20261121040000). Rolls back; FAIL rows are problems.
begin;
insert into auth.users(id,email) values ('ac000000-0000-4000-8000-000000000001','club-maker@example.test');
insert into public.profiles(id,display_name) values ('ac000000-0000-4000-8000-000000000001','Asha Original');
insert into auth.users(id,email) values ('ac000000-0000-4000-8000-000000000002','club-new@example.test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_club('Name Check Club','Hyderabad','Somebody Else') is not null as made;
select case when (select display_name from public.profiles where id='ac000000-0000-4000-8000-000000000001') = 'Asha Original'
  then 'ok existing name kept' else 'FAIL create_club renamed the account' end as keeps_name;
select set_config('request.jwt.claims','{"sub":"ac000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.create_club('Second Check Club','','Bela New') is not null as made2;
select case when (select display_name from public.profiles where id='ac000000-0000-4000-8000-000000000002') = 'Bela New'
  then 'ok empty name filled' else 'FAIL empty name not filled' end as fills_empty;
rollback;
