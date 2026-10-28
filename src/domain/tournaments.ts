import { checkGame } from './scoring';
import { CLOSE_MARGIN } from './stats';
import type { Format, Match, MatchType } from './types';

export type Structure = 'round-robin' | 'pools-knockout';
export type Stage = 'pool' | 'knockout';
export const KO_ROUNDS = ['Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Bronze match', 'Final'] as const;
export type KoRound = (typeof KO_ROUNDS)[number];

export const PLACEMENTS = [
  { value: '1', label: '1st · Gold' }, { value: '2', label: '2nd · Silver' }, { value: '3', label: '3rd · Bronze' }, { value: '4', label: '4th' },
  { value: 'qf', label: 'Quarterfinal' }, { value: 'r16', label: 'Round of 16' }, { value: 'pool', label: 'Out in pool' },
] as const;
export type Placement = (typeof PLACEMENTS)[number]['value'];
export const placementLabel = (p?: Placement) => PLACEMENTS.find((x) => x.value === p)?.label;

/** Another team in your pool. "You" are always id ME. */
export interface Team { id: string; name: string }
export const ME = 'me';

/** A result between two other teams, entered only if you want full standings. */
export interface OtherResult { id: string; teamA: string; teamB: string; games: { a: number; b: number }[] }

export interface ScheduleSlot {
  id: string;
  /** yyyy-mm-ddThh:mm, local time */
  at: string;
  stage: Stage;
  round?: KoRound;
  teamId?: string;
  court?: string;
}

export interface TournamentEvent {
  id: string;
  name: string;
  type: MatchType;
  format: Format;
  partnerName?: string;
  structure: Structure;
  teams: Team[];
  otherResults: OtherResult[];
  schedule: ScheduleSlot[];
  /** Typed in when the full pool table isn't entered. */
  poolPosition?: number;
  poolSize?: number;
  placement?: Placement;
}

export interface ChecklistItem { id: string; text: string; done: boolean }

export interface Tournament {
  id: string;
  name: string;
  /** yyyy-mm-dd */
  startDate: string;
  endDate: string;
  venue?: string;
  events: TournamentEvent[];
  checklist: ChecklistItem[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Stored on a match that was played in a tournament. */
export interface TournamentLink { tournamentId: string; eventId: string; stage: Stage; round?: KoRound; teamId?: string; slotId?: string }

export const STARTER_CHECKLIST = [
  'Paddle and a spare paddle', 'Balls approved for the event', 'Court shoes', 'Water and electrolytes', 'Snacks', 'Towel and spare clothes',
  'Registration confirmed', 'Partner confirmed', 'Schedule and court times checked', 'Warm-up plan',
];

// ---------- the log-a-match link carried in the route ----------
export function encodeLink(l: TournamentLink): string {
  return [l.tournamentId, l.eventId, l.stage, l.round ?? '', l.teamId ?? '', l.slotId ?? ''].map(encodeURIComponent).join('|');
}
export function decodeLink(s: string | undefined): TournamentLink | undefined {
  if (!s) return undefined;
  const [tournamentId, eventId, stage, round, teamId, slotId] = s.split('|').map((x) => { try { return decodeURIComponent(x); } catch { return ''; } });
  if (!tournamentId || !eventId || (stage !== 'pool' && stage !== 'knockout')) return undefined;
  return {
    tournamentId, eventId, stage,
    round: (KO_ROUNDS as readonly string[]).includes(round) ? (round as KoRound) : undefined,
    teamId: teamId || undefined, slotId: slotId || undefined,
  };
}

// ---------- results ----------
const played = (g: { you: number | null; them: number | null }) => g.you !== null && g.them !== null;
export const eventMatches = (matches: Match[], t: Pick<Tournament, 'id'>, eventId?: string) =>
  matches.filter((m) => m.deletedAt === undefined && m.tournament?.tournamentId === t.id && (eventId === undefined || m.tournament.eventId === eventId));

interface Result { a: string; b: string; gamesA: number; gamesB: number; pointsA: number; pointsB: number }

function resultsFor(ev: TournamentEvent, mine: Match[]): Result[] {
  const ids = new Set([ME, ...ev.teams.map((t) => t.id)]);
  const out: Result[] = [];
  for (const m of mine) {
    const team = m.tournament?.teamId;
    if (m.tournament?.stage !== 'pool' || !team || !ids.has(team)) continue;
    const gs = m.games.filter(played);
    out.push({ a: ME, b: team, gamesA: gs.filter((g) => g.you! > g.them!).length, gamesB: gs.filter((g) => g.them! > g.you!).length,
      pointsA: gs.reduce((n, g) => n + g.you!, 0), pointsB: gs.reduce((n, g) => n + g.them!, 0) });
  }
  for (const r of ev.otherResults) {
    if (!ids.has(r.teamA) || !ids.has(r.teamB)) continue;
    out.push({ a: r.teamA, b: r.teamB, gamesA: r.games.filter((g) => g.a > g.b).length, gamesB: r.games.filter((g) => g.b > g.a).length,
      pointsA: r.games.reduce((n, g) => n + g.a, 0), pointsB: r.games.reduce((n, g) => n + g.b, 0) });
  }
  return out;
}

export interface StandingRow { teamId: string; name: string; played: number; won: number; lost: number; pointsFor: number; pointsAgainst: number; diff: number; rank: number }
export interface Standings { rows: StandingRow[]; entered: number; total: number; complete: boolean }

/**
 * Pool table. Order: wins; then, among teams level on wins, wins against each other;
 * then point difference against each other; then overall point difference; then points scored.
 */
export function standings(ev: TournamentEvent, matches: Match[], youName = 'You'): Standings {
  const teams = [{ id: ME, name: youName }, ...ev.teams];
  const results = resultsFor(ev, matches);
  const pairKey = (x: string, y: string) => [x, y].sort().join('|');
  const pairs = new Set(results.map((r) => pairKey(r.a, r.b)));
  const n = teams.length;
  const total = (n * (n - 1)) / 2;

  const tally = (ids: Set<string>) => {
    const t = new Map(teams.filter((x) => ids.has(x.id)).map((x) => [x.id, { won: 0, lost: 0, pf: 0, pa: 0, played: 0 }]));
    for (const r of results) {
      if (!ids.has(r.a) || !ids.has(r.b)) continue;
      const A = t.get(r.a)!, B = t.get(r.b)!;
      A.played++; B.played++;
      A.pf += r.pointsA; A.pa += r.pointsB; B.pf += r.pointsB; B.pa += r.pointsA;
      if (r.gamesA > r.gamesB) { A.won++; B.lost++; } else if (r.gamesB > r.gamesA) { B.won++; A.lost++; }
    }
    return t;
  };
  const all = tally(new Set(teams.map((x) => x.id)));
  const ordered = [...teams].sort((x, y) => all.get(y.id)!.won - all.get(x.id)!.won);

  // Break ties inside each group level on wins.
  const out: typeof teams = [];
  for (let i = 0; i < ordered.length;) {
    const w = all.get(ordered[i].id)!.won;
    const group = ordered.filter((x) => all.get(x.id)!.won === w);
    i += group.length;
    if (group.length === 1) { out.push(group[0]); continue; }
    const mini = tally(new Set(group.map((x) => x.id)));
    group.sort((x, y) => {
      const a = mini.get(x.id)!, b = mini.get(y.id)!, A = all.get(x.id)!, B = all.get(y.id)!;
      return (b.won - a.won) || ((b.pf - b.pa) - (a.pf - a.pa)) || ((B.pf - B.pa) - (A.pf - A.pa)) || (B.pf - A.pf) || x.name.localeCompare(y.name);
    });
    out.push(...group);
  }
  const rows = out.map((x, i) => {
    const s = all.get(x.id)!;
    return { teamId: x.id, name: x.name, played: s.played, won: s.won, lost: s.lost, pointsFor: s.pf, pointsAgainst: s.pa, diff: s.pf - s.pa, rank: i + 1 };
  });
  return { rows, entered: pairs.size, total, complete: n > 1 && pairs.size >= total };
}

export function checkOtherResult(format: Format, teamA: string, teamB: string, games: { a: number | null; b: number | null }[]): string | null {
  if (!teamA || !teamB) return 'Pick both teams';
  if (teamA === teamB) return 'Pick two different teams';
  const filled = games.filter((g) => g.a !== null || g.b !== null);
  if (!filled.length) return 'Enter the score';
  for (const g of filled) {
    const c = checkGame(format, g.a, g.b);
    if (!c.ok) return c.message;
  }
  const need = format.bestOf === 3 ? 2 : 1;
  const wa = filled.filter((g) => g.a! > g.b!).length, wb = filled.filter((g) => g.b! > g.a!).length;
  if (format.bestOf === 3 && filled.length === 3 && (filled[0].a! > filled[0].b!) === (filled[1].a! > filled[1].b!)) return 'A third game is only played when the first two are split';
  if (Math.max(wa, wb) !== need || (format.bestOf === 1 && filled.length > 1)) return format.bestOf === 3 ? 'Best of 3 needs one team to win 2 games' : 'Enter one game';
  return null;
}

// ---------- summary ----------
export interface EventSummary { eventId: string; name: string; wins: number; losses: number; gamesWon: number; gamesLost: number; pointsFor: number; pointsAgainst: number; close: number; cameBack: number; lostLead: number; placement?: Placement; bestKo?: KoRound }

export function eventSummary(ev: TournamentEvent, matches: Match[]): EventSummary {
  const s: EventSummary = { eventId: ev.id, name: ev.name, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0, close: 0, cameBack: 0, lostLead: 0, placement: ev.placement };
  for (const m of matches) {
    if (m.won) s.wins++; else s.losses++;
    for (const g of m.games.filter(played)) {
      if (g.you! > g.them!) s.gamesWon++; else s.gamesLost++;
      s.pointsFor += g.you!; s.pointsAgainst += g.them!;
      if (Math.abs(g.you! - g.them!) <= CLOSE_MARGIN) s.close++;
      if (g.momentum === 'came-back') s.cameBack++;
      if (g.momentum === 'lost-lead') s.lostLead++;
    }
    const r = m.tournament?.round;
    if (m.tournament?.stage === 'knockout' && r && (!s.bestKo || KO_ROUNDS.indexOf(r) > KO_ROUNDS.indexOf(s.bestKo))) s.bestKo = r;
  }
  return s;
}

export function tournamentSummary(t: Tournament, matches: Match[]): { events: EventSummary[]; wins: number; losses: number; pointsFor: number; pointsAgainst: number; medals: number } {
  const events = t.events.map((ev) => eventSummary(ev, eventMatches(matches, t, ev.id)));
  return {
    events,
    wins: events.reduce((n, e) => n + e.wins, 0), losses: events.reduce((n, e) => n + e.losses, 0),
    pointsFor: events.reduce((n, e) => n + e.pointsFor, 0), pointsAgainst: events.reduce((n, e) => n + e.pointsAgainst, 0),
    medals: events.filter((e) => e.placement === '1' || e.placement === '2' || e.placement === '3').length,
  };
}

// ---------- dates ----------
export type When = { kind: 'upcoming'; days: number } | { kind: 'on' ; day: number; of: number } | { kind: 'past' };
const dayNum = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);

export function when(t: Pick<Tournament, 'startDate' | 'endDate'>, todayIso: string): When {
  const d = dayNum(todayIso), s = dayNum(t.startDate), e = dayNum(t.endDate);
  if (d < s) return { kind: 'upcoming', days: s - d };
  if (d <= e) return { kind: 'on', day: d - s + 1, of: e - s + 1 };
  return { kind: 'past' };
}

export function whenLabel(w: When): string {
  if (w.kind === 'upcoming') return w.days === 1 ? 'Tomorrow' : `In ${w.days} days`;
  if (w.kind === 'on') return w.of > 1 ? `Day ${w.day} of ${w.of}` : 'Today';
  return 'Finished';
}

/** The tournament happening now, or the soonest upcoming one. */
export function nextTournament(list: Tournament[], todayIso: string): Tournament | undefined {
  return list.filter((t) => t.deletedAt === undefined && when(t, todayIso).kind !== 'past').sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}

/** Earliest schedule slot that has no result logged yet, across all events. */
export function nextSlot(t: Tournament, matches: Match[]): { event: TournamentEvent; slot: ScheduleSlot } | undefined {
  const done = new Set(eventMatches(matches, t).map((m) => m.tournament?.slotId).filter(Boolean));
  const slots = t.events.flatMap((event) => event.schedule.filter((s) => !done.has(s.id)).map((slot) => ({ event, slot })));
  slots.sort((a, b) => a.slot.at.localeCompare(b.slot.at));
  return slots[0];
}

export function checkTournament(t: { name: string; startDate: string; endDate: string; events: { name: string }[] }): string | null {
  if (!t.name.trim()) return 'Give the tournament a name';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate)) return 'Pick the start date';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.endDate)) return 'Pick the end date';
  if (t.endDate < t.startDate) return 'The end date can’t be before the start';
  if (!t.events.length) return 'Add at least one event';
  if (t.events.some((e) => !e.name.trim())) return 'Give each event a name, like Men’s doubles 4.0';
  return null;
}

export function slotLabel(s: ScheduleSlot, ev: TournamentEvent): string {
  const team = s.teamId ? ev.teams.find((t) => t.id === s.teamId)?.name : undefined;
  const what = s.stage === 'knockout' ? (s.round ?? 'Knockout') : 'Pool';
  return `${what}${team ? ` vs ${team}` : ''}${s.court ? ` · Court ${s.court}` : ''}`;
}

export function fmtSlotTime(at: string): string {
  const d = new Date(`${at}:00`);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
