import type { ClubTournament } from './types';

/** Where an organiser's "see it on RallyQ" link goes: the Events board, scrolled to this event when it is listed there. */
export function eventsBoardHref(t?: Pick<ClubTournament, 'publicSlug' | 'listing'> | null): string {
  const listed = !!t?.publicSlug && !!t.listing && t.listing !== 'none';
  return listed ? `#/events/${encodeURIComponent(t!.publicSlug)}` : '#/events';
}
