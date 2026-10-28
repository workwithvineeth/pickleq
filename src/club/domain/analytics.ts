import type { WinLoss } from '../../domain/record';
import { CLOSE_MARGIN, EVEN_GAP } from '../../domain/stats';
import type { ClubMatch, ClubPlayer, Thresholds } from '../types';
import { entryRating } from './engine';
import { analyseGame } from './momentum';

export type Side = 'A' | 'B';
export function sideOf(m: Pick<ClubMatch, 'sideA' | 'sideB'>, playerId: string): Side | null {
  return m.sideA.includes(playerId) ? 'A' : m.sideB.includes(playerId) ? 'B' : null;
}

export interface Swing { matchId: string; date?: string; me: number; them: number; game: number }

export interface PlayerClubStats {
  matches: number;
  record: WinLoss;
  games: WinLoss;
  pointsFor: number;
  pointsAgainst: number;
  /** Games decided by 3 points or fewer. */
  close: WinLoss;
  comebacks: Swing[];
  lostLeads: Swing[];
  dominated: number;
  /** Games in which you stood one point from winning, and how many of those you won. */
  gamePoints: { had: number; won: number };
  /** Games in which the opponent stood one point from winning, and how many of those you still won. */
  facedGamePoints: { faced: number; saved: number };
  vs: { stronger: WinLoss; equal: WinLoss; weaker: WinLoss };
  byStage: { pool: WinLoss; knockout: WinLoss; club: WinLoss };
  partners: { playerId: string; record: WinLoss }[];
  /** Points-by-point games available (momentum is only known for these). */
  trackedGames: number;
}

const wl = (): WinLoss => ({ wins: 0, losses: 0 });
const add = (r: WinLoss, won: boolean) => { if (won) r.wins++; else r.losses++; };

export function playerMatches(playerId: string, matches: ClubMatch[]): ClubMatch[] {
  return matches.filter((m) => m.status === 'done' && m.winner && sideOf(m, playerId))
    .sort((a, b) => (b.playedOn ?? '').localeCompare(a.playedOn ?? '') || b.updatedAt.localeCompare(a.updatedAt));
}

export function playerClubStats(playerId: string, matches: ClubMatch[], players: Map<string, ClubPlayer>, thresholds?: Thresholds): PlayerClubStats {
  const s: PlayerClubStats = {
    matches: 0, record: wl(), games: wl(), pointsFor: 0, pointsAgainst: 0, close: wl(), comebacks: [], lostLeads: [], dominated: 0,
    gamePoints: { had: 0, won: 0 }, facedGamePoints: { faced: 0, saved: 0 }, vs: { stronger: wl(), equal: wl(), weaker: wl() },
    byStage: { pool: wl(), knockout: wl(), club: wl() }, partners: [], trackedGames: 0,
  };
  const partners = new Map<string, WinLoss>();
  for (const m of playerMatches(playerId, matches)) {
    const side = sideOf(m, playerId) as Side;
    const won = m.winner === side;
    s.matches++;
    add(s.record, won);
    add(m.stage === 'pool' ? s.byStage.pool : m.stage === 'friendly' ? s.byStage.club : s.byStage.knockout, won);
    const mine = side === 'A' ? m.sideA : m.sideB, theirs = side === 'A' ? m.sideB : m.sideA;
    const kind = mine.length > 1 ? 'doubles' : 'singles';
    const myR = entryRating(mine, players, kind), theirR = entryRating(theirs, players, kind);
    if (myR !== undefined && theirR !== undefined) {
      const gap = theirR - myR;
      add(gap > EVEN_GAP ? s.vs.stronger : gap < -EVEN_GAP ? s.vs.weaker : s.vs.equal, won);
    }
    for (const pid of mine) {
      if (pid === playerId) continue;
      const r = partners.get(pid) ?? wl();
      add(r, won);
      partners.set(pid, r);
    }
    m.games.forEach((g, i) => {
      const me = side === 'A' ? g.a : g.b, them = side === 'A' ? g.b : g.a;
      if (me === them) return;
      const gWon = me > them;
      add(s.games, gWon);
      s.pointsFor += me; s.pointsAgainst += them;
      if (Math.abs(me - them) <= CLOSE_MARGIN) add(s.close, gWon);
      if (!g.points) return;
      s.trackedGames++;
      const an = analyseGame(g.points, m.format.pointsTo, thresholds);
      const momentum = side === 'A' ? an.momentumA : an.momentumB;
      const myGp = side === 'A' ? an.gamePointA : an.gamePointB;
      const theirGp = side === 'A' ? an.gamePointB : an.gamePointA;
      const swing = (): Swing => ({ matchId: m.id, date: m.playedOn, game: i + 1, me: (side === 'A' ? an.fromA : an.fromB) ?? 0, them: (side === 'A' ? an.fromB : an.fromA) ?? 0 });
      if (momentum === 'came-back') s.comebacks.push(swing());
      if (momentum === 'lost-lead') s.lostLeads.push(swing());
      if (momentum === 'dominated') s.dominated++;
      if (myGp) { s.gamePoints.had++; if (gWon) s.gamePoints.won++; }
      if (theirGp) { s.facedGamePoints.faced++; if (gWon) s.facedGamePoints.saved++; }
    });
  }
  s.partners = [...partners.entries()].map(([id, record]) => ({ playerId: id, record }))
    .sort((a, b) => b.record.wins + b.record.losses - (a.record.wins + a.record.losses));
  return s;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
export const winRate = (r: WinLoss) => pct(r.wins, r.wins + r.losses);

/** The size of a swing: how far behind you were (comeback) or ahead (lost lead). */
const gapOf = (sw: Swing) => Math.abs(sw.me - sw.them);
export function biggest(swings: Swing[]): Swing | undefined {
  return [...swings].sort((a, b) => gapOf(b) - gapOf(a))[0];
}

export interface ClubFlag { kind: 'watch' | 'strength'; text: string }

/** Evidence-only notes for a coach. Describes what happened; never says why. Needs at least 4 matches. */
export function playerFlags(s: PlayerClubStats): ClubFlag[] {
  if (s.matches < 4) return [];
  const out: ClubFlag[] = [];
  if (s.lostLeads.length >= 2) {
    const b = biggest(s.lostLeads) as Swing;
    out.push({ kind: 'watch', text: `Lost a lead in ${s.lostLeads.length} games. The biggest was from ${b.me}–${b.them} up.` });
  }
  if (s.gamePoints.had >= 5 && s.gamePoints.won / s.gamePoints.had < 0.7) {
    out.push({ kind: 'watch', text: `Won ${s.gamePoints.won} of ${s.gamePoints.had} games after reaching game point.` });
  }
  const closeN = s.close.wins + s.close.losses;
  if (closeN >= 4 && s.close.wins / closeN <= 0.35) {
    out.push({ kind: 'watch', text: `Won ${s.close.wins} of ${closeN} close games (decided by ${CLOSE_MARGIN} points or fewer).` });
  }
  const weakN = s.vs.weaker.wins + s.vs.weaker.losses;
  if (weakN >= 3 && s.vs.weaker.losses >= 2) {
    out.push({ kind: 'watch', text: `Lost ${s.vs.weaker.losses} of ${weakN} matches against lower-rated opponents.` });
  }
  if (s.comebacks.length >= 2) {
    const b = biggest(s.comebacks) as Swing;
    out.push({ kind: 'strength', text: `Came back to win ${s.comebacks.length} games. The biggest was from ${b.me}–${b.them} down.` });
  }
  if (s.vs.stronger.wins >= 2) {
    out.push({ kind: 'strength', text: `Beat higher-rated opponents ${s.vs.stronger.wins} times (of ${s.vs.stronger.wins + s.vs.stronger.losses}).` });
  }
  if (s.dominated >= 3) out.push({ kind: 'strength', text: `Won ${s.dominated} games comfortably without falling behind.` });
  return out;
}

export interface SquadRow {
  playerId: string;
  name: string;
  matches: number;
  winPct: number | null;
  closePct: number | null;
  comebacks: number;
  lostLeads: number;
  closing: number | null;
}

export function squadTable(players: ClubPlayer[], matches: ClubMatch[], thresholds?: Thresholds): SquadRow[] {
  const map = new Map(players.map((p) => [p.id, p]));
  return players.map((p) => {
    const s = playerClubStats(p.id, matches, map, thresholds);
    return {
      playerId: p.id, name: p.name, matches: s.matches, winPct: winRate(s.record), closePct: winRate(s.close),
      comebacks: s.comebacks.length, lostLeads: s.lostLeads.length, closing: pct(s.gamePoints.won, s.gamePoints.had),
    };
  }).filter((r) => r.matches > 0);
}

/** Squad-wide numbers for the coach's overview. */
export function squadTotals(rows: SquadRow[]): { players: number; lostLeads: number; comebacks: number; avgClosing: number | null } {
  const closing = rows.map((r) => r.closing).filter((c): c is number => c !== null);
  return {
    players: rows.length,
    lostLeads: rows.reduce((n, r) => n + r.lostLeads, 0),
    comebacks: rows.reduce((n, r) => n + r.comebacks, 0),
    avgClosing: closing.length ? Math.round(closing.reduce((a, b) => a + b, 0) / closing.length) : null,
  };
}
