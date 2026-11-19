-- Finished events keep their share page (/e/<slug>/) for good, so old results links still preview in chat apps.
-- Before this, only events from the last 7 days got a page, and links to past results (TPC Diwali, 1 Nov) answered 404.
create or replace function public.share_events() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(t, true) order by t.start_date), '[]'::jsonb)
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where (t.start_date >= (now() at time zone 'Asia/Kolkata')::date - 7 or t.status = 'done')
    and t.listing_status <> 'rejected' and not c.is_test
    and t.approval = 'approved'
    and ((t.listing <> 'none' and t.listing_status = 'approved') or t.entry_mode = 'registration')
$$;
