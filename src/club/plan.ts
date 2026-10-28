import type { Format } from '../domain/types';
import { emptySlotState, entryRating, firstKnockoutPairs, KNOCKOUT_SIZES, nextRoundPairs, nextStage, planPoolMatches, scheduleSlots, seedOrder, snakePools, stageForSize, standings, type Qualifier } from './domain/engine';
import type { ClubMatch, ClubPlayer, ClubTournament, Division, DivisionKind, Entry } from './types';

export interface NewDivisionInput {
  name: string;
  kind: DivisionKind;
  format: Format;
  koFormat: Format;
  pools: number;
  advance: number;
  /** Each entry is one player (singles) or two (doubles team). */
  entries: string[][];
}

export interface NewTournamentInput {
  clubId: string;
  name: string;
  startDate: string;
  startTime: string;
  courts: number;
  slotMinutes: number;
  divisions: NewDivisionInput[];
}

export type NewMatchRow = Omit<ClubMatch, 'updatedAt'>;

export interface TournamentRows { tournament: ClubTournament; divisions: Division[]; entries: Entry[]; matches: NewMatchRow[] }

/** Checks a division before it's created. Returns a message for the person, or null if it's fine. */
export function checkDivision(d: NewDivisionInput): string | null {
  if (!d.name.trim()) return 'Give each event a name';
  const need = d.kind === 'doubles' ? 2 : 1;
  if (d.entries.some((e) => e.length !== need)) return d.kind === 'doubles' ? 'Every doubles team needs two players' : 'Each singles entry is one player';
  const ids = d.entries.flat();
  if (new Set(ids).size !== ids.length) return 'A player is entered twice in the same event';
  if (d.entries.length < 2) return 'An event needs at least 2 entries';
  if (d.pools < 1 || d.entries.length < d.pools * 2) return 'Each pool needs at least 2 entries';
  const q = d.pools * d.advance;
  if (d.advance > 0 && !KNOCKOUT_SIZES.includes(q)) return 'Pools × players going through must make 2, 4 or 8 for the knockouts';
  if (d.advance > 0 && Math.min(...poolSizes(d.entries.length, d.pools)) < d.advance) return 'More players go through than some pools have';
  return null;
}

function poolSizes(n: number, pools: number): number[] {
  return Array.from({ length: pools }, (_, i) => Math.floor(n / pools) + (i < n % pools ? 1 : 0));
}

/** Seeds entries by DUPR, snake-seeds them into pools, builds every pool match and gives each one a court and time. */
export function buildTournamentRows(input: NewTournamentInput, players: Map<string, ClubPlayer>, newId: () => string): TournamentRows {
  const tournament: ClubTournament = {
    id: newId(), clubId: input.clubId, name: input.name.trim(), startDate: input.startDate, startTime: input.startTime,
    courts: input.courts, slotMinutes: input.slotMinutes, status: 'draft', isPublic: false, publicSlug: newId().replace(/-/g, '').slice(0, 10),
  };
  const divisions: Division[] = [];
  const entries: Entry[] = [];
  const matches: NewMatchRow[] = [];
  input.divisions.forEach((d, sort) => {
    const div: Division = { id: newId(), tournamentId: tournament.id, clubId: input.clubId, name: d.name.trim(), kind: d.kind, format: d.format, koFormat: d.koFormat, pools: d.pools, advance: d.advance, sort };
    divisions.push(div);
    const ordered = seedOrder(d.entries, (e) => entryRating(e, players, d.kind));
    const pools = snakePools(ordered.length, d.pools);
    const divEntries = ordered.map((ids, i): Entry => ({ id: newId(), divisionId: div.id, clubId: input.clubId, playerIds: ids, seed: i + 1, pool: pools[i] }));
    entries.push(...divEntries);
    const emap = new Map(divEntries.map((e) => [e.id, e]));
    for (const p of planPoolMatches(divEntries)) {
      matches.push({
        id: newId(), clubId: input.clubId, tournamentId: tournament.id, divisionId: div.id, stage: 'pool', pool: p.pool, round: p.round,
        entryA: p.entryA, entryB: p.entryB, sideA: (emap.get(p.entryA) as Entry).playerIds, sideB: (emap.get(p.entryB) as Entry).playerIds,
        format: d.format, games: [], status: 'scheduled', playedOn: input.startDate,
      });
    }
  });
  const plan = scheduleSlots(matches.map((m) => ({ key: m.id, playerIds: [...m.sideA, ...m.sideB] })), input.courts);
  for (const m of matches) { const s = plan.get(m.id); if (s) { m.slot = s.slot; m.court = s.court; } }
  return { tournament, divisions, entries, matches };
}

/**
 * Knockout matches that can be created now: the first round once every pool match is finished,
 * then each later round once both feeder matches are finished. Courts and times follow on after the last slot used.
 */
export function knockoutMatchesToAdd(t: ClubTournament, divisions: Division[], entries: Entry[], matches: ClubMatch[], newId: () => string): NewMatchRow[] {
  const out: NewMatchRow[] = [];
  const emap = new Map(entries.map((e) => [e.id, e]));
  const lastSlot = Math.max(-1, ...matches.filter((m) => m.status !== 'void').map((m) => m.slot ?? -1));
  for (const div of divisions) {
    if (div.advance === 0) continue;
    const dm = matches.filter((m) => m.divisionId === div.id);
    const pool = dm.filter((m) => m.stage === 'pool');
    const ko = dm.filter((m) => m.stage !== 'pool' && m.status !== 'void');
    const make = (stage: ClubMatch['stage'], bracketPos: number, round: number, a: string, b: string): NewMatchRow => ({
      id: newId(), clubId: div.clubId, tournamentId: t.id, divisionId: div.id, stage, bracketPos, round, entryA: a, entryB: b,
      sideA: (emap.get(a) as Entry).playerIds, sideB: (emap.get(b) as Entry).playerIds, format: div.koFormat, games: [], status: 'scheduled', playedOn: t.startDate,
    });
    if (!ko.length) {
      if (!poolsComplete(div.id, matches)) continue;
      const divEntries = entries.filter((e) => e.divisionId === div.id && e.status !== 'withdrawn');
      const qualifiers: Qualifier[] = [];
      const key = new Map<string, number>();
      for (let p = 1; p <= div.pools; p++) {
        const table = standings(divEntries.filter((e) => e.pool === p).map((e) => e.id), pool, (id) => emap.get(id)?.seed ?? 99);
        table.slice(0, div.advance).forEach((row, i) => { qualifiers.push({ entryId: row.entryId, pool: p, place: i + 1 }); key.set(row.entryId, -(row.wins * 1000 + row.diff)); });
      }
      if (!KNOCKOUT_SIZES.includes(qualifiers.length)) continue;
      const stage = stageForSize(qualifiers.length);
      firstKnockoutPairs(qualifiers, (q) => key.get(q.entryId) ?? 0).forEach(([a, b], pos) => out.push(make(stage, pos, 1, a.entryId, b.entryId)));
      continue;
    }
    // Fill in any later-round match whose two feeder matches are finished and that doesn't exist yet.
    const latest = ko.reduce((r, m) => Math.max(r, m.round ?? 1), 1);
    for (let r = 1; r <= latest; r++) {
      const round = ko.filter((m) => (m.round ?? 1) === r);
      const stage = round.length >= 2 ? nextStage(round[0].stage) : null;
      if (!stage) continue;
      const have = new Set(ko.filter((m) => (m.round ?? 1) === r + 1).map((m) => m.bracketPos));
      for (const p of nextRoundPairs(round)) if (!have.has(p.bracketPos)) out.push(make(stage, p.bracketPos, r + 1, p.entryA, p.entryB));
    }
  }
  if (out.length) {
    const state = emptySlotState();
    for (const m of matches) {
      if (m.slot === undefined) continue;
      const s = state.busy.get(m.slot) ?? new Set<string>();
      [...m.sideA, ...m.sideB].forEach((p) => s.add(p));
      state.busy.set(m.slot, s);
      state.used.set(m.slot, Math.max(state.used.get(m.slot) ?? 0, m.court ?? 0));
    }
    const plan = scheduleSlots(out.map((m) => ({ key: m.id, playerIds: [...m.sideA, ...m.sideB] })), t.courts, lastSlot + 1, state);
    for (const m of out) { const s = plan.get(m.id); if (s) { m.slot = s.slot; m.court = s.court; } }
  }
  return out;
}

// ---------- Editing entries after the draw ----------

const unplayed = (m: ClubMatch) => m.status === 'scheduled' || m.status === 'live';
const involves = (m: ClubMatch, entryId: string) => m.entryA === entryId || m.entryB === entryId;

export interface WithdrawPlan {
  /** Pool matches not yet played: cancelled, not counted. */
  voidIds: string[];
  /** Knockout matches not yet played: the opponent goes through. */
  walkovers: { id: string; winner: 'A' | 'B' }[];
}

/** What happens to the matches when an entry withdraws. Played results stay as they are. */
export function planWithdraw(entryId: string, matches: ClubMatch[]): WithdrawPlan {
  const plan: WithdrawPlan = { voidIds: [], walkovers: [] };
  for (const m of matches) {
    if (!unplayed(m) || !involves(m, entryId)) continue;
    if (m.stage === 'pool' || m.stage === 'friendly') plan.voidIds.push(m.id);
    else plan.walkovers.push({ id: m.id, winner: m.entryA === entryId ? 'B' : 'A' });
  }
  return plan;
}

export interface ReplacePlan { playerIds: string[]; matchSides: { id: string; sideA: string[]; sideB: string[] }[] }

/**
 * Swaps one player in an entry for another (a partner change or a substitute). Only matches not yet played change,
 * so past results keep the names of the people who actually played.
 */
export function planReplacePlayer(entry: Entry, oldId: string, newId: string, matches: ClubMatch[]): ReplacePlan | string {
  if (!entry.playerIds.includes(oldId)) return 'That player isn’t in this entry';
  if (oldId === newId) return 'Choose a different player';
  if (entry.playerIds.includes(newId)) return 'That player is already in this entry';
  const playerIds = entry.playerIds.map((p) => (p === oldId ? newId : p));
  const swap = (side: string[]) => side.map((p) => (p === oldId ? newId : p));
  const matchSides = matches.filter((m) => unplayed(m) && involves(m, entry.id)).map((m) => ({
    id: m.id, sideA: m.entryA === entry.id ? swap(m.sideA) : m.sideA, sideB: m.entryB === entry.id ? swap(m.sideB) : m.sideB,
  }));
  return { playerIds, matchSides };
}

/** Players already entered in a division (active entries), so the same person can't be entered twice. */
export function enteredPlayers(entries: Entry[], divisionId: string): Set<string> {
  return new Set(entries.filter((e) => e.divisionId === divisionId && e.status !== 'withdrawn').flatMap((e) => e.playerIds));
}

/**
 * A late entry joins the pool with the fewest active entries and gets a match against each of them,
 * scheduled after the last time slot already used. Not possible once knockouts have been drawn.
 */
export function planLateEntry(t: ClubTournament, div: Division, playerIds: string[], entries: Entry[], matches: ClubMatch[], newId: () => string): { entry: Entry; matches: NewMatchRow[] } | string {
  const need = div.kind === 'doubles' ? 2 : 1;
  if (playerIds.length !== need || new Set(playerIds).size !== need) return div.kind === 'doubles' ? 'Choose two different players' : 'Choose a player';
  const taken = enteredPlayers(entries, div.id);
  if (playerIds.some((p) => taken.has(p))) return 'A player is already entered in this event';
  if (matches.some((m) => m.divisionId === div.id && m.stage !== 'pool')) return 'Knockouts have started, so new entries can’t join';
  const active = entries.filter((e) => e.divisionId === div.id && e.status !== 'withdrawn');
  const sizes = Array.from({ length: div.pools }, (_, i) => ({ pool: i + 1, n: active.filter((e) => (e.pool ?? 1) === i + 1).length }));
  const pool = sizes.sort((a, b) => a.n - b.n || a.pool - b.pool)[0].pool;
  const entry: Entry = { id: newId(), divisionId: div.id, clubId: div.clubId, playerIds, seed: Math.max(0, ...entries.filter((e) => e.divisionId === div.id).map((e) => e.seed ?? 0)) + 1, pool, status: 'active' };
  const opponents = active.filter((e) => (e.pool ?? 1) === pool);
  const lastRound = Math.max(0, ...matches.filter((m) => m.divisionId === div.id && m.pool === pool).map((m) => m.round ?? 0));
  const rows: NewMatchRow[] = opponents.map((o, i) => ({
    id: newId(), clubId: div.clubId, tournamentId: t.id, divisionId: div.id, stage: 'pool', pool, round: lastRound + 1 + i,
    entryA: o.id, entryB: entry.id, sideA: o.playerIds, sideB: playerIds, format: div.format, games: [], status: 'scheduled', playedOn: t.startDate,
  }));
  const state = emptySlotState();
  for (const m of matches) {
    if (m.slot === undefined || m.status === 'void') continue;
    const s = state.busy.get(m.slot) ?? new Set<string>();
    [...m.sideA, ...m.sideB].forEach((p) => s.add(p));
    state.busy.set(m.slot, s);
    state.used.set(m.slot, Math.max(state.used.get(m.slot) ?? 0, m.court ?? 0));
  }
  const after = Math.max(-1, ...matches.filter((m) => m.status !== 'void').map((m) => m.slot ?? -1)) + 1;
  const plan = scheduleSlots(rows.map((m) => ({ key: m.id, playerIds: [...m.sideA, ...m.sideB] })), t.courts, after, state);
  for (const m of rows) { const s = plan.get(m.id); if (s) { m.slot = s.slot; m.court = s.court; } }
  return { entry, matches: rows };
}

/** Whether every pool match in a division is finished (played or cancelled). */
export function poolsComplete(divisionId: string, matches: ClubMatch[]): boolean {
  const pool = matches.filter((m) => m.divisionId === divisionId && m.stage === 'pool');
  return pool.length > 0 && pool.every((m) => m.status === 'done' || m.status === 'void');
}
