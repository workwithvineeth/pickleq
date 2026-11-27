import type { PublicCourtStream, PublicTournament } from '../../club/backend';
import { courtMatches, matchView } from '../../club/liveView';
import { isYouTubeVideoId } from '../../club/live/youtubeLink';

/** What the LED wall shows in each quarter. */
export interface WallCell { court: number; videoId?: string; score?: { a: string; b: string; sa: number; sb: number } }
export interface WallOptions { videos: (string | undefined)[]; scores: boolean }

/** Reads `?v=id1,id2,id3,id4&scores=on` from the address (after the hash too). Empty or bad ids leave that quarter blank. */
export function wallOptions(href: string): WallOptions {
  const url = new URL(href);
  const q = new URLSearchParams(url.search);
  const at = url.hash.indexOf('?');
  if (at !== -1) new URLSearchParams(url.hash.slice(at + 1)).forEach((v, k) => q.set(k, v));
  const videos = (q.get('v') ?? '').split(',').slice(0, 4).map(v => v.trim()).map(v => (isYouTubeVideoId(v) ? v : undefined));
  return { videos, scores: q.get('scores') === 'on' };
}

const pair = (side: string) => side.split(' / ').join(' & ');

/**
 * The four quarters, Court 1 to 4. A video given in the address wins; otherwise the court's stream that the
 * organiser shows to fans. A score is added only when asked (the OBS overlay already puts it on the video).
 */
export function wallCells(o: WallOptions, streams: PublicCourtStream[], d: PublicTournament | null): WallCell[] {
  const live = d && o.scores ? courtMatches(d).filter(x => x.match.status === 'live') : [];
  return [1, 2, 3, 4].map(court => {
    const given = o.videos[court - 1];
    const stream = streams.find(s => s.court === court && isYouTubeVideoId(s.videoId));
    const m = live.find(x => x.court === court)?.match;
    const v = m && d ? matchView(d, m) : null;
    return { court, videoId: given ?? stream?.videoId, score: v ? { a: pair(v.a), b: pair(v.b), sa: v.pointsA, sb: v.pointsB } : undefined };
  });
}

/** Muted, autoplaying, no controls: the wall has no mouse and must start by itself. */
export const wallEmbedUrl = (videoId: string, origin: string) =>
  `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&origin=${encodeURIComponent(origin)}`;
