import type { PublicTournament } from './backend';
import { matchView } from './liveView';
import { winEstimate, type WinEstimate } from './winPredictor';

type PublicMatch = PublicTournament['matches'][number];

/** What the live score cards show under the score (Home, Live, Event and TV only — never the referee or the desk). */
export interface WinBar { show: boolean; label: string; a: string; b: string; wa: string; note: string; clsA: string; clsB: string; bar: string }

export const NO_WIN_BAR: WinBar = { show: false, label: '', a: '', b: '', wa: '50%', note: '', clsA: '', clsB: '', bar: '' };

const first = (side: string) => side.split(' / ').map((n) => n.split(/\s+/)[0]).join(' & ');

/** Turns an estimate into the bar's words. The leader is ball-yellow, the other muted; it is always an estimate. */
export function winBarFrom(e: WinEstimate | null, nameA: string, nameB: string): WinBar {
  if (!e) return NO_WIN_BAR;
  const lead = e.a >= e.b;
  return {
    show: true,
    label: 'Win chance · estimate',
    a: `${first(nameA)} ${e.a}%`,
    b: `${first(nameB)} ${e.b}%`,
    wa: `${e.a}%`,
    note: e.basis === 'dupr' ? 'Before the match: from DUPR' : e.basis === 'rallies' ? 'From every rally so far' : 'From DUPR and every rally so far',
    clsA: lead ? 'wp-lead' : 'wp-other',
    clsB: lead ? 'wp-other' : 'wp-lead',
    // A's share on the left, B's on the right; the leader's part is ball-yellow, the other muted.
    bar: `background:linear-gradient(90deg,${lead ? '#D9F24A' : 'rgba(159,180,166,.55)'} 0 ${e.a}%,${lead ? 'rgba(159,180,166,.35)' : '#D9F24A'} ${e.a}% 100%)`,
  };
}

/**
 * The win chance for a live match in the public scores. DUPR comes from the entry when the public data carries it
 * (`duprs`, one per player); until then every team counts as unrated, so the bar appears after 10 rallies.
 * It never throws: a problem just hides the bar.
 */
export function liveWinBar(d: PublicTournament, m: PublicMatch): WinBar {
  try {
    if (m.status !== 'live' || !m.entryA || !m.entryB) return NO_WIN_BAR;
    const v = matchView(d, m);
    const entry = (id: string) => d.entries.find((x) => x.id === id) as (PublicTournament['entries'][number] & { duprs?: (number | null | undefined)[] }) | undefined;
    const ratings = (id: string) => { const e = entry(id); return (e?.duprs ?? e?.names.map(() => undefined) ?? [undefined]).map((x) => (typeof x === 'number' ? x : undefined)); };
    const ralliesA = m.games.reduce((s, g) => s + g.a, 0), ralliesB = m.games.reduce((s, g) => s + g.b, 0);
    const e = winEstimate({
      ratingsA: ratings(m.entryA), ratingsB: ratings(m.entryB), ralliesA, ralliesB,
      gamesA: v.gamesA, gamesB: v.gamesB, pointsA: v.pointsA, pointsB: v.pointsB,
      pointsTo: v.format.pointsTo, bestOf: v.format.bestOf, golden: v.format.golden, doubles: v.division?.kind !== 'singles',
    });
    return winBarFrom(e, v.a, v.b);
  } catch { return NO_WIN_BAR; }
}

/** The bar's markup for the prototype pages (holes are filled by PrototypeScreen). `p` is the value path, e.g. "sel.win". */
export const winBarHtml = (p: string) => `<sc-if value="{{${p}.show}}" hint-placeholder-val="{{ false }}"><div class="wp" role="img" aria-label="{{${p}.label}}: {{${p}.a}}, {{${p}.b}}. {{${p}.note}}."><div class="between" style="gap:10px;flex-wrap:wrap"><span class="cap">{{${p}.label}}</span><span style="font-size:13px"><b class="{{${p}.clsA}}">{{${p}.a}}</b> · <b class="{{${p}.clsB}}">{{${p}.b}}</b></span></div><div class="wp-bar" style="{{${p}.bar}}"></div><span class="mut" style="font-size:12px">{{${p}.note}}</span></div></sc-if>`;

