-- Applied on the server as club_mode_8_share_pages.
-- Events that get a link-preview page (for WhatsApp and other chat apps): upcoming events on the board, and
-- registration events an organiser shares by link. Same public details as the event page; never players' details.
create or replace function public.share_events() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(t, true) order by t.start_date), '[]'::jsonb)
  from public.tournaments t join public.clubs c on c.id = t.club_id
  where t.start_date >= (now() at time zone 'Asia/Kolkata')::date - 7 and t.listing_status <> 'rejected' and not c.is_test
    and ((t.listing <> 'none' and t.listing_status = 'approved') or t.entry_mode = 'registration')
$$;
revoke execute on function public.share_events() from public;
grant execute on function public.share_events() to anon, authenticated;
