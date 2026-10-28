import type { Match } from './types';

export interface WinLoss { wins: number; losses: number }
export interface RecordSummary { overall: WinLoss; singles: WinLoss; doubles: WinLoss; incomplete: number }

const add = (r: WinLoss, won: boolean) => (won ? r.wins++ : r.losses++);

/** Win–loss record from active matches. Doubles includes mixed. Walkovers and retirements count. */
export function recordSummary(matches: Match[]): RecordSummary {
  const s: RecordSummary = { overall: { wins: 0, losses: 0 }, singles: { wins: 0, losses: 0 }, doubles: { wins: 0, losses: 0 }, incomplete: 0 };
  for (const m of matches) {
    if (m.deletedAt !== undefined) continue;
    add(s.overall, m.won);
    add(m.type === 'singles' ? s.singles : s.doubles, m.won);
    if (m.status === 'incomplete') s.incomplete++;
  }
  return s;
}

export function winPct(r: WinLoss): number | null {
  const n = r.wins + r.losses;
  return n === 0 ? null : Math.round((r.wins / n) * 100);
}

/** DUPR ratings are shown exactly as DUPR shows them: three decimals (3.905, not 3.90). */
export function fmtRating(v: number): string {
  return (Math.round(v * 1000) / 1000).toFixed(3);
}
