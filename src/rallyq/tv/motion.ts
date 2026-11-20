import { replaySideOut } from '../../club/domain/sideout';
import { gameOver } from '../../club/domain/momentum';
import type { ClubGame } from '../../club/types';

/**
 * Venue TV motion, the team's Motion Lab picks: score "count", serve "pulse", game/match point chip slide, finished
 * match hold and fade. CSS only, transform and opacity only (TV browsers are slow to repaint backgrounds). With reduced
 * motion every animation becomes a short opacity fade. Timings copy design-lab/rallyq/motion-lab.html.
 */
export const MOTION_CSS = `
@keyframes rqTick0{from{transform:translateY(35%);opacity:.4}to{transform:none;opacity:1}}
@keyframes rqTick1{from{transform:translateY(35%);opacity:.4}to{transform:none;opacity:1}}
.rqm-t0{display:inline-block;animation:rqTick0 .1s ease-out}
.rqm-t1{display:inline-block;animation:rqTick1 .1s ease-out}
@keyframes rqPulse{0%{transform:scale(.2);opacity:0}60%{transform:scale(1.25);opacity:1}100%{transform:none;opacity:1}}
.rqm-srv{display:inline-block;width:.5em;height:.5em;border-radius:50%;margin-right:.4em;vertical-align:.1em;background:var(--ball,#D9F24A);opacity:0}
.rqm-srv.on{opacity:1;animation:rqPulse .42s ease-out}
@keyframes rqSlide0{from{transform:translateX(12px);opacity:0}to{transform:none;opacity:1}}
@keyframes rqSlide1{from{transform:translateX(12px);opacity:0}to{transform:none;opacity:1}}
.rqm-gpl{display:inline-flex;align-items:center;vertical-align:middle;min-height:1.9em;padding:0 .7em;margin-left:.6em;border-radius:999px;background:var(--coral,#FF655C);color:#1A0603;font-family:'DM Sans',system-ui,sans-serif;font-size:max(11px,2.2vh);font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.rqm-gpl:empty{display:none}
.rqm-gpl.gold{background:var(--gold,#E8C35A);color:#2A1D00}
.rqm-p0{animation:rqSlide0 .25s cubic-bezier(.23,1,.32,1)}
.rqm-p1{animation:rqSlide1 .25s cubic-bezier(.23,1,.32,1)}
@keyframes rqFade0{from{opacity:0}to{opacity:1}}
@keyframes rqFade1{from{opacity:0}to{opacity:1}}
@keyframes rqRiseF0{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes rqRiseF1{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
.rqm-f0{animation:rqRiseF0 .45s cubic-bezier(.2,.8,.2,1)}
.rqm-f1{animation:rqRiseF1 .45s cubic-bezier(.2,.8,.2,1)}
.rqm-hold{box-shadow:inset 0 0 0 4px var(--gold,#E8C35A)!important}
.rqm-win{margin-right:.6em;color:var(--gold,#E8C35A);font-size:.7em;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.rqm-win:empty{display:none}
.rqm-acc{color:var(--ball,#D9F24A)}
.rqm-stale{background:var(--coral,#FF655C)!important;color:#1A0603!important}
.rqm-muted{color:var(--mut,#9FB4A6)!important}
.rqm-skel span,.rqm-skel .disp{color:transparent!important;background:var(--c2,#133022);border-radius:8px}
.rqm-skel .rqm-srv,.rqm-skel .rqm-gpl,.rqm-skel .rqm-win{display:none}
@media (prefers-reduced-motion:reduce){
.rqm-t0,.rqm-p0,.rqm-f0,.rqm-srv.on{animation:rqFade0 .15s ease-out}
.rqm-t1,.rqm-p1,.rqm-f1{animation:rqFade1 .15s ease-out}}
`;
/** How long a finished match stays on its court (gold ring, "Winners") before the next match fades in. */
export const HOLD_MS = 2500;
/** The board is called stale (never shown as live) after this many failed polls in a row, or this long without one. */
export const STALE_FAILURES = 2;
export const STALE_MS = 60_000;

/** Courts whose match changed since the last update while the old match is done: court → the finished match id. */
export function finishedHandOffs(last: Record<number, string>, now: { court: number; id: string }[], done: (id: string) => boolean): Record<number, string> {
  return Object.fromEntries(now.filter(({ court, id }) => last[court] && last[court] !== id && done(last[court])).map(({ court }) => [court, last[court]]));
}

/** Class for each score: the ball accent on the leader only, plain chalk for both when level. */
export function leadAccent(a: number | string, b: number | string): { a: string; b: string } {
  if (a === '' || b === '' || a === b) return { a: '', b: '' };
  return Number(a) > Number(b) ? { a: 'rqm-acc', b: '' } : { a: '', b: 'rqm-acc' };
}

/** Milliseconds between count steps when several points arrive in one update. */
export const COUNT_STEP_MS = 110;

/** Which side serves and the referee's call, for a side-out game in progress. Null for rally scoring or a finished game. */
export function serveOf(game: ClubGame | undefined, doubles: boolean, over: boolean): { side: 'A' | 'B'; call: string } | null {
  if (!game || over || game.mode !== 'sideout' || !game.serve) return null;
  const s = replaySideOut(game.rallies ?? '', game.serve, doubles);
  return { side: s.serving, call: s.call };
}

/** "Match point" / "Game point" ("Golden point" at a golden-point decider) when the next rally can end the game for one side; '' otherwise. */
export function pointLabel(a: number, b: number, pointsTo: number, golden: boolean, gamesA: number, gamesB: number, needed: number): string {
  if (gameOver(a, b, pointsTo, golden)) return '';
  const aCan = gameOver(a + 1, b, pointsTo, golden), bCan = gameOver(a, b + 1, pointsTo, golden);
  if (!aCan && !bCan) return '';
  // Golden point (sudden death at the deciding score): the next rally wins it for either side.
  if (golden && aCan && bCan) return 'Golden point';
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
