import type { Format } from '../../domain/types';
import type { Club, ClubMatch, ClubPlayer, ClubTournament, Division, Entry, Member } from '../types';
import { emptySlotState, entryRating, firstKnockoutPairs, matchResult, planPoolMatches, scheduleSlots, seedOrder, snakePools, stageForSize, standings, type Qualifier } from './engine';
import { rng, simulateMatch } from './simulate';

/** Fictional names only. None of these are real club members. */
const FIRST = ['Aarav', 'Diya', 'Kabir', 'Ananya', 'Rohan', 'Meera', 'Ishaan', 'Saanvi', 'Arjun', 'Kavya', 'Vihaan', 'Riya', 'Aditya', 'Nisha', 'Karan', 'Pooja', 'Siddharth', 'Tara', 'Nikhil', 'Aditi', 'Rahul', 'Sneha', 'Varun', 'Leela', 'Dev', 'Ira', 'Manav', 'Zoya', 'Yash', 'Anika', 'Pranav', 'Mira', 'Kunal', 'Divya', 'Harsh', 'Neha', 'Akash', 'Ritu', 'Om', 'Sana', 'Vikram', 'Tanvi', 'Neel', 'Gauri', 'Aman', 'Pia', 'Rishi', 'Esha', 'Tejas', 'Avni', 'Samir', 'Lavanya', 'Farhan', 'Jaya', 'Krish'];
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Menon', 'Kapoor', 'Nair', 'Gupta', 'Rao', 'Bose', 'Pillai', 'Joshi', 'Khan', 'Das', 'Mehta', 'Verma', 'Patel', 'Sen', 'Kulkarni', 'Shetty', 'Chopra'];

export const SAMPLE_CLUB_NAME = 'PQ Demo Club';
export const SAMPLE_TOURNAMENT_NAME = 'PQ Demo Open';

export interface SampleData {
  club: Club;
  members: Member[];
  players: ClubPlayer[];
  tournament: ClubTournament;
  divisions: Division[];
  entries: Entry[];
  matches: ClubMatch[];
  /** The roster entry that stands for you (the owner). */
  youPlayerId: string;
}

function uuidFrom(rand: () => number): string {
  const h = () => Math.floor(rand() * 16).toString(16);
  const s = (n: number) => Array.from({ length: n }, h).join('');
  return `${s(8)}-${s(4)}-4${s(3)}-${'89ab'[Math.floor(rand() * 4)]}${s(3)}-${s(12)}`;
}

// Pool games use golden point (how Hyderabad club round robins are usually played); knockouts are win by 2.
const POOL_FORMAT: Format = { pointsTo: 11, bestOf: 1, scoring: 'sideout', golden: true };
const KO_FORMAT: Format = { pointsTo: 11, bestOf: 3, scoring: 'sideout' };

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Builds PQ Demo Club: 56 players, the Open with 20 singles players and 24 doubles teams (pools then knockouts),
 * and 40 earlier club matches. Singles is finished; doubles has its semi-finals still to play, so live scoring can be tried.
 */
export function buildSampleClub(ownerUserId: string, ownerName = 'Vineeth', today = new Date(), seed = 20261028): SampleData {
  const rand = rng(seed);
  const id = () => uuidFrom(rand);
  const clubId = id();
  const club: Club = { id: clubId, name: SAMPLE_CLUB_NAME, city: undefined, inviteCode: 'pqdemo0001', settings: {} };

  const players: ClubPlayer[] = [];
  const you: ClubPlayer = { id: id(), clubId, name: ownerName, duprSingles: 3.71, duprDoubles: 3.82, userId: ownerUserId, share: {}, sample: true };
  players.push(you);
  const used = new Set<string>();
  while (players.length < 56) {
    const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
    if (used.has(name)) continue;
    used.add(name);
    const s = Math.round((2.6 + rand() * 2.0) * 100) / 100;
    const d = Math.round(Math.min(4.9, Math.max(2.5, s + (rand() - 0.4) * 0.4)) * 100) / 100;
    players.push({ id: id(), clubId, name, duprSingles: s, duprDoubles: d, share: {}, sample: true });
  }
  const pmap = new Map(players.map((p) => [p.id, p]));
  const coach = players[1];
  const members: Member[] = [
    { userId: ownerUserId, role: 'owner', name: ownerName },
    { userId: `sample-coach-${coach.id}`, role: 'coach', name: coach.name },
  ];

  const date = isoDay(today);
  const tournament: ClubTournament = { id: id(), clubId, name: SAMPLE_TOURNAMENT_NAME, startDate: date, startTime: '08:00', courts: 6, slotMinutes: 20, status: 'live', isPublic: true, publicSlug: 'pq-demo-open' };
  const singles: Division = { id: id(), tournamentId: tournament.id, clubId, name: 'Open Singles', kind: 'singles', format: POOL_FORMAT, koFormat: KO_FORMAT, pools: 4, advance: 2, sort: 0 };
  const doubles: Division = { id: id(), tournamentId: tournament.id, clubId, name: 'Open Doubles', kind: 'doubles', format: POOL_FORMAT, koFormat: KO_FORMAT, pools: 4, advance: 2, sort: 1 };

  const others = shuffle(players.slice(1), rand);
  const singlesPlayers = [you.id, ...others.slice(0, 19).map((p) => p.id)];
  const doublesPool = [you.id, ...shuffle(players.slice(1), rand).slice(0, 47).map((p) => p.id)];
  const teams: string[][] = [];
  for (let i = 0; i < 48; i += 2) teams.push([doublesPool[i], doublesPool[i + 1]]);

  const entries: Entry[] = [];
  const makeEntries = (div: Division, groups: string[][]) => {
    const ordered = seedOrder(groups, (g) => entryRating(g, pmap, div.kind));
    const pools = snakePools(ordered.length, div.pools);
    return ordered.map((g, i): Entry => ({ id: id(), divisionId: div.id, clubId, playerIds: g, seed: i + 1, pool: pools[i] }));
  };
  const sEntries = makeEntries(singles, singlesPlayers.map((p) => [p]));
  const dEntries = makeEntries(doubles, teams);
  entries.push(...sEntries, ...dEntries);
  const emap = new Map(entries.map((e) => [e.id, e]));

  const matches: ClubMatch[] = [];
  const stamp = today.toISOString();
  const newMatch = (div: Division, stage: ClubMatch['stage'], a: string, b: string, extra: Partial<ClubMatch>): ClubMatch => ({
    id: id(), clubId, tournamentId: tournament.id, divisionId: div.id, stage, entryA: a, entryB: b,
    sideA: (emap.get(a) as Entry).playerIds, sideB: (emap.get(b) as Entry).playerIds,
    format: stage === 'pool' ? div.format : div.koFormat, games: [], status: 'scheduled', playedOn: date, updatedAt: stamp, ...extra,
  });
  const play = (m: ClubMatch, kind: Division['kind']) => {
    const r = simulateMatch(entryRating(m.sideA, pmap, kind) ?? 3.5, entryRating(m.sideB, pmap, kind) ?? 3.5, m.format, rand);
    m.games = r.games; m.winner = r.winner; m.status = 'done';
  };

  // Pool matches for both events, scheduled together across 6 courts (some players are in both events).
  const slots = emptySlotState();
  for (const div of [singles, doubles]) {
    const divEntries = div === singles ? sEntries : dEntries;
    for (const p of planPoolMatches(divEntries)) matches.push(newMatch(div, 'pool', p.entryA, p.entryB, { pool: p.pool, round: p.round }));
  }
  const poolPlan = scheduleSlots(matches.map((m) => ({ key: m.id, playerIds: [...m.sideA, ...m.sideB] })), tournament.courts, 0, slots);
  for (const m of matches) { const s = poolPlan.get(m.id); if (s) { m.slot = s.slot; m.court = s.court; } play(m, m.divisionId === singles.id ? 'singles' : 'doubles'); }
  let nextSlot = Math.max(...matches.map((m) => m.slot ?? 0)) + 1;

  const knockout = (div: Division, divEntries: Entry[], playThrough: 'all' | 'qf') => {
    const pool = matches.filter((m) => m.divisionId === div.id && m.stage === 'pool');
    const qualifiers: Qualifier[] = [];
    const rankKey = new Map<string, number>();
    for (let p = 1; p <= div.pools; p++) {
      const ids = divEntries.filter((e) => e.pool === p).map((e) => e.id);
      const table = standings(ids, pool, (eid) => emap.get(eid)?.seed ?? 99);
      table.slice(0, div.advance).forEach((row, i) => { qualifiers.push({ entryId: row.entryId, pool: p, place: i + 1 }); rankKey.set(row.entryId, -(row.wins * 1000 + row.diff)); });
    }
    let round = firstKnockoutPairs(qualifiers, (q) => rankKey.get(q.entryId) ?? 0)
      .map(([a, b], pos) => newMatch(div, stageForSize(qualifiers.length), a.entryId, b.entryId, { bracketPos: pos, round: 1 }));
    let roundNo = 1;
    while (round.length) {
      const plan = scheduleSlots(round.map((m) => ({ key: m.id, playerIds: [...m.sideA, ...m.sideB] })), tournament.courts, nextSlot, slots);
      for (const m of round) { const s = plan.get(m.id); if (s) { m.slot = s.slot; m.court = s.court; } }
      nextSlot = Math.max(nextSlot, ...round.map((m) => (m.slot ?? 0) + 1));
      matches.push(...round);
      const finishNow = playThrough === 'all' || round[0].stage === 'qf';
      if (!finishNow) break;
      round.forEach((m) => play(m, div.kind));
      if (round.length === 1) break;
      roundNo++;
      const next: ClubMatch[] = [];
      for (let k = 0; k < round.length / 2; k++) {
        const x = round[2 * k], y = round[2 * k + 1];
        const wx = x.winner === 'A' ? x.entryA : x.entryB, wy = y.winner === 'A' ? y.entryA : y.entryB;
        next.push(newMatch(div, stageForSize(round.length), wx as string, wy as string, { bracketPos: k, round: roundNo }));
      }
      round = next;
    }
  };
  knockout(singles, sEntries, 'all');
  knockout(doubles, dEntries, 'qf');

  // Earlier club nights over the last 8 weeks.
  for (let i = 0; i < 40; i++) {
    const day = new Date(today); day.setDate(day.getDate() - 3 - Math.floor(rand() * 56));
    const pick = shuffle(players, rand);
    const isDoubles = rand() < 0.6;
    const sideA = isDoubles ? [pick[0].id, pick[1].id] : [pick[0].id];
    const sideB = isDoubles ? [pick[2].id, pick[3].id] : [pick[1].id];
    // Make sure "you" appear in a fair share of club nights.
    if (i % 4 === 0 && !sideA.includes(you.id) && !sideB.includes(you.id)) sideA[0] = you.id;
    const kind = isDoubles ? 'doubles' : 'singles';
    const m: ClubMatch = { id: id(), clubId, stage: 'friendly', sideA, sideB, format: POOL_FORMAT, games: [], status: 'scheduled', playedOn: isoDay(day), updatedAt: day.toISOString() };
    play(m, kind);
    matches.push(m);
  }
  // Sanity: every finished match has a winner that matches its games.
  for (const m of matches) if (m.status === 'done' && matchResult(m).winner !== m.winner) throw new Error('Sample data mismatch');
  return { club, members, players, tournament, divisions: [singles, doubles], entries, matches, youPlayerId: you.id };
}
