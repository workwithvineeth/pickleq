-- Phase 3 · Module 1
-- 1) The audited-score guard (20261103050211) also blocked the robot's sandbox reset, because the
--    reset runs as the database owner and voids finished test matches. Real clubs keep the same
--    protection: only test clubs (clubs.is_test) may be reset, and never by signed-in users or visitors.
create or replace function public.guard_completed_club_score() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'done' and old.tournament_id is not null and
    (new.games is distinct from old.games or new.winner is distinct from old.winner or new.status is distinct from old.status)
    and (
      current_user in ('authenticated','anon')
      or (
        current_setting('paddleq.correcting_match',true) is distinct from old.id::text
        and not exists (select 1 from public.clubs c where c.id = old.club_id and c.is_test)
      )
    )
  then raise exception 'Use the audited correction option for completed matches'; end if;
  return new;
end $$;
revoke execute on function public.guard_completed_club_score() from public, anon, authenticated;

-- 2) Testimonials only from clubs that have finished a real tournament on PaddleQ.
create or replace function public.guard_testimonial_eligible() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.tournaments t where t.club_id = new.club_id and t.status = 'done') then
    raise exception 'Share your experience after your first finished tournament';
  end if;
  return new;
end $$;
revoke execute on function public.guard_testimonial_eligible() from public, anon, authenticated;
drop trigger if exists club_testimonials_guard_eligible on public.club_testimonials;
create trigger club_testimonials_guard_eligible before insert on public.club_testimonials
for each row execute function public.guard_testimonial_eligible();

-- 3) Lets the app show the testimonial invite only to clubs that qualify.
create or replace function public.club_can_share_experience(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin(p_club) and exists (select 1 from public.tournaments t where t.club_id = p_club and t.status = 'done')
$$;
revoke execute on function public.club_can_share_experience(uuid) from public, anon;
grant execute on function public.club_can_share_experience(uuid) to authenticated;
