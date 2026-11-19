// Shareable recap card (Player Studio): one tournament's official results from your side, ready to draw as an image.
// Only your own name, club and results are on it: no partner, opponent, phone or email.
import type { OfficialMatch } from './playerStudio';

export type Finish = 'Champion' | 'Runner-up' | 'Finalist' | 'Semi-finalist' | 'Quarter-finalist' | 'Pool stage';

export interface Recap {
  key: string;
  tournament: string;
  club: string;
  date: string;
  division?: string;
  kind?: 'singles' | 'doubles';
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  finish: Finish;
  /** The best moment: a game won from behind, from the point-by-point record. */
  comeback?: { from: string; final: string; stage: string };
  /** Your lead after every point of the featured game (positive = you ahead), for the momentum line. */
  lead?: number[];
  /** The featured game's final score from your side, e.g. "11–9". */
  featured?: string;
  headline: string;
}

const STAGE_ORDER = { friendly: 0, pool: 1, qf: 2, sf: 3, final: 4 } as const;
const STAGE_WORD: Record<string, string> = { pool: 'pool game', qf: 'quarter-final', sf: 'semi-final', final: 'final', friendly: 'match' };

/** Your lead after each point of one game ("A"/"B" point order), from your side of the net. */
export function leadLine(points: string, mySide: 'A' | 'B'): number[] {
  let lead = 0;
  const out = [0];
  for (const ch of points) {
    if (ch !== 'A' && ch !== 'B') continue;
    lead += ch === mySide ? 1 : -1;
    out.push(lead);
  }
  return out;
}

/** How far behind you were in a game you won (0 if you never trailed), and the score at that moment. */
function deepestDeficit(points: string, mySide: 'A' | 'B'): { deficit: number; you: number; them: number } {
  let you = 0, them = 0, worst = { deficit: 0, you: 0, them: 0 };
  for (const ch of points) {
    if (ch !== 'A' && ch !== 'B') continue;
    if (ch === mySide) you++; else them++;
    if (them - you > worst.deficit) worst = { deficit: them - you, you, them };
  }
  return worst;
}

function finishOf(ms: OfficialMatch[]): Finish {
  const ko = ms.filter((m) => m.stage === 'qf' || m.stage === 'sf' || m.stage === 'final');
  if (!ko.length) return 'Pool stage';
  const top = ko.reduce((a, m) => (STAGE_ORDER[m.stage as keyof typeof STAGE_ORDER] > STAGE_ORDER[a.stage as keyof typeof STAGE_ORDER] ? m : a));
  const won = top.winner === top.mySide;
  if (top.stage === 'final') return won ? 'Champion' : 'Runner-up';
  if (top.stage === 'sf') return won ? 'Finalist' : 'Semi-finalist';
  return won ? 'Semi-finalist' : 'Quarter-finalist';
}

const mine = (g: { a: number; b: number }, side: 'A' | 'B') => (side === 'A' ? { you: g.a, them: g.b } : { you: g.b, them: g.a });

/** One recap per tournament and division you played, newest first. */
export function buildRecaps(official: OfficialMatch[]): Recap[] {
  const groups = new Map<string, OfficialMatch[]>();
  for (const m of official) {
    const key = `${m.tournamentId}|${m.division ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const out: Recap[] = [];
  for (const [key, ms] of groups) {
    const first = ms[0];
    let pf = 0, pa = 0, won = 0;
    let best: { deficit: number; m: OfficialMatch; g: { a: number; b: number; points?: string }; at: { you: number; them: number } } | undefined;
    let closest: { margin: number; m: OfficialMatch; g: { a: number; b: number; points?: string } } | undefined;
    for (const m of ms) {
      if (m.winner === m.mySide) won++;
      for (const g of m.games) {
        const s = mine(g, m.mySide);
        pf += s.you; pa += s.them;
        if (s.you > s.them && g.points) {
          const d = deepestDeficit(g.points, m.mySide);
          if (d.deficit >= 3 && (!best || d.deficit > best.deficit)) best = { deficit: d.deficit, m, g, at: { you: d.you, them: d.them } };
          if (!closest || s.you - s.them < closest.margin) closest = { margin: s.you - s.them, m, g };
        }
      }
    }
    const finish = finishOf(ms);
    const featuredGame = best ?? closest;
    const comeback = best ? { from: `${best.at.you}–${best.at.them}`, final: `${mine(best.g, best.m.mySide).you}–${mine(best.g, best.m.mySide).them}`, stage: STAGE_WORD[best.m.stage] ?? 'match' } : undefined;
    const lost = ms.length - won;
    const headline = finish === 'Champion' ? `Champion${first.division ? ` · ${first.division}` : ''}`
      : comeback ? `Came back from ${comeback.from} to win a ${comeback.stage}`
        : `${won} ${won === 1 ? 'win' : 'wins'} from ${ms.length} ${ms.length === 1 ? 'match' : 'matches'}`;
    out.push({
      key, tournament: first.tournament, club: first.club, date: ms.map((m) => m.playedOn).sort()[0], division: first.division, kind: first.kind,
      played: ms.length, won, lost, pointsFor: pf, pointsAgainst: pa, finish, comeback,
      ...(featuredGame?.g.points ? { lead: leadLine(featuredGame.g.points, featuredGame.m.mySide), featured: `${mine(featuredGame.g, featuredGame.m.mySide).you}–${mine(featuredGame.g, featuredGame.m.mySide).them}` } : {}),
      headline,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** The text that goes with the shared image (WhatsApp caption). */
export function recapCaption(r: Recap, name: string): string {
  const bits = [`${name} at ${r.tournament}${r.division ? ` (${r.division})` : ''}: ${r.finish === 'Pool stage' ? `${r.won}–${r.lost}` : r.finish}.`];
  if (r.comeback) bits.push(`Came back from ${r.comeback.from} to win ${r.comeback.final}.`);
  bits.push('Results on RallyQ: rallyq.in');
  return bits.join(' ');
}
