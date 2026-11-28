import type { PublicTournament } from './backend';
import { matchView } from './liveView';
import { winEstimate, type WinEstimate } from './winPredictor';

type PublicMatch = PublicTournament['matches'][number];

/** What the live score cards show under the score (Home, Live, Event and TV only — never the referee or the desk). */
export interface WinBar { show: boolean; label: string; a: string; b: string; wa: string; note: string; clsA: string; clsB: string; bar: string }

export const NO_WIN_BAR: WinBar = { show: false, label: '', a: '', b: '', wa: '50%', note: '', clsA: '', clsB: '', bar: '' };

const first = (side: string) => side.split(' / ').map((n) => n.split(/\s+/)[0]).join(' & ');

/** Turns an estimate into the bar's words. The leader is chalk and bold, the other muted; the bar is Sea (A) and Tide (B); it is always an estimate. */
export function winBarFrom(e: WinEstimate | null, nameA: string, nameB: string): WinBar {
  if (!e) return NO_WIN_BAR;
  const lead = e.a >= e.b;
  return {
    show: true,
    label: 'Win chance · estimate',
    a: `${first(nameA)} ${e.a}%`,
    b: `${first(nameB)} ${e.b}%`,
    wa: `${e.a}%`,
    note: e.basis === 'dupr' ? 'Before the match: from DUPR' : e.basis === 'rallies' ? 'Based on the match score so far' : 'Based on DUPR ratings and the match score so far',
    clsA: lead ? 'wp-lead' : 'wp-other',
    clsB: lead ? 'wp-other' : 'wp-lead',
    // A's share on the left in Sea Glass, B's on the right in Tide Blue (20/10: score surfaces are calm, teams own the bar).
    bar: `background:linear-gradient(90deg,#76E0D0 0 ${e.a}%,#7EAEF2 ${e.a}% 100%)`,
  };
}

/**
 * The win chance for a live match in the public scores. DUPR comes from the entry (`duprs`, one per player, entered by
 * the organisers); a team with an unrated player gets the bar only after 10 rallies.
 * It never throws: a problem just hides the bar.
 */
export function liveWinBar(d: PublicTournament, m: PublicMatch): WinBar {
  try {
    const e = liveWinEstimate(d, m);
    if (!e) return NO_WIN_BAR;
    const v = matchView(d, m);
    return winBarFrom(e, v.a, v.b);
  } catch { return NO_WIN_BAR; }
}

/** The same estimate as the bar, as numbers (the OBS overlay uses it so TV, pages and stream always agree). Null = hide. */
export function liveWinEstimate(d: PublicTournament, m: PublicMatch): WinEstimate | null {
  try {
    if (m.status !== 'live' || !m.entryA || !m.entryB) return null;
    const v = matchView(d, m);
    const entry = (id: string) => d.entries.find((x) => x.id === id) as (PublicTournament['entries'][number] & { duprs?: (number | null | undefined)[] }) | undefined;
    const ratings = (id: string) => { const e = entry(id); return (e?.duprs?.length ? e.duprs : e?.names.map(() => undefined) ?? [undefined]).map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)); };
    // Every rally when the referee scored side-out or rally scoring; otherwise the scored points.
    const won = (g: PublicMatch['games'][number], side: 'A' | 'B') => (g.rallies ? [...g.rallies].filter((c) => c === side).length : side === 'A' ? g.a : g.b);
    const ralliesA = m.games.reduce((s, g) => s + won(g, 'A'), 0), ralliesB = m.games.reduce((s, g) => s + won(g, 'B'), 0);
    const e = winEstimate({
      ratingsA: ratings(m.entryA), ratingsB: ratings(m.entryB), ralliesA, ralliesB,
      gamesA: v.gamesA, gamesB: v.gamesB, pointsA: v.pointsA, pointsB: v.pointsB,
      pointsTo: v.format.pointsTo, bestOf: v.format.bestOf, golden: v.format.golden, doubles: v.division?.kind !== 'singles',
    });
    return e;
  } catch { return null; }
}

/** The bar's markup for the prototype pages (holes are filled by PrototypeScreen). `p` is the value path, e.g. "sel.win". */
export const winBarHtml = (p: string) => `<sc-if value="{{${p}.show}}" hint-placeholder-val="{{ false }}"><div class="wp" role="img" aria-label="{{${p}.label}}: {{${p}.a}}, {{${p}.b}}. {{${p}.note}}."><div class="between" style="gap:10px;flex-wrap:wrap"><span class="cap">{{${p}.label}}</span><span style="font-size:13px"><b class="{{${p}.clsA}}">{{${p}.a}}</b> · <b class="{{${p}.clsB}}">{{${p}.b}}</b></span></div><div class="wp-bar" style="{{${p}.bar}}"></div><span class="mut" style="font-size:12px">{{${p}.note}}</span></div></sc-if>`;

