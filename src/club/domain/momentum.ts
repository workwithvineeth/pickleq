import type { PointsTo } from '../../domain/types';
import { DEFAULT_THRESHOLDS, type GameAnalysis, type Thresholds } from '../types';

/** A lead this big (or bigger) counts for "came back" and "lost a lead". */
export function leadThreshold(pointsTo: PointsTo, t: Thresholds = DEFAULT_THRESHOLDS): number {
  return pointsTo === 21 ? t.lead21 : pointsTo === 15 ? t.lead15 : t.lead11;
}

/** "Dominated" means the loser scored at most this many points (and the winner never trailed by 2 or more). */
export function dominatedMax(pointsTo: PointsTo): number {
  return pointsTo === 21 ? 9 : pointsTo === 15 ? 6 : 4;
}

export function gameOver(a: number, b: number, pointsTo: number): boolean {
  return Math.max(a, b) >= pointsTo && Math.abs(a - b) >= 2;
}

/** One point from winning: reaching pointsTo next point would win by 2. */
function onGamePoint(mine: number, theirs: number, pointsTo: number): boolean {
  return mine >= pointsTo - 1 && mine > theirs;
}

/**
 * Works out momentum for one game from the order points were won ("A"/"B").
 * Came back: won after trailing by the threshold or more, or after the opponent had game point.
 * Lost a lead: lost after leading by the threshold or more, or after having game point.
 * Dominated: won without ever trailing by 2+, and the loser scored at most dominatedMax.
 * The "from" score is the moment of the biggest lead (or the first game point if the lead never reached the threshold).
 */
export function analyseGame(points: string, pointsTo: PointsTo, t: Thresholds = DEFAULT_THRESHOLDS): GameAnalysis {
  const thr = leadThreshold(pointsTo, t);
  let a = 0, b = 0;
  let maxLeadA = 0, atMaxLeadA: [number, number] | null = null;
  let maxLeadB = 0, atMaxLeadB: [number, number] | null = null;
  let firstGpA: [number, number] | null = null, firstGpB: [number, number] | null = null;
  for (const p of points) {
    if (gameOver(a, b, pointsTo)) break;
    if (p === 'A') a++; else if (p === 'B') b++; else continue;
    if (a - b > maxLeadA) { maxLeadA = a - b; atMaxLeadA = [a, b]; }
    if (b - a > maxLeadB) { maxLeadB = b - a; atMaxLeadB = [a, b]; }
    if (!gameOver(a, b, pointsTo)) {
      if (!firstGpA && onGamePoint(a, b, pointsTo)) firstGpA = [a, b];
      if (!firstGpB && onGamePoint(b, a, pointsTo)) firstGpB = [a, b];
    }
  }
  const complete = gameOver(a, b, pointsTo);
  const base: GameAnalysis = { a, b, momentumA: 'neither', momentumB: 'neither', gamePointA: !!firstGpA, gamePointB: !!firstGpB, complete };
  if (!complete || points.length === 0) return base;
  const aWon = a > b;
  // The loser's biggest lead is the winner's biggest deficit.
  const loserLead = aWon ? maxLeadB : maxLeadA;
  const loserLeadAt = aWon ? atMaxLeadB : atMaxLeadA;
  const loserGp = aWon ? firstGpB : firstGpA;
  let swing: [number, number] | null = null;
  if (loserLead >= thr) swing = loserLeadAt;
  else if (loserGp) swing = loserGp;
  if (swing) {
    return { ...base, momentumA: aWon ? 'came-back' : 'lost-lead', momentumB: aWon ? 'lost-lead' : 'came-back', fromA: swing[0], fromB: swing[1] };
  }
  const loserScore = aWon ? b : a;
  if (loserLead < 2 && loserScore <= dominatedMax(pointsTo)) {
    return { ...base, momentumA: aWon ? 'dominated' : 'neither', momentumB: aWon ? 'neither' : 'dominated' };
  }
  return base;
}

/** Points scored so far in a points string. */
export function tally(points: string): { a: number; b: number } {
  let a = 0, b = 0;
  for (const p of points) { if (p === 'A') a++; else if (p === 'B') b++; }
  return { a, b };
}
