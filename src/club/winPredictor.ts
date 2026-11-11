/**
 * Win predictor (approved by Vineeth, 11 Nov 2026). A calm estimate, never odds.
 *
 * 1. Team strength = the average DUPR of its players. Before the first rally the chance to win a rally comes from the
 *    DUPR gap: p0 = 1 / (1 + e^(−K·ΔDUPR)), K = WIN_K.
 * 2. Every rally so far moves it: the DUPR prior is worth PRIOR_RALLIES rallies, p = (PRIOR·p0 + won) / (PRIOR + played).
 *    Rallies are the points the referee recorded (the app does not store side-out rallies).
 * 3. The chance to win the game is exact for doubles side-out scoring (only the serving side scores, server 1 then 2,
 *    the first serve of a game is "0-0-2"), to `pointsTo`, win by 2 (or golden point), and then best of N games.
 * Unrated teams: no DUPR prior (p0 = ½) and no bar until MIN_RALLIES_UNRATED rallies have been played.
 */
export const WIN_K = 0.35;
export const PRIOR_RALLIES = 40;
export const MIN_RALLIES_UNRATED = 10;

export interface WinInput {
  /** DUPR of each player on side A / B; undefined = unrated. */
  ratingsA: (number | undefined)[];
  ratingsB: (number | undefined)[];
  /** Rallies won by each side across the match so far (scored points). */
  ralliesA: number;
  ralliesB: number;
  /** Games already won, and the score of the game being played. */
  gamesA: number;
  gamesB: number;
  pointsA: number;
  pointsB: number;
  pointsTo: number;
  bestOf: number;
  golden?: boolean;
  doubles?: boolean;
}

export interface WinEstimate { a: number; b: number; basis: 'dupr' | 'dupr+rallies' | 'rallies' }

const avg = (r: (number | undefined)[]) => (r.length && r.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (r as number[]).reduce((s, x) => s + x, 0) / r.length : undefined);

/** Chance that side A wins any one rally. */
export function rallyChance(ratingA: number | undefined, ratingB: number | undefined, wonA: number, played: number, k = WIN_K, prior = PRIOR_RALLIES): number {
  const p0 = ratingA !== undefined && ratingB !== undefined ? 1 / (1 + Math.exp(-k * (ratingA - ratingB))) : 0.5;
  return (prior * p0 + wonA) / (prior + played);
}

export type Serve = 'A1' | 'A2' | 'B1' | 'B2';

/**
 * Chance that A wins the game from score a–b with `serve` serving, A winning each rally with chance p.
 * Side-out scoring makes the states cyclic (a lost rally scores nothing), so the values are solved by iteration.
 * Scores past pointsTo−1 all-square only matter by their difference, so they fold back onto (pointsTo−1)-all.
 */
const TABLES = new Map<string, (x: number, y: number, s: Serve) => number>();
/** The solved table of game chances for one rally chance (cached: a live page asks many times a minute). */
function gameTable(p: number, T: number, golden: boolean, doubles: boolean): (x: number, y: number, s: Serve) => number {
  const pk = Math.round(p * 2000) / 2000;
  const id = `${pk}|${T}|${golden}|${doubles}`;
  const hit = TABLES.get(id); if (hit) return hit;
  const won = (x: number, y: number) => x >= T && (golden || x - y >= 2);
  const fold = (x: number, y: number): [number, number] => { if (golden) return [x, y]; const m = Math.min(x, y); return m > T - 1 ? [x - (m - (T - 1)), y - (m - (T - 1))] : [x, y]; };
  const serves: Serve[] = doubles ? ['A1', 'A2', 'B1', 'B2'] : ['A1', 'B1'];
  const N = T + 2;
  const key = (x: number, y: number, s: Serve) => (x * N + y) * 4 + serves.indexOf(s);
  const v = new Float64Array(N * N * 4).fill(0.5);
  const val = (x: number, y: number, s: Serve): number => { if (won(x, y)) return 1; if (won(y, x)) return 0; const [fx, fy] = fold(x, y); return v[key(fx, fy, s)]; };
  const next = (s: Serve): Serve => (doubles ? (s === 'A1' ? 'A2' : s === 'A2' ? 'B1' : s === 'B1' ? 'B2' : 'A1') : s === 'A1' ? 'B1' : 'A1');
  for (let it = 0; it < 600; it++) {
    let delta = 0;
    for (let x = N - 1; x >= 0; x--) for (let y = N - 1; y >= 0; y--) {
      if (won(x, y) || won(y, x)) continue;
      for (const s of serves) {
        // Serving side wins the rally: it scores and keeps serving. Loses: second server, or side out.
        const r = s[0] === 'A' ? pk * val(x + 1, y, s) + (1 - pk) * val(x, y, next(s)) : (1 - pk) * val(x, y + 1, s) + pk * val(x, y, next(s));
        const i = key(x, y, s); delta = Math.max(delta, Math.abs(r - v[i])); v[i] = r;
      }
    }
    if (delta < 1e-10) break;
  }
  if (TABLES.size > 400) TABLES.clear();
  TABLES.set(id, val);
  return val;
}

/**
 * Chance that A wins the game from score a–b with `serve` serving, A winning each rally with chance p.
 * Side-out scoring makes the states cyclic (a lost rally scores nothing), so the values are solved by iteration.
 * Scores past pointsTo−1 all-square only matter by their difference, so they fold back onto (pointsTo−1)-all.
 */
export function gameChance(p: number, a: number, b: number, serve: Serve, pointsTo = 11, golden = false, doubles = true): number {
  return gameTable(p, pointsTo, golden, doubles)(a, b, doubles ? serve : (serve[0] + '1') as Serve);
}

/** Chance A wins a game that has not started: either side may serve first (0-0-2), so the two are averaged. */
export function freshGameChance(p: number, pointsTo = 11, golden = false, doubles = true): number {
  const first = doubles ? ['A2', 'B2'] as Serve[] : ['A1', 'B1'] as Serve[];
  return first.reduce((s, x) => s + gameChance(p, 0, 0, x, pointsTo, golden, doubles), 0) / first.length;
}

/** Chance A wins the match, given games won and the current game's chance. */
export function matchChance(gNow: number, gFresh: number, gamesA: number, gamesB: number, bestOf: number): number {
  const need = Math.ceil(bestOf / 2);
  const rest = (x: number, y: number): number => (x >= need ? 1 : y >= need ? 0 : gFresh * rest(x + 1, y) + (1 - gFresh) * rest(x, y + 1));
  if (gamesA >= need) return 1; if (gamesB >= need) return 0;
  return gNow * rest(gamesA + 1, gamesB) + (1 - gNow) * rest(gamesA, gamesB + 1);
}

/** The bar's numbers, or null when there is nothing honest to show yet. */
export function winEstimate(m: WinInput, k = WIN_K): WinEstimate | null {
  const ra = avg(m.ratingsA), rb = avg(m.ratingsB);
  const rated = ra !== undefined && rb !== undefined;
  const played = m.ralliesA + m.ralliesB;
  if (!rated && played < MIN_RALLIES_UNRATED) return null;
  const p = rallyChance(ra, rb, m.ralliesA, played, k);
  const doubles = m.doubles ?? true;
  // The server isn't published: the current game is averaged over who might be serving.
  const serves: Serve[] = doubles ? ['A1', 'A2', 'B1', 'B2'] : ['A1', 'B1'];
  const fresh = m.pointsA === 0 && m.pointsB === 0;
  const gNow = fresh ? freshGameChance(p, m.pointsTo, m.golden, doubles) : serves.reduce((s, x) => s + gameChance(p, m.pointsA, m.pointsB, x, m.pointsTo, m.golden, doubles), 0) / serves.length;
  const gFresh = freshGameChance(p, m.pointsTo, m.golden, doubles);
  const c = matchChance(gNow, gFresh, m.gamesA, m.gamesB, m.bestOf);
  // Never 0 % or 100 % while the match is still on: it is an estimate.
  const a = Math.min(99, Math.max(1, Math.round(c * 100)));
  return { a, b: 100 - a, basis: !rated ? 'rallies' : played === 0 ? 'dupr' : 'dupr+rallies' };
}
