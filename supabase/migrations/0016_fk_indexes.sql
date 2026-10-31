-- Applied on the server as club_mode_20_fk_indexes.
-- An index for every foreign key the performance advisor listed (QA review bug 8), so deletes that cascade and lookups by club,
-- event or entry stay fast as clubs grow. The four "unused" indexes are kept on purpose: tournament_desks_club_idx is new (made on
-- 31 Oct), club_matches_division_idx serves the knockout guard and division lookups, and the side_a/side_b indexes serve a player's
-- match history across clubs (rare today, needed once players have profiles).
create index if not exists club_claims_player_idx on public.club_claims (player_id);
create index if not exists club_helpers_club_idx on public.club_helpers (club_id);
create index if not exists club_matches_entry_a_idx on public.club_matches (entry_a);
create index if not exists club_matches_entry_b_idx on public.club_matches (entry_b);
create index if not exists club_matches_updated_by_idx on public.club_matches (updated_by);
create index if not exists club_players_user_idx on public.club_players (user_id);
create index if not exists clubs_created_by_idx on public.clubs (created_by);
create index if not exists divisions_club_idx on public.divisions (club_id);
create index if not exists entries_club_idx on public.entries (club_id);
create index if not exists platform_admins_added_by_idx on public.platform_admins (added_by);
create index if not exists registrations_club_idx on public.registrations (club_id);
create index if not exists registrations_division_idx on public.registrations (division_id);
create index if not exists registrations_entry_idx on public.registrations (entry_id);
create index if not exists scorer_links_club_idx on public.scorer_links (club_id);
create index if not exists shared_summaries_club_idx on public.shared_summaries (club_id);
create index if not exists tournament_pins_club_idx on public.tournament_pins (club_id);
create index if not exists tournaments_created_by_idx on public.tournaments (created_by);
-- The knockout guard (club_matches_one_ko) looks matches up by event, stage and bracket position.
create index if not exists club_matches_ko_idx on public.club_matches (division_id, stage, bracket_pos) where stage not in ('pool', 'friendly');
