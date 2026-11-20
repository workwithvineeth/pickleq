// Home (20/10): everything on Home that comes from a live or finished event. Pure functions over the public scores,
// so Home never shows a made-up score: with no event data each part returns nothing and the section hides.
import type {PublicEvent, PublicTournament} from '../../club/backend';
import {courtMatches, matchView, type PublicMatch} from '../../club/liveView';
import {liveWinBar} from '../../club/winBar';
import {STAGE_LABEL} from '../../club/types';
import {ralliesOf, servingNow, type Rally} from '../arena/rallies';

export type HeroState = 'before' | 'during' | 'after';
type Ev = Pick<PublicEvent, 'slug' | 'name' | 'club' | 'startDate' | 'startTime' | 'status' | 'results'>;

/** Which event Home is about: the live one, else the next one, else the most recent finished one (within 3 days). */
export function heroEvent(events: Ev[], now: Date = new Date()): {state: HeroState; event: Ev} | null {
  const live = events.find(e => e.status === 'live' && e.results);
  if (live) return {state: 'during', event: live};
  const at = (e: Ev) => new Date(e.startDate + 'T' + (e.startTime || '00:00')).getTime();
  const next = events.filter(e => e.status !== 'done' && at(e) >= now.getTime() - 12 * 3600e3).sort((a, b) => at(a) - at(b))[0];
  if (next) return {state: 'before', event: next};
  const done = events.filter(e => e.status === 'done' && at(e) >= now.getTime() - 3 * 86400e3).sort((a, b) => at(b) - at(a))[0];
  return done ? {state: 'after', event: done} : null;
}

/** The hero's one button follows the event: details → live scores → results. */
export function heroCta(h: {state: HeroState; event: Ev} | null): {label: string; href: string} {
  if (!h) return {label: 'See events', href: '#/events'};
  const slug = encodeURIComponent(h.event.slug);
  if (h.state === 'during') return {label: 'See live scores', href: '#/live'};
  if (h.state === 'after') return {label: 'See results', href: '#/results/' + slug};
  return {label: 'See event details', href: '#/event/' + slug};
}

const short = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric', month: 'short'});
export function heroChip(h: {state: HeroState; event: Ev} | null): string {
  if (!h) return '';
  const e = h.event;
  if (h.state === 'during') return `Live now · ${e.name} · Hosted by ${e.club}`;
  if (h.state === 'after') return `Results · ${e.name} · Hosted by ${e.club}`;
  return `Next · ${e.name} · ${short(e.startDate)}${e.startTime ? ' · ' + e.startTime : ''} · Hosted by ${e.club}`;
}

const pair = (side: string) => side.split(' / ').join(' & ');
const stageOf = (d: PublicTournament, m: PublicMatch) => {
  const div = d.divisions.find(x => x.id === m.divisionId);
  const stage = STAGE_LABEL[m.stage as keyof typeof STAGE_LABEL] ?? '';
  return [stage + (m.stage === 'pool' && m.pool ? ' ' + String.fromCharCode(64 + m.pool) : ''), div?.name].filter(Boolean).join(' · ');
};
const doublesOf = (d: PublicTournament, m: PublicMatch) => d.divisions.find(x => x.id === m.divisionId)?.kind !== 'singles';
const gamesLine = (m: PublicMatch) => m.games.map(g => `${g.a}–${g.b}`).join(' ');

export interface FeaturedMatch {
  court: string; stage: string; game: number; a: string; b: string; sa: number; sb: number;
  serving: 'A' | 'B' | null; rallies: Rally[]; win: ReturnType<typeof liveWinBar>;
}
/** Match Centre: the live match with the most rallies so far (the one people are watching), else none. */
export function featured(d: PublicTournament | null): FeaturedMatch | null {
  if (!d) return null;
  const live = d.matches.filter(m => m.status === 'live' && m.court);
  if (!live.length) return null;
  const pick = live.map(m => ({m, r: ralliesOf(m.games.at(-1), doublesOf(d, m))})).sort((x, y) => y.r.length - x.r.length || (x.m.court ?? 0) - (y.m.court ?? 0))[0];
  const v = matchView(d, pick.m);
  return {
    court: 'Court ' + pick.m.court, stage: stageOf(d, pick.m), game: v.game, a: pair(v.a), b: pair(v.b), sa: v.pointsA, sb: v.pointsB,
    serving: servingNow(v.current, doublesOf(d, pick.m))?.team ?? null, rallies: pick.r, win: liveWinBar(d, pick.m),
  };
}

/** Ticker: one line per live or finished match, live first. */
export function tickerLines(d: PublicTournament | null): {live: boolean; text: string}[] {
  if (!d) return [];
  return d.matches.filter(m => m.status === 'live' || m.status === 'done').sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1) || (b.slot ?? 0) - (a.slot ?? 0)).slice(0, 12).map(m => {
    const v = matchView(d, m);
    return m.status === 'live'
      ? {live: true, text: `Court ${m.court ?? '–'} · ${pair(v.a)} ${v.pointsA}–${v.pointsB} ${pair(v.b)}`}
      : {live: false, text: `${pair(v.a)} ${v.gamesA}–${v.gamesB} ${pair(v.b)} · ${stageOf(d, m)}`};
  });
}

const clock = (start: string | undefined, mins: number) => {
  if (!start) return '';
  const [h, m] = start.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const t = h * 60 + (m || 0) + mins;
  const hh = Math.floor(t / 60) % 24, mm = t % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`;
};
export interface ScheduleRow {t: string; c: string; m: string; s: string; cls: '' | 'now' | 'done'}
/** On court today: the event's matches in slot order, a few finished ones for context, then live and next. */
export function schedule(d: PublicTournament | null): ScheduleRow[] {
  if (!d) return [];
  const ms = d.matches.filter(m => m.court && m.status !== 'void' && m.entryA && m.entryB).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.court ?? 0) - (b.court ?? 0));
  const firstOpen = ms.findIndex(m => m.status !== 'done');
  const from = firstOpen < 0 ? Math.max(0, ms.length - 4) : Math.max(0, firstOpen - 2);
  return ms.slice(from, from + 8).map(m => {
    const v = matchView(d, m);
    const live = m.status === 'live', done = m.status === 'done';
    return {
      t: clock(d.startTime, (m.slot ?? 0) * (d.slotMinutes || 20)),
      c: `Court ${m.court} · ${live ? 'On now' : stageOf(d, m)}`,
      m: `${pair(v.a)} v ${pair(v.b)}`,
      s: done ? 'Final · ' + gamesLine(m) : live ? `${stageOf(d, m)} · ${v.pointsA}–${v.pointsB}` : 'Up next',
      cls: live ? 'now' : done ? 'done' : '',
    };
  });
}

export interface LiveCourt {court: string; stage: string; a: string; b: string; sa: number; sb: number; servingA: boolean; servingB: boolean; leadA: boolean; leadB: boolean}
/** Live now: every court with a live match. */
export function liveCourts(d: PublicTournament | null): LiveCourt[] {
  if (!d) return [];
  return courtMatches(d).filter(x => x.match.status === 'live').map(({court, match}) => {
    const v = matchView(d, match);
    const s = servingNow(v.current, doublesOf(d, match))?.team;
    return {court: 'Court ' + court, stage: stageOf(d, match), a: pair(v.a), b: pair(v.b), sa: v.pointsA, sb: v.pointsB, servingA: s === 'A', servingB: s === 'B', leadA: v.pointsA > v.pointsB, leadB: v.pointsB > v.pointsA};
  });
}
