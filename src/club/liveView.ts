import type { PublicTournament } from './backend';
import { formatFor } from './domain/engine';
import { gameOver } from './domain/momentum';
import type { Format } from '../domain/types';

export type PublicMatch = PublicTournament['matches'][number];
/** Presentation input for T9. It never accepts an arbitrary embed URL or HTML. */
export interface CourtVideo {
  videoId: string;
  status: 'unknown' | 'upcoming' | 'live' | 'ended' | 'unavailable';
  checkedAt?: string;
  embeddable?: boolean;
}
export function videoState(video?: CourtVideo, now = Date.now()) {
  if (!video) return 'No video linked';
  if (!/^[A-Za-z0-9_-]{11}$/.test(video.videoId) || video.embeddable === false || video.status === 'unavailable') return 'Video unavailable';
  if (video.status === 'ended') return 'Stream ended';
  if (video.status === 'upcoming') return 'Starting soon';
  const age = now - Date.parse(video.checkedAt ?? '');
  return video.status === 'live' && age >= 0 && age <= 180_000 ? 'LIVE' : 'Stream linked';
}

/** The active match takes precedence over the next scheduled one; completed courts stay visible. */
export function courtMatches(d: PublicTournament) {
  const matches = d.matches.filter(m => m.court && m.status !== 'void');
  const courts = [...new Set(matches.map(m => m.court!))].sort((a, b) => a - b);
  const rank = (m: PublicMatch) => m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2;
  return courts.map(court => ({ court, match: matches.filter(m => m.court === court).sort((a, b) => rank(a) - rank(b) || (a.status === 'done' ? (b.slot ?? 0) - (a.slot ?? 0) : (a.slot ?? 0) - (b.slot ?? 0)) || a.id.localeCompare(b.id))[0] }));
}

export function matchView(d: PublicTournament, m: PublicMatch) {
  const division = d.divisions.find(x => x.id === m.divisionId);
  const format: Format = division ? formatFor(division, m.stage) : { bestOf: 1, pointsTo: 11, scoring: 'rally' };
  const last = m.games.at(-1);
  const finished = !!last && gameOver(last.a, last.b, format.pointsTo, format.golden);
  const games = m.games.filter(g => gameOver(g.a, g.b, format.pointsTo, format.golden));
  const a = d.entries.find(e => e.id === m.entryA)?.names.join(' / ') || 'To be decided';
  const b = d.entries.find(e => e.id === m.entryB)?.names.join(' / ') || 'To be decided';
  const needed = Math.ceil(format.bestOf / 2);
  const nextGame = m.status === 'live' && finished && games.filter(g => g.a > g.b).length < needed && games.filter(g => g.b > g.a).length < needed && !m.winner;
  return { a, b, division, format, pointsA: nextGame ? 0 : last?.a ?? 0, pointsB: nextGame ? 0 : last?.b ?? 0,
    gamesA: games.filter(g => g.a > g.b).length, gamesB: games.filter(g => g.b > g.a).length,
    game: Math.max(1, m.games.length + (nextGame ? 1 : 0)), current: nextGame ? undefined : last };
}

/** Score-only illustration, not ratings or serve data. Each scoring point has equal odds. */
export function gameChance(a: number, b: number, target: number, golden = false): number {
  const memo = new Map<string, number>();
  const p = (x: number, y: number): number => {
    if (gameOver(x, y, target, golden)) return x > y ? 1 : 0;
    if (!golden && x >= target - 1 && y >= target - 1) return x === y ? .5 : x > y ? .75 : .25;
    const key = `${x}:${y}`;
    if (!memo.has(key)) memo.set(key, (p(x + 1, y) + p(x, y + 1)) / 2);
    return memo.get(key)!;
  };
  return p(a, b);
}
export function winChance(d: PublicTournament, m: PublicMatch): number | null {
  if (!m.entryA || !m.entryB || m.status === 'scheduled') return null;
  if (m.status === 'done') return m.winner ? (m.winner === 'A' ? 100 : 0) : null;
  const v = matchView(d, m);
  const needed = Math.ceil(v.format.bestOf / 2);
  const future = (a: number, b: number): number => a >= needed ? 1 : b >= needed ? 0 : (future(a + 1, b) + future(a, b + 1)) / 2;
  // The current game's completed result is already included in gamesA/gamesB.
  if (v.gamesA >= needed || v.gamesB >= needed) return Math.round(future(v.gamesA, v.gamesB) * 100);
  const p = gameChance(v.pointsA, v.pointsB, v.format.pointsTo, v.format.golden);
  return Math.round(100 * (p * future(v.gamesA + 1, v.gamesB) + (1 - p) * future(v.gamesA, v.gamesB + 1)));
}

/** Never infer individual points from polling jumps or final scores. */
export function pointHistory(points: string, a: number, b: number) {
  if (!points || !/^[AB]+$/.test(points)) return [];
  let x = 0, y = 0;
  const rows = [...points].map((side, i) => ({ side, index: i + 1, a: x += side === 'A' ? 1 : 0, b: y += side === 'B' ? 1 : 0 }));
  return x === a && y === b ? rows : [];
}
export function headToHead(d: PublicTournament, m: PublicMatch) {
  if (!m.entryA || !m.entryB) return { a: 0, b: 0, total: 0 };
  const history = d.matches.filter(x => x.id !== m.id && x.status === 'done' && x.winner && ((x.entryA === m.entryA && x.entryB === m.entryB) || (x.entryA === m.entryB && x.entryB === m.entryA)));
  const a = history.filter(x => (x.winner === 'A' ? x.entryA : x.entryB) === m.entryA).length;
  return { a, b: history.length - a, total: history.length };
}

/** A match-point signal is derived only from the existing scoring format and games. */
 export function isMatchPoint(d:PublicTournament,m:PublicMatch){if(m.status!=='live')return false;const v=matchView(d,m),need=Math.ceil(v.format.bestOf/2);if(gameOver(v.pointsA,v.pointsB,v.format.pointsTo,!!v.format.golden))return false;const golden=!!v.format.golden&&v.pointsA===v.format.pointsTo-1&&v.pointsB===v.format.pointsTo-1;return(golden&&(v.gamesA===need-1||v.gamesB===need-1))||(v.pointsA>=v.format.pointsTo-1&&v.pointsA>v.pointsB&&v.gamesA===need-1)||(v.pointsB>=v.format.pointsTo-1&&v.pointsB>v.pointsA&&v.gamesB===need-1);}
