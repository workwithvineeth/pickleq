import { replaySideOut } from '../../club/domain/sideout';
import { gameOver } from '../../club/domain/momentum';
import type { ClubGame } from '../../club/types';

/**
 * Venue TV motion, the team's Motion Lab picks: score "count", serve "pulse", point flash "wash". CSS only; every
 * animation is off when the viewer asks for reduced motion. The timings copy design-lab/rallyq/motion-lab.html.
 */
export const MOTION_CSS = `
@keyframes rqTick0{from{transform:translateY(35%);opacity:.4}to{transform:none;opacity:1}}
@keyframes rqTick1{from{transform:translateY(35%);opacity:.4}to{transform:none;opacity:1}}
.rqm-t0{display:inline-block;animation:rqTick0 .1s ease-out}
.rqm-t1{display:inline-block;animation:rqTick1 .1s ease-out}
@keyframes rqPulse{0%{transform:scale(.2);opacity:0}60%{transform:scale(1.25);opacity:1}100%{transform:none;opacity:1}}
.rqm-srv{display:inline-block;width:.5em;height:.5em;border-radius:50%;margin-right:.4em;vertical-align:.1em;background:#D9F24A;opacity:0}
.rqm-srv.on{opacity:1;animation:rqPulse .42s ease-out}
@keyframes rqWash0{from{background-color:#22401F}}
@keyframes rqWash1{from{background-color:#22401F}}
.rqm-w0{animation:rqWash0 .7s ease-out}
.rqm-w1{animation:rqWash1 .7s ease-out}
.rqm-gpl{color:#E8C35A;font-size:.62em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-left:.5em}
@media (prefers-reduced-motion:reduce){.rqm-t0,.rqm-t1,.rqm-w0,.rqm-w1,.rqm-srv.on{animation:none}}
`;
/** Milliseconds between count steps when several points arrive in one update. */
export const COUNT_STEP_MS = 110;

/** Which side serves and the referee's call, for a side-out game in progress. Null for rally scoring or a finished game. */
export function serveOf(game: ClubGame | undefined, doubles: boolean, over: boolean): { side: 'A' | 'B'; call: string } | null {
  if (!game || over || game.mode !== 'sideout' || !game.serve) return null;
  const s = replaySideOut(game.rallies ?? '', game.serve, doubles);
  return { side: s.serving, call: s.call };
}

/** "Match point" / "Game point" when the next rally can end the game for one side; '' otherwise. */
export function pointLabel(a: number, b: number, pointsTo: number, golden: boolean, gamesA: number, gamesB: number, needed: number): string {
  if (gameOver(a, b, pointsTo, golden)) return '';
  const aCan = gameOver(a + 1, b, pointsTo, golden), bCan = gameOver(a, b + 1, pointsTo, golden);
  if (!aCan && !bCan) return '';
  const match = (aCan && gamesA === needed - 1) || (bCan && gamesB === needed - 1);
  return match ? 'Match point' : 'Game point';
}

/** The next number to show while counting up to a new score: one step up, or straight there if it went down (undo, new game). */
export function countStep(shown: number, target: number): number {
  return target > shown ? shown + 1 : target;
}

type Seen = { value: string; cls: string };
/**
 * A class that replays its animation each time `value` changes. It alternates two identical animations, because
 * re-adding the same class does not restart a CSS animation. The first time a key is seen nothing animates.
 */
export function flipOnChange(seen: Map<string, Seen>, key: string, value: string, names: [string, string]): string {
  const prev = seen.get(key);
  const cls = !prev ? '' : prev.value !== value ? (prev.cls === names[0] ? names[1] : names[0]) : prev.cls;
  seen.set(key, { value, cls });
  return cls;
}

export type Scores = Record<string, { a: number; b: number }>;
/** One count step for every court: new courts and reduced motion jump straight to the real score. */
export function stepAll(shown: Scores, targets: Scores, reduced: boolean): Scores {
  const next: Scores = {};
  for (const [id, t] of Object.entries(targets)) {
    const p = shown[id];
    next[id] = !p || reduced ? t : { a: countStep(p.a, t.a), b: countStep(p.b, t.b) };
  }
  return next;
}
/** True when every court already shows its real score. */
export function settled(shown: Scores, targets: Scores): boolean {
  return Object.entries(targets).every(([id, t]) => shown[id]?.a === t.a && shown[id]?.b === t.b);
}
