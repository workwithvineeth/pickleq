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

/** Whether a game is finished. With golden point, the first to the target wins (10–10 → next point wins); otherwise win by 2. */
export function gameOver(a: number, b: number, pointsTo: number, golden = false): boolean {
  if (golden) return Math.max(a, b) >= pointsTo;
  return Math.max(a, b) >= pointsTo && Math.abs(a - b) >= 2;
}

/**
 * Game point: one point from winning while ahead (e.g. 10–8). A level golden point (10–10) doesn't count for either side,
 * so a golden-point win isn't mistaken for a comeback.
 */
function onGamePoint(mine: number, theirs: number, pointsTo: number): boolean {
  return mine >= pointsTo - 1 && mine > theirs;
}

/** True at the golden point (e.g. 10–10 in a game to 11 with golden point on). */
export function isGoldenPoint(a: number, b: number, pointsTo: number, golden: boolean): boolean {
  return golden && a === pointsTo - 1 && b === pointsTo - 1;
}

/** Checks a final score typed by hand. Returns a message for the person, or null if it's a valid finished game. */
export function checkFinalScore(a: number, b: number, pointsTo: number, golden: boolean): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Enter both scores';
  if (a === b) return 'A game can’t end level';
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi < pointsTo) return `The winner needs ${pointsTo}`;
  if (golden) return hi > pointsTo ? `With golden point, the winner finishes on exactly ${pointsTo}` : null;
  if (hi - lo < 2) return 'Games are won by 2';
  if (hi > pointsTo && hi - lo !== 2) return `Past ${pointsTo}, the margin must be exactly 2`;
  return null;
}

/**
 * Works out momentum for one game from the order points were won ("A"/"B").
 * Came back: won after trailing by the threshold or more, or after the opponent had game point.
 * Lost a lead: lost after leading by the threshold or more, or after having game point.
 * Dominated: won without ever trailing by 2+, and the loser scored at most dominatedMax.
 * The "from" score is the moment of the biggest lead (or the first game point if the lead never reached the threshold).
 */
export function analyseGame(points: string, pointsTo: PointsTo, t: Thresholds = DEFAULT_THRESHOLDS, golden = false): GameAnalysis {
  const thr = leadThreshold(pointsTo, t);
  let a = 0, b = 0;
  let maxLeadA = 0, atMaxLeadA: [number, number] | null = null;
  let maxLeadB = 0, atMaxLeadB: [number, number] | null = null;
  let firstGpA: [number, number] | null = null, firstGpB: [number, number] | null = null;
  for (const p of points) {
    if (gameOver(a, b, pointsTo, golden)) break;
    if (p === 'A') a++; else if (p === 'B') b++; else continue;
    if (a - b > maxLeadA) { maxLeadA = a - b; atMaxLeadA = [a, b]; }
    if (b - a > maxLeadB) { maxLeadB = b - a; atMaxLeadB = [a, b]; }
    if (!gameOver(a, b, pointsTo, golden)) {
      if (!firstGpA && onGamePoint(a, b, pointsTo)) firstGpA = [a, b];
      if (!firstGpB && onGamePoint(b, a, pointsTo)) firstGpB = [a, b];
    }
  }
  const complete = gameOver(a, b, pointsTo, golden);
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
