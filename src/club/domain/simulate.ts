import type { Format } from '../../domain/types';
import type { ClubGame } from '../types';
import { gameOver } from './momentum';

/** Small repeatable random number generator, so sample data is the same every time. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample point order for one game between two ratings. The stronger side wins more points, and runs of points
 * happen (a side on a run is a little more likely to win the next one), so comebacks and lost leads appear naturally.
 */
export function simulateGame(ratingA: number, ratingB: number, pointsTo: number, rand: () => number): ClubGame {
  const base = 1 / (1 + Math.exp(-(ratingA - ratingB) * 2.4));
  let a = 0, b = 0, points = '', run = 0;
  while (!gameOver(a, b, pointsTo) && points.length < 200) {
    // run > 0: A on a run; run < 0: B on a run.
    const p = Math.min(0.92, Math.max(0.08, base + Math.max(-3, Math.min(3, run)) * 0.045));
    if (rand() < p) { a++; points += 'A'; run = run > 0 ? run + 1 : 1; } else { b++; points += 'B'; run = run < 0 ? run - 1 : -1; }
  }
  return { points, a, b };
}

export function simulateMatch(ratingA: number, ratingB: number, format: Format, rand: () => number): { games: ClubGame[]; winner: 'A' | 'B' } {
  const need = Math.ceil(format.bestOf / 2);
  const games: ClubGame[] = [];
  let wa = 0, wb = 0;
  while (wa < need && wb < need) {
    const g = simulateGame(ratingA, ratingB, format.pointsTo, rand);
    games.push(g);
    if (g.a > g.b) wa++; else wb++;
  }
  return { games, winner: wa > wb ? 'A' : 'B' };
}
