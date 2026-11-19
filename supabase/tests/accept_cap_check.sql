-- Accepting entries stays within the category limit (20261112090000_accept_within_cap). Runs as the database owner and
-- rolls back. Expected: no row says FAIL.
begin;
create temp table out (step int, result text) on commit drop;

do $$
declare
  c uuid := (select id from public.clubs where name = 'Pickleyard');
  t uuid; d uuid; r1 uuid; r2 uuid; r3 uuid; msg text;
  p jsonb := '[{"name":"Cap One","phone":"9800000001","gender":"m","age":30},{"name":"Cap Two","phone":"9800000002","gender":"m","age":30}]';
begin
  insert into public.tournaments (club_id, name, start_date, status, entry_mode, approval) values (c, 'Cap Rollback', current_date + 5, 'draft', 'registration', 'approved') returning id into t;
  insert into public.divisions (tournament_id, club_id, name, kind, format, pools, advance, cap) values (t, c, 'Cap Doubles', 'doubles', '{"bestOf":1,"pointsTo":11}', 1, 0, 2) returning id into d;
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status) values (t, d, c, 'offline', p, 'pending') returning id into r1;
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status) values (t, d, c, 'offline', p, 'pending') returning id into r2;
  insert into public.registrations (tournament_id, division_id, club_id, source, players, status) values (t, d, c, 'offline', p, 'waitlist') returning id into r3;

  update public.registrations set status = 'accepted' where id in (r1, r2);
  insert into out values (1, case when (select count(*) from public.registrations where division_id = d and status = 'accepted') = 2 then 'two entries accepted up to the limit of 2' else 'FAIL could not accept up to the limit' end);

  begin
    update public.registrations set status = 'accepted' where id = r3;
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  insert into out values (2, case when msg like 'Cap Doubles is full (2 of 2 accepted)%' then 'a third accept is refused with a clear message' else 'FAIL third accept: ' || coalesce(msg, 'allowed') end);

  update public.registrations set status = 'withdrawn' where id = r1;
  update public.registrations set status = 'accepted' where id = r3;
  insert into out values (3, case when (select status from public.registrations where id = r3) = 'accepted' then 'after a withdrawal the waitlisted entry can be accepted' else 'FAIL waitlist accept after withdrawal' end);

  update public.registrations set payment = 'paid' where id = r3;
  insert into out values (4, 'payment changes on an accepted entry still work when the category is full');

  update public.divisions set cap = null where id = d;
  update public.registrations set status = 'accepted' where id = r1;
  insert into out values (5, case when (select count(*) from public.registrations where division_id = d and status = 'accepted') = 3 then 'no limit: accepting is not capped' else 'FAIL no-limit accept' end);
end $$;

select step, result from out order by step;
rollback;
