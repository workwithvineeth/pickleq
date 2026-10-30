/**
 * Full-scale tournament day for the robot: 10 tournaments running at the same time, 300 players, using the same
 * club code the app runs (the demo backend and the organiser's planning functions). Real-day events are mixed in:
 * no-show walkovers, retirements, withdrawals in the pools and in the knockouts, late entries (and one refused
 * once the knockouts start), a player replaced, a match cancelled, a match moved, live point-by-point scores and a
 * score sent through a scorer link. Every rule a real day depends on is then checked.
 */
import { DemoBackend } from '../src/club/demo';
import { enteredPlayers, knockoutMatchesToAdd, planLateEntry, planReplacePlayer, planWithdraw, type NewDivisionInput } from '../src/club/plan';
import { entryRating, matchResult, standings } from '../src/club/domain/engine';
import { rng, simulateMatch } from '../src/club/domain/simulate';
import type { ClubMatch, Division, Entry } from '../src/club/types';
import type { TournamentBundle } from '../src/club/backend';
import type { Format } from '../src/domain/types';

export class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

const POOL: Format = { pointsTo: 11, bestOf: 1, scoring: 'sideout', golden: true };
const KO: Format = { pointsTo: 11, bestOf: 3, scoring: 'sideout' };

interface DivPlan {
  name: string; kind: 'singles' | 'doubles'; size: number; pools: number; advance: number;
  /** Knockout only, best runners-up and per-round formats (the format options). */
  shape?: 'ko'; extra?: number; stageFormats?: NewDivisionInput['stageFormats']; koFormat?: Format;
  /** Doubles made of the same people as the event before it (people who play singles and doubles). */
  samePeople?: boolean;
}
/** What happens in each tournament, on top of normal play. */
type Twist = 'no-show' | 'withdraw-pool' | 'withdraw-ko' | 'late-single' | 'late-team' | 'late-refused' | 'retired' | 'replace' | 'cancel' | 'move' | 'scorer-link' | 'live-points';
interface TPlan { name: string; courts: number; divisions: DivPlan[]; twists: Twist[] }

export const SEASON: TPlan[] = [
  { name: 'Robot Season 01', courts: 6, divisions: [{ name: 'Open Singles', kind: 'singles', size: 32, pools: 8, advance: 1 }], twists: ['no-show', 'withdraw-ko', 'live-points'] },
  { name: 'Robot Season 02', courts: 4, divisions: [{ name: 'Men’s Singles 3.5', kind: 'singles', size: 24, pools: 4, advance: 2 }], twists: ['withdraw-pool', 'scorer-link'] },
  { name: 'Robot Season 03', courts: 3, divisions: [{ name: 'Singles 4.0', kind: 'singles', size: 16, pools: 4, advance: 1 }], twists: ['late-single', 'late-refused'] },
  { name: 'Robot Season 04', courts: 6, divisions: [{ name: 'Open Doubles', kind: 'doubles', size: 24, pools: 8, advance: 1 }], twists: ['retired', 'no-show'] },
  { name: 'Robot Season 05', courts: 5, divisions: [{ name: 'Men’s Doubles 3.5', kind: 'doubles', size: 20, pools: 4, advance: 2 }], twists: ['replace', 'withdraw-pool'] },
  { name: 'Robot Season 06', courts: 4, divisions: [{ name: 'Mixed Doubles', kind: 'doubles', size: 16, pools: 4, advance: 1 }], twists: ['late-team', 'move'] },
  { name: 'Robot Season 07', courts: 3, divisions: [{ name: 'Women’s Doubles', kind: 'doubles', size: 12, pools: 2, advance: 2 }], twists: ['cancel', 'withdraw-ko'] },
  { name: 'Robot Season 08', courts: 4, divisions: [{ name: 'Singles 35+', kind: 'singles', size: 12, pools: 2, advance: 2 }, { name: 'Doubles 35+', kind: 'doubles', size: 8, pools: 2, advance: 1 }], twists: ['no-show', 'live-points', 'late-single'] },
  { name: 'Robot Season 09', courts: 4, divisions: [{ name: 'Ladder Singles', kind: 'singles', size: 10, pools: 1, advance: 0 }, { name: 'Ladder Doubles', kind: 'doubles', size: 10, pools: 2, advance: 2 }], twists: ['withdraw-pool', 'retired'] },
  { name: 'Robot Season 11', courts: 3, divisions: [{ name: 'Best Runners-up Singles', kind: 'singles', size: 20, pools: 5, advance: 1, extra: 3 }], twists: ['no-show', 'live-points'] },
  { name: 'Robot Season 12', courts: 6, divisions: [{ name: 'Round of 16 Doubles', kind: 'doubles', size: 24, pools: 4, advance: 4, koFormat: { pointsTo: 21, bestOf: 3, scoring: 'rally' }, stageFormats: { r16: { pointsTo: 11, bestOf: 1, scoring: 'rally', golden: true }, qf: { pointsTo: 15, bestOf: 1, scoring: 'rally' }, sf: { pointsTo: 15, bestOf: 3, scoring: 'rally' } } }], twists: ['withdraw-ko', 'retired'] },
  { name: 'Robot Season 13', courts: 3, divisions: [{ name: 'TPC-style Singles (knockout)', kind: 'singles', size: 20, pools: 1, advance: 0, shape: 'ko' }, { name: 'TPC-style Doubles (knockout)', kind: 'doubles', size: 10, pools: 1, advance: 0, shape: 'ko', samePeople: true }], twists: ['no-show', 'withdraw-ko', 'live-points'] },
  { name: 'Robot Season 10', courts: 4, divisions: [{ name: 'Juniors Singles', kind: 'singles', size: 20, pools: 4, advance: 2 }, { name: 'Juniors Doubles', kind: 'doubles', size: 12, pools: 4, advance: 1 }], twists: ['late-team', 'scorer-link', 'replace', 'cancel'] },
];

export interface SeasonReport {
  players: number; playersEntered: number; tournaments: number; divisions: number; matchesPlayed: number; matchesCancelled: number;
  walkovers: number; retirements: number; withdrawals: number; lateEntries: number; lateRefused: string[]; replacements: number; moved: number;
  scorerLinkScores: number; livePointUpdates: number; rounds: number; ms: number; storageBytes: number;
  champions: { tournament: string; division: string; winner: string; how: string }[];
  problems: string[];
  tournamentIds: { id: string; name: string; slug: string }[];
}

export async function runSeason(seed = 8): Promise<{ storage: MemoryStorage; report: SeasonReport }> {
  const t0 = Date.now();
  const rand = rng(seed);
  const storage = new MemoryStorage();
  const b = new DemoBackend(storage as unknown as Storage);
  const clubId = await b.start('Robot Organiser');
  const r: SeasonReport = { players: 0, playersEntered: 0, tournaments: 0, divisions: 0, matchesPlayed: 0, matchesCancelled: 0, walkovers: 0, retirements: 0, withdrawals: 0, lateEntries: 0, lateRefused: [], replacements: 0, moved: 0, scorerLinkScores: 0, livePointUpdates: 0, rounds: 0, ms: 0, storageBytes: 0, champions: [], problems: [], tournamentIds: [] };
  const problem = (s: string) => { if (r.problems.length < 50) r.problems.push(s); };

  // 300 players, ratings spread from 2.8 to 5.0.
  const ids: string[] = [];
  for (let i = 0; i < 300; i++) {
    const p = await b.addPlayer(clubId, { name: `S8 Player ${String(i + 1).padStart(3, '0')}`, duprSingles: Math.round((2.8 + ((i * 37) % 221) / 100) * 1000) / 1000, duprDoubles: Math.round((2.8 + ((i * 53) % 221) / 100) * 1000) / 1000 });
    ids.push(p.id);
  }
  r.players = ids.length;
  let cursor = 0;
  const take = (n: number) => Array.from({ length: n }, () => ids[cursor++ % ids.length]);
  const today = new Date().toISOString().slice(0, 10);

  const tids: string[] = [];
  for (const plan of SEASON) {
    let last: string[] = [];
    const divisions: NewDivisionInput[] = plan.divisions.map((d) => {
      const people = d.samePeople ? last.slice(0, d.size * 2) : take(d.size * (d.kind === 'doubles' ? 2 : 1));
      last = people;
      const entries = d.kind === 'doubles' ? Array.from({ length: d.size }, (_, i) => [people[i * 2], people[i * 2 + 1]]) : people.map((p) => [p]);
      return { name: d.name, kind: d.kind, format: POOL, koFormat: d.koFormat ?? KO, pools: d.pools, advance: d.advance, entries, shape: d.shape, extra: d.extra, stageFormats: d.stageFormats };
    });
    const id = await b.createTournament({ clubId, name: plan.name, startDate: today, startTime: '08:00', courts: plan.courts, slotMinutes: 20, divisions });
    await b.updateTournament(id, { status: 'live', isPublic: true });
    tids.push(id);
    r.divisions += divisions.length;
  }
  r.tournaments = tids.length;
  let walkIn = 0;
  const newPlayer = async () => (await b.addPlayer(clubId, { name: `Late Walk-in ${String(++walkIn).padStart(2, '0')}`, duprSingles: 3.6, duprDoubles: 3.6 })).id;
  const done = new Set<string>();
  const used = new Map<string, Set<Twist>>(tids.map((t) => [t, new Set()]));
  const once = (tid: string, tw: Twist) => { const i = SEASON[tids.indexOf(tid)]; if (!i.twists.includes(tw) || used.get(tid)!.has(tw)) return false; used.get(tid)!.add(tw); return true; };
  const ratingOf = (d: Division, side: string[], bundle: TournamentBundle) => entryRating(side, new Map(bundle.players.map((p) => [p.id, p])), d.kind) ?? 3.5;

  // Everyone plays at once: each round, every tournament plays its next time slot.
  for (let round = 1; done.size < tids.length; round++) {
    if (round > 400) { problem('The day never finished (over 400 rounds)'); break; }
    r.rounds = round;
    for (const tid of tids) {
      if (done.has(tid)) continue;
      let bundle = await b.tournamentBundle(tid);
      const add = knockoutMatchesToAdd(bundle.tournament, bundle.divisions, bundle.entries, bundle.matches, () => crypto.randomUUID());
      if (add.length) { await b.addMatches(add); bundle = await b.tournamentBundle(tid); }
      const open = bundle.matches.filter((m) => m.status === 'scheduled' || m.status === 'live');
      if (!open.length) { done.add(tid); continue; }
      const div = (m: ClubMatch) => bundle.divisions.find((d) => d.id === m.divisionId) as Division;

      // --- Real-day events, once each where the plan says so ---
      if (round === 2 && once(tid, 'withdraw-pool')) {
        const e = bundle.entries.find((x) => x.status === 'active' && bundle.matches.some((m) => m.stage === 'pool' && m.status === 'scheduled' && (m.entryA === x.id || m.entryB === x.id)));
        if (e) {
          const plan = planWithdraw(e.id, bundle.matches);
          if (!plan.voidIds.length) problem(`${bundle.tournament.name}: withdrawing in the pools cancelled nothing`);
          await b.patchMatches([...plan.voidIds.map((id) => ({ id, patch: { status: 'void' as const } })), ...plan.walkovers.map((w) => ({ id: w.id, patch: { status: 'done' as const, winner: w.winner, games: [] } }))]);
          await b.updateEntry(e.id, { status: 'withdrawn' });
          r.withdrawals++; r.walkovers += plan.walkovers.length;
        }
      }
      const inKo = (d: Division) => bundle.matches.some((m) => m.divisionId === d.id && m.stage !== 'pool');
      if (bundle.matches.some((m) => m.stage !== 'pool' && m.status === 'scheduled') && once(tid, 'withdraw-ko')) {
        const m = bundle.matches.find((x) => x.stage !== 'pool' && x.status === 'scheduled') as ClubMatch;
        const plan = planWithdraw(m.entryA, bundle.matches);
        if (!plan.walkovers.some((w) => w.id === m.id && w.winner === 'B')) problem(`${bundle.tournament.name}: a knockout withdrawal didn't put the opponent through`);
        await b.patchMatches([...plan.voidIds.map((id) => ({ id, patch: { status: 'void' as const } })), ...plan.walkovers.map((w) => ({ id: w.id, patch: { status: 'done' as const, winner: w.winner, games: [] } }))]);
        await b.updateEntry(m.entryA, { status: 'withdrawn' });
        r.withdrawals++; r.walkovers += plan.walkovers.length;
      }
      for (const tw of ['late-single', 'late-team'] as const) {
        const d = bundle.divisions.find((x) => (tw === 'late-single' ? x.kind === 'singles' : x.kind === 'doubles') && !inKo(x));
        if (round === 2 && d && once(tid, tw)) {
          const people = d.kind === 'doubles' ? [await newPlayer(), await newPlayer()] : [await newPlayer()];
          bundle = await b.tournamentBundle(tid);
          const plan = planLateEntry(bundle.tournament, d, people, bundle.entries, bundle.matches, () => crypto.randomUUID());
          if (typeof plan === 'string') { problem(`${bundle.tournament.name}: late entry refused: ${plan}`); continue; }
          if (!plan.matches.length) problem(`${bundle.tournament.name}: a late entry got no matches`);
          await b.addEntry(plan.entry); await b.addMatches(plan.matches);
          r.lateEntries++;
        }
      }
      const koDiv = bundle.divisions.find((x) => inKo(x));
      if (koDiv && once(tid, 'late-refused')) {
        const plan = planLateEntry(bundle.tournament, koDiv, koDiv.kind === 'doubles' ? [await newPlayer(), await newPlayer()] : [await newPlayer()], bundle.entries, bundle.matches, () => crypto.randomUUID());
        if (typeof plan !== 'string') problem(`${bundle.tournament.name}: a late entry was let in after the knockouts started`);
        else r.lateRefused.push(plan);
      }
      if (round === 3 && once(tid, 'replace')) {
        const d = bundle.divisions.find((x) => x.kind === 'doubles' && !inKo(x));
        const e = d && bundle.entries.find((x) => x.divisionId === d.id && x.status === 'active');
        if (d && e) {
          const taken = enteredPlayers(bundle.entries, d.id);
          const sub = bundle.players.find((p) => !taken.has(p.id) && !p.sample) ?? bundle.players.find((p) => !taken.has(p.id));
          const plan = sub ? planReplacePlayer(e, e.playerIds[1], sub.id, bundle.matches) : 'nobody free';
          if (typeof plan === 'string') problem(`${bundle.tournament.name}: replacing a player failed: ${plan}`);
          else {
            await b.updateEntry(e.id, { playerIds: plan.playerIds });
            if (plan.matchSides.length) await b.patchMatches(plan.matchSides.map((m) => ({ id: m.id, patch: { sideA: m.sideA, sideB: m.sideB } })));
            r.replacements++;
          }
        }
      }
      bundle = await b.tournamentBundle(tid);
      const waiting = bundle.matches.filter((m) => m.status === 'scheduled' || m.status === 'live');
      if (!waiting.length) continue;
      const slot = Math.min(...waiting.map((m) => m.slot ?? 9999));
      const batch = waiting.filter((m) => (m.slot ?? 9999) === slot);
      if (round === 1 && once(tid, 'cancel')) {
        const later = waiting.find((m) => m.stage === 'pool' && (m.slot ?? 0) > slot);
        if (later) { await b.patchMatches([{ id: later.id, patch: { status: 'void' } }]); r.matchesCancelled++; }
      }
      if (round === 1 && once(tid, 'move')) {
        const later = waiting.find((m) => (m.slot ?? 0) > slot);
        if (later) {
          const busyCourts = new Set(bundle.matches.filter((m) => m.slot === later.slot && m.id !== later.id && m.status !== 'void').map((m) => m.court));
          const free = Array.from({ length: bundle.tournament.courts }, (_, i) => i + 1).find((c) => !busyCourts.has(c));
          if (free) { await b.patchMatches([{ id: later.id, patch: { court: free } }]); r.moved++; }
        }
      }
      let link: { token: string; pin: string; court?: number } | null = null;
      if (once(tid, 'scorer-link')) {
        const court = batch[0].court ?? 1;
        const [l] = await b.createScorerLinks(tid, clubId, [court]);
        link = l;
      }
      for (const [i, m] of batch.entries()) {
        const d = div(m);
        const sim = simulateMatch(ratingOf(d, m.sideA, bundle), ratingOf(d, m.sideB, bundle), m.format, rand);
        if (i === 0 && round === 1 && once(tid, 'no-show')) {
          await b.patchMatches([{ id: m.id, patch: { status: 'done', winner: 'A', games: [] } }]); r.walkovers++; continue;
        }
        if (i === 0 && round === 2 && once(tid, 'retired')) {
          const g = sim.games[0];
          const part = { points: g.points.slice(0, 7), a: [...g.points.slice(0, 7)].filter((c) => c === 'A').length, b: [...g.points.slice(0, 7)].filter((c) => c === 'B').length };
          await b.saveScore(m.id, { games: [part], status: 'live' });
          await b.patchMatches([{ id: m.id, patch: { status: 'done', winner: 'B', games: [part] } }]); r.retirements++; continue;
        }
        if (i === 0 && once(tid, 'live-points')) {
          const pts = sim.games[0].points;
          for (let k = 1; k <= pts.length; k += 3) {
            const p = pts.slice(0, k);
            await b.saveScore(m.id, { games: [{ points: p, a: [...p].filter((c) => c === 'A').length, b: [...p].filter((c) => c === 'B').length }], status: 'live' });
            r.livePointUpdates++;
          }
        }
        if (link && m.court === link.court) {
          await b.scorerSave(link.token, link.pin, m.id, { games: sim.games, status: 'done', winner: sim.winner, playedOn: today });
          r.scorerLinkScores++; link = null; continue;
        }
        await b.saveScore(m.id, { games: sim.games, status: 'done', winner: sim.winner, playedOn: today });
      }
    }
  }

  // --- Checks every real day depends on ---
  const entered = new Set<string>();
  for (const tid of tids) {
    const bd = await b.tournamentBundle(tid);
    const name = bd.tournament.name;
    r.tournamentIds.push({ id: tid, name, slug: bd.tournament.publicSlug });
    bd.entries.forEach((e) => e.playerIds.forEach((p) => entered.add(p)));
    const live = bd.matches.filter((m) => m.status === 'scheduled' || m.status === 'live');
    if (live.length) problem(`${name}: ${live.length} matches never finished`);
    for (const m of bd.matches) {
      if (m.status === 'void') continue;
      if (m.status === 'done' && !m.winner) problem(`${name}: a finished match has no winner`);
      if (m.status === 'done' && m.games.length) {
        const res = matchResult(m);
        if (res.winner && res.winner !== m.winner) problem(`${name}: a match's winner doesn't match its score`);
      }
      if (m.status === 'done') r.matchesPlayed++;
    }
    r.matchesCancelled += 0;
    // Nobody is on two courts at once, and no court has two matches at once.
    const bySlot = new Map<number, ClubMatch[]>();
    for (const m of bd.matches) if (m.status !== 'void' && m.slot !== undefined) bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), m]);
    for (const [slot, ms] of bySlot) {
      const seen = new Set<string>();
      for (const m of ms) for (const p of [...m.sideA, ...m.sideB]) { if (seen.has(p)) problem(`${name}: a player is booked twice at slot ${slot}`); seen.add(p); }
      const courts = ms.map((m) => m.court);
      if (new Set(courts).size !== courts.length) problem(`${name}: two matches on one court at slot ${slot}`);
      if (courts.some((c) => !c || c > bd.tournament.courts)) problem(`${name}: a match on a court that doesn't exist`);
    }
    // A withdrawn entry has nothing left to play.
    const out = new Set(bd.entries.filter((e) => e.status === 'withdrawn').map((e) => e.id));
    if (bd.matches.some((m) => m.status !== 'void' && m.status !== 'done' && (out.has(m.entryA) || out.has(m.entryB)))) problem(`${name}: a withdrawn entry still has a match to play`);
    // Every event ends with a winner.
    const names = new Map(bd.players.map((p) => [p.id, p.name]));
    const emap = new Map<string, Entry>(bd.entries.map((e) => [e.id, e]));
    for (const d of bd.divisions) {
      const dm = bd.matches.filter((m) => m.divisionId === d.id);
      if (d.advance > 0 || d.shape === 'ko') {
        // Each knockout round is played in its own format (per-round formats), else the knockout default.
        for (const m of dm.filter((x) => x.stage !== 'pool')) {
          const want = d.stageFormats?.[m.stage as 'qf'] ?? d.koFormat;
          if (m.format.pointsTo !== want.pointsTo || m.format.bestOf !== want.bestOf) problem(`${name} ${d.name}: a ${m.stage} match has the wrong format`);
        }
        const first = dm.filter((m) => m.stage !== 'pool' && (m.round ?? 1) === 1);
        const size = first.length * 2;
        if (d.extra && size !== d.pools * d.advance + d.extra) problem(`${name} ${d.name}: best runners-up made a knockout of ${size}`);
        if (d.shape === 'ko') {
          const n = bd.entries.filter((e) => e.divisionId === d.id).length;
          const byes = first.filter((m) => !m.entryB).length;
          if (dm.some((m) => m.stage === 'pool')) problem(`${name} ${d.name}: a knockout-only event has pool matches`);
          if (byes !== size - n) problem(`${name} ${d.name}: ${byes} byes for ${n} entries in a ${size} bracket`);
        }
        const final = dm.find((m) => m.stage === 'final' && m.status === 'done');
        if (!final) { problem(`${name} ${d.name}: no final was played`); continue; }
        const w = emap.get(final.winner === 'A' ? final.entryA : final.entryB);
        r.champions.push({ tournament: name, division: d.name, winner: (w?.playerIds ?? []).map((p) => names.get(p)).join(' / '), how: final.games.length ? final.games.map((g) => `${g.a}–${g.b}`).join(', ') : 'walkover' });
      } else {
        const active = bd.entries.filter((e) => e.divisionId === d.id && e.status !== 'withdrawn').map((e) => e.id);
        const top = standings(active, dm.filter((m) => m.status !== 'void'))[0];
        const w = emap.get(top.entryId);
        r.champions.push({ tournament: name, division: d.name, winner: (w?.playerIds ?? []).map((p) => names.get(p)).join(' / '), how: `round robin, ${top.wins}–${top.losses}` });
      }
    }
  }
  r.playersEntered = ids.filter((p) => entered.has(p)).length;
  if (r.playersEntered !== 300) problem(`Only ${r.playersEntered} of the 300 players were entered`);
  for (const [tid, set] of used) for (const tw of SEASON[tids.indexOf(tid)].twists) if (!set.has(tw)) problem(`${SEASON[tids.indexOf(tid)].name}: the "${tw}" case never happened`);
  r.storageBytes = (storage.getItem('pq-club-demo-v1') ?? '').length;
  r.ms = Date.now() - t0;
  return { storage, report: r };
}
