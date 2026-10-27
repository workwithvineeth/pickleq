/** Pro clips: YouTube videos that show how each shot is hit. They play inside the app, from a start time to an end time. */

export const CLIP_SHOTS = ['Serve', 'Return', 'Third-shot drop', 'Dink', 'Forehand drive', 'Backhand drive', 'Volley and reset', 'Footwork'] as const;
export type ClipShot = (typeof CLIP_SHOTS)[number];

/** new = suggested but you haven't watched it yet; approved = you've checked it; hidden = you don't want it. */
export type ClipStatus = 'new' | 'approved' | 'hidden';

export interface Clip {
  id: string;
  shot: ClipShot;
  videoId: string;
  title: string;
  channel: string;
  /** Seconds into the video. */
  start: number;
  /** Seconds into the video; empty means play to the end. */
  end?: number;
  /** Full length of the video in seconds, when known. */
  duration?: number;
  status: ClipStatus;
  builtIn: boolean;
  addedAt: string;
}

type Seed = [ClipShot, string, string, string, number, number, number?];

/**
 * Suggested clips. Each video was checked to exist and to allow playing inside other apps on 28 Oct 2026.
 * Start and end times come from the video's own chapter list where it has one; otherwise the whole video plays.
 * Nobody has watched these on PICKLEQ's behalf, so each starts as "not reviewed yet".
 */
const SEEDS: Seed[] = [
  ['Serve', 'fThStvI53oA', '5 Tips for PERFECT Pickleball Serve Technique', 'PrimeTime Pickleball', 466, 0],
  ['Serve', 'O4lD3EqMMzk', 'How To Practice The Pickleball Serve By Yourself', 'Selkirk TV', 688, 0],
  ['Return', 'nZV9TkvljcM', 'Improve Your Return of Serve with this Easy Drill', 'Pickleball Channel', 109, 0],
  ['Return', 'BoZnb5Cqiik', 'Return of Serve Drills at The Erne HQ', 'Tyson McGuffin Pickleball', 138, 0],
  ['Third-shot drop', 'cG3pVp22Wbs', 'Third Shot Drop Solo Drill', 'Third Shot Sports', 136, 0],
  ['Third-shot drop', 'EI-YzOEwY-o', 'The Perfect Third Shot Drop: A Step-by-Step Drill', 'Selkirk TV', 280, 0],
  ['Third-shot drop', 'Bz2wXIKHXcs', 'How to Hit a 3rd Shot Drop in Pickleball', 'ThatPickleballGuy - Kyle Koszuta', 905, 0],
  ['Dink', 'SXW0PK8VgJg', 'Best Pickleball Dink Technique', 'Third Shot Sports', 178, 0],
  ['Dink', '9dqIrsQ3unU', 'Soft Hands Drill: Unattackable Dinks', 'The Flying Pickle Academy', 226, 15, 76],
  ['Dink', 'aKzXv98Zlr0', 'The Best Pickleball Dinking Drill & Game', 'Tyson McGuffin Pickleball', 289, 0],
  ['Forehand drive', 'bZIXL8zGwBM', 'The Forehand Drive in 3 Simple Steps', 'John Cincola Pickleball', 394, 96, 306],
  ['Forehand drive', 'YHjdSLwZCuU', 'COMPLETE Forehand Drive Tutorial', 'Zane Navratil Pickleball', 481, 0],
  ['Backhand drive', 'GCrLkKJuddk', 'Backhand Drive Pickleball Tutorial', 'Walker Sisters Pickleball', 246, 0],
  ['Backhand drive', 'e8izJQazwYA', 'This Technique Makes Hitting Backhands SO EASY!', 'Enhance Pickleball', 1143, 629, 899],
  ['Volley and reset', 'BlswcXC9vAI', 'Master the Reset Volley in Pickleball', 'Selkirk TV', 99, 0],
  ['Volley and reset', '0dqnVihAvXQ', 'Your Volleys Are Going Up Because of This One Mistake', 'Cliff Pickleball', 519, 43, 118],
  ['Volley and reset', 'QoPGqL6kKbU', 'Read & Reset Drill: The Transition Zone', 'Selkirk TV', 253, 0],
  ['Footwork', 'gkylsUztlV4', 'Shadow Drill', 'Scott Ficks', 31, 0],
  ['Footwork', 'ge6b3dFMgD4', 'Paddle Tracking & Shadowing', 'Tanner Pickleball', 53, 0],
  ['Footwork', '2bG9IWPp42U', 'Footwork Drill to Improve Kitchen Line Movement', 'USA Pickleball', 154, 0],
  ['Footwork', 'bJkWCJkquXw', 'Improving Your Lateral Footwork Along the Kitchen Line', 'Selkirk TV', 656, 0],
];

export const builtInId = (shot: ClipShot, videoId: string) => `yt-${shotSlug(shot)}-${videoId}`;

export function builtInClips(now = new Date()): Clip[] {
  return SEEDS.map(([shot, videoId, title, channel, duration, start, end]) => ({
    id: builtInId(shot, videoId), shot, videoId, title, channel, duration, start, end, status: 'new', builtIn: true, addedAt: now.toISOString(),
  }));
}

export const shotSlug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
export const shotFromSlug = (slug: string | undefined): ClipShot | undefined => CLIP_SHOTS.find((s) => shotSlug(s) === slug);

/** Pulls the 11-character video id out of any YouTube link (watch, youtu.be, shorts, embed, live). */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
      id = m ? m[2] : null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Start time written into a link (?t=90, ?t=1m30s, &start=90). */
export function parseLinkStart(input: string): number {
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    const t = u.searchParams.get('t') ?? u.searchParams.get('start');
    if (!t) return 0;
    if (/^\d+s?$/.test(t)) return parseInt(t, 10);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0)) : 0;
  } catch { return 0; }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** "1:30" or "90" → 90. Empty → null. Anything else → NaN. */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  if (parts.slice(1).some((p) => +p >= 60)) return NaN;
  return parts.reduce((n, p) => n * 60 + parseInt(p, 10), 0);
}

export function checkRange(start: number | null, end: number | null, duration?: number): string | null {
  if (start === null || Number.isNaN(start)) return 'Enter the start as minutes:seconds, like 1:30';
  if (end !== null && Number.isNaN(end)) return 'Enter the end as minutes:seconds, like 2:10';
  if (duration && start >= duration) return `The video is only ${fmtTime(duration)} long`;
  if (end !== null && end <= start) return 'The end has to be after the start';
  if (end !== null && duration && end > duration) return `The video is only ${fmtTime(duration)} long`;
  return null;
}

export function clipLength(c: Pick<Clip, 'start' | 'end' | 'duration'>): number | undefined {
  const end = c.end ?? c.duration;
  return end === undefined ? undefined : Math.max(0, end - c.start);
}

const order: Record<ClipStatus, number> = { approved: 0, new: 1, hidden: 2 };
export function sortClips(list: Clip[]): Clip[] {
  return [...list].sort((a, b) => order[a.status] - order[b.status] || Number(b.builtIn === false) - Number(a.builtIn === false) || a.addedAt.localeCompare(b.addedAt));
}

const INSIGHT_SHOT: Record<string, ClipShot> = {
  serve: 'Serve', serves: 'Serve', return: 'Return', returns: 'Return',
  'third-shot drop': 'Third-shot drop', 'third-shot drops': 'Third-shot drop',
  dink: 'Dink', dinks: 'Dink', dinking: 'Dink',
  'forehand drive': 'Forehand drive', 'forehand drives': 'Forehand drive',
  'backhand drive': 'Backhand drive', 'backhand drives': 'Backhand drive',
  volleys: 'Volley and reset', resets: 'Volley and reset', footwork: 'Footwork',
};

/** Which shot an insight is about, from its id (e.g. "drill-gap-Dink", "tag-losses-Backhand drive"). */
export function clipShotForInsight(insightId: string): ClipShot | undefined {
  const m = insightId.match(/^(?:drill-gap|weak-drill|tag-losses|tag-strength)-(.+)$/);
  return m ? INSIGHT_SHOT[m[1].toLowerCase()] : undefined;
}
