/**
 * Side-out scoring (traditional pickleball). Only the serving side scores. In doubles each side has two servers; a game
 * starts at "0-0-2" (the first serving side has only one server), then a lost rally goes to the second server, then a
 * side out. In singles a lost rally is a side out. Everything is replayed from the rally list, so undo is just "drop
 * the last rally".
 */
export type Side = 'A' | 'B';

export interface SideOutState {
  a: number;
  b: number;
  /** Scored points only, in order (what the rest of the app reads). */
  points: string;
  serving: Side;
  /** 1 or 2 (doubles); always 1 in singles. */
  server: 1 | 2;
  /** The referee's call: serving score – receiving score – server ("4-2-1"; singles "4-2"). */
  call: string;
}

export function replaySideOut(rallies: string, firstServe: Side, doubles: boolean): SideOutState {
  let a = 0, b = 0, points = '';
  let serving: Side = firstServe;
  let server: 1 | 2 = doubles ? 2 : 1; // 0-0-2 start
  for (const r of rallies) {
    if (r !== 'A' && r !== 'B') continue;
    if (r === serving) {
      if (r === 'A') a++; else b++;
      points += r;
    } else if (doubles && server === 1) {
      server = 2;
    } else {
      serving = serving === 'A' ? 'B' : 'A';
      server = 1;
    }
  }
  const sv = serving === 'A' ? a : b, rc = serving === 'A' ? b : a;
  return { a, b, points, serving, server, call: doubles ? `${sv}-${rc}-${server}` : `${sv}-${rc}` };
}

/** Rally scoring: every rally is a point for its winner. */
export function replayRally(rallies: string): { a: number; b: number; points: string } {
  const points = rallies.replace(/[^AB]/g, '');
  let a = 0; for (const c of points) if (c === 'A') a++;
  return { a, b: points.length - a, points };
}
