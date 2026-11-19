import { replaySideOut } from '../../club/domain/sideout';
import type { Side } from '../../club/domain/sideout';
import { pointHistory, scoredPoints } from '../../club/liveView';

type Game = Parameters<typeof scoredPoints>[0];

export interface Rally {
  n: number;
  winner: Side;
  outcome: 'point' | 'side_out' | 'second_server';
  /** The server who played this rally (before any hand-off). */
  serverTeam: Side | null;
  serverNo: 1 | 2 | null;
  /** Referee calls for side-out; A-B scores when the server is unknown. */
  before: string;
  after: string;
}

function sideOutOf(game: Game | undefined, doubles: boolean) {
  if (!game || game.mode === 'rally' || game.rallies === undefined) return null;
  if (!/^[AB]*$/.test(game.rallies)) return null;
  const state = replaySideOut(game.rallies, game.serve ?? 'A', doubles);
  return state.a === game.a && state.b === game.b && state.points === scoredPoints(game, doubles) ? state : null;
}

/** Rebuild from stored history on every call, including after undo. Never invent rallies from a score. */
export function ralliesOf(game: Game | undefined, doubles: boolean): Rally[] {
  if (!game) return [];
  if (game.mode !== 'rally' && game.rallies !== undefined) {
    if (!sideOutOf(game, doubles)) return [];
    const first = game.serve ?? 'A';
    const history = game.rallies;
    let before = replaySideOut('', first, doubles);
    return [...history].map((winner, i) => {
      const after = replaySideOut(history.slice(0, i + 1), first, doubles);
      const rally: Rally = {
        n: i + 1, winner: winner as Side,
        outcome: after.points.length > before.points.length ? 'point' : after.serving !== before.serving ? 'side_out' : 'second_server',
        serverTeam: before.serving, serverNo: before.server,
        before: before.call, after: after.call,
      };
      before = after;
      return rally;
    });
  }
  let before = '0-0';
  return pointHistory(scoredPoints(game, doubles), game.a, game.b).map(row => {
    const after = `${row.a}-${row.b}`;
    const rally: Rally = {
      n: row.index, winner: row.side as Side, outcome: 'point',
      serverTeam: null, serverNo: null, before, after,
    };
    before = after;
    return rally;
  });
}

/** Consecutive scoring rallies at the end; a side-out or second server ends a run. */
export function currentRun(rallies: readonly Rally[]): { team: Side; count: number } | null {
  const last = rallies.at(-1);
  if (!last || last.outcome !== 'point') return null;
  let count = 0;
  for (let i = rallies.length - 1; i >= 0; i--) {
    if (rallies[i].outcome !== 'point' || rallies[i].winner !== last.winner) break;
    count++;
  }
  return { team: last.winner, count };
}

/** The current referee call, only when a complete side-out history is available. */
export function servingNow(game: Game | undefined, doubles: boolean): { team: Side; no: 1 | 2; call: string } | null {
  const state = sideOutOf(game, doubles);
  return state ? { team: state.serving, no: state.server, call: state.call } : null;
}

/** Scores are currently tied after either team trailed by at least three points. */
export function level(rallies: readonly Rally[]): boolean {
  let a = 0, b = 0, trailed = false;
  for (const rally of rallies) {
    if (rally.outcome !== 'point') continue;
    if (rally.winner === 'A') a++; else b++;
    if (Math.abs(a - b) >= 3) trailed = true;
  }
  return trailed && a === b;
}
