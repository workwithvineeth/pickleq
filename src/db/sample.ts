import { checkMatch } from '../domain/scoring';
import { TAGS, type Category, type Format, type Game, type Goal, type MatchType, type Participant, type RatingEntry, type TagMark, type TrainingSession } from '../domain/types';
import { db, newId, type PickleqDB } from './db';
import { addMatch, type NewMatch } from './matches';
import { starterChecklist } from './tournaments';
import type { Tournament } from '../domain/tournaments';

/** Small seeded random generator so the sample set is the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgo(n: number, today = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const OPPONENTS: Participant[] = [
  { name: 'Arjun', role: 'opponent', rating: 3.9 },
  { name: 'Sameer', role: 'opponent', rating: 4.1 },
  { name: 'Rohan', role: 'opponent', rating: 3.9 },
  { name: 'Kiran', role: 'opponent', strength: 'equal' },
  { name: 'Ali', role: 'opponent', rating: 3.7 },
  { name: 'Nikhil', role: 'opponent', rating: 3.6 },
  { name: 'Om', role: 'opponent', rating: 3.5 },
  { name: 'Kavya', role: 'opponent', strength: 'weaker' },
  { name: 'Ravi', role: 'opponent', strength: 'weaker' },
  { name: 'Isha', role: 'opponent', rating: 3.8 },
  { name: 'Neel', role: 'opponent', strength: 'stronger' },
];
const PARTNERS = ['Priya', 'Dev', 'Meera'];
const VENUES = ['Koramangala Courts', 'HSR Pickleball Club', 'Indiranagar Arena'];

/** 24 realistic matches over about 10 weeks, for the Preview version only. Never used in Live. */
export function sampleMatches(today = new Date()): NewMatch[] {
  const rand = rng(20261028);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const plan: { ago: number; type: MatchType; category: Category }[] = [];
  const types: MatchType[] = ['singles', 'doubles', 'mixed'];
  for (let i = 0; i < 24; i++) {
    const category: Category = i % 5 === 2 ? 'tournament' : i % 3 === 1 ? 'practice' : 'casual';
    plan.push({ ago: 70 - Math.round(i * 2.9), type: types[i % 3], category });
  }

  return plan.map((p, i) => {
    const doubles = p.type !== 'singles';
    const opps = doubles ? [pick(OPPONENTS), pick(OPPONENTS.filter((o) => o.name !== OPPONENTS[0].name))] : [pick(OPPONENTS)];
    if (doubles && opps[0].name === opps[1].name) opps[1] = OPPONENTS[(OPPONENTS.indexOf(opps[0]) + 3) % OPPONENTS.length];
    const strongOpp = opps.some((o) => (o.rating ?? 0) >= 4.0 || o.strength === 'stronger');
    const weakOpp = opps.every((o) => (o.rating ?? 5) <= 3.6 || o.strength === 'weaker');
    const winChance = (strongOpp ? 0.45 : weakOpp ? 0.85 : 0.65) + i * 0.005; // improving over time
    const format: Format = p.category === 'tournament'
      ? { pointsTo: 11, bestOf: 3, scoring: 'sideout' }
      : i % 7 === 3 ? { pointsTo: 15, bestOf: 1, scoring: 'rally' } : { pointsTo: 11, bestOf: 1, scoring: 'sideout' };
    const target = format.pointsTo;

    const playGame = (): Game => {
      const win = rand() < winChance;
      const deuce = rand() < 0.15;
      const lo = deuce ? target - 1 : Math.floor(rand() * (target - 3)) + 1;
      const hi = deuce ? target + 1 : target;
      const you = win ? hi : lo;
      const them = win ? lo : hi;
      const g: Game = { you, them, momentum: 'neither' };
      const roll = rand();
      if (win && them <= Math.floor(target / 2) && roll < 0.5) g.momentum = 'dominated';
      else if (win && them >= 6 && roll < 0.35) {
        g.momentum = 'came-back';
        g.fromYou = Math.max(0, Math.min(you - 6, 3 + Math.floor(rand() * 3)));
        g.fromThem = Math.min(them, g.fromYou + 3 + Math.floor(rand() * 2));
      } else if (!win && you >= 6 && roll < 0.65) {
        g.momentum = 'lost-lead';
        g.fromThem = Math.max(0, Math.min(them - 6, 2 + Math.floor(rand() * 3)));
        g.fromYou = Math.min(you, g.fromThem + 3 + Math.floor(rand() * 2));
      }
      return g;
    };

    const games: Game[] = [playGame()];
    if (format.bestOf === 3) {
      games.push(playGame());
      const w = games.filter((g) => (g.you as number) > (g.them as number)).length;
      if (w === 1) games.push(playGame());
    }
    let check = checkMatch(format, 'played', games, null);
    if (!check.ok) {
      // Keep the set valid even if a random game broke a rule: fall back to a clean result.
      games.splice(0, games.length, { you: 11, them: 7, momentum: 'neither' }, ...(format.bestOf === 3 ? [{ you: 11, them: 8, momentum: 'neither' as const }] : []));
      check = checkMatch(format, 'played', games, null);
    }
    const won = check.won as boolean;

    const tags: Record<string, TagMark> = {};
    if (!won && rand() < 0.75) tags['Backhand drive'] = 'needs-work';
    if (!won && rand() < 0.4) tags['Focus when leading'] = 'needs-work';
    if (rand() < 0.3) tags['Third-shot drop'] = won ? 'went-well' : 'needs-work';
    if (won && rand() < 0.5) tags[pick(['Serve', 'Dinking', 'Return'])] = 'went-well';
    if (rand() < 0.2) tags[pick(TAGS)] = 'needs-work';

    const recent = i >= 22;
    const energy = won ? 3 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 3);
    const participants: Participant[] = [
      ...(doubles ? [{ name: p.type === 'mixed' ? 'Priya' : pick(PARTNERS.slice(1)), role: 'partner' as const }] : []),
      ...opps.map((o) => ({ ...o })),
    ];
    return {
      date: daysAgo(p.ago, today), type: p.type, category: p.category, format, participants,
      outcome: 'played', games, won, backfilled: i < 2,
      status: recent || i < 2 ? (i < 2 ? 'complete' : 'incomplete') : 'complete',
      tags: recent || i < 2 ? {} : tags,
      energy: recent || i < 2 ? undefined : energy,
      venue: recent || i < 2 ? undefined : p.category === 'tournament' ? 'Bengaluru Open' : pick(VENUES),
      setting: recent || i < 2 ? undefined : (rand() < 0.6 ? 'outdoor' : 'indoor'),
      notes: !won && i % 4 === 0 && !recent ? 'Opponents kept attacking my backhand in long rallies.' : undefined,
      shotRatings: recent || i < 2 || i % 3 === 0 ? undefined : {
        Serve: won ? 4 : 3 + Math.floor(rand() * 2),
        'Third-shot drop': 2 + Math.floor(rand() * 2),
        Dink: 3 + Math.floor(rand() * 2),
        'Backhand drive': won ? 3 : 2,
      },
    } as NewMatch;
  });
}

/** Weekly DUPR readings: singles 3.58 → 3.71, doubles 3.61 → 3.82. */
export function sampleRatings(today = new Date()): RatingEntry[] {
  const singles = [3.58, 3.6, 3.59, 3.62, 3.63, 3.65, 3.64, 3.67, 3.69, 3.71];
  const doubles = [3.61, 3.64, 3.66, 3.7, 3.68, 3.72, 3.75, 3.74, 3.79, 3.82];
  const out: RatingEntry[] = [];
  singles.forEach((v, i) => out.push({ id: newId(), kind: 'singles', value: v, date: daysAgo(70 - i * 7, today), source: 'dupr-manual', createdAt: i }));
  doubles.forEach((v, i) => out.push({ id: newId(), kind: 'doubles', value: v, date: daysAgo(70 - i * 7, today), source: 'dupr-manual', createdAt: i }));
  return out;
}

/** About 10 weeks of training: drills improving over time, rest days, and an unbroken streak this week. */
export function sampleSessions(today = new Date()): TrainingSession[] {
  const rand = rng(77);
  const out: TrainingSession[] = [];
  const add = (ago: number, s: Omit<TrainingSession, 'id' | 'date' | 'createdAt' | 'updatedAt'>) =>
    out.push({ ...s, id: newId(), date: daysAgo(ago, today), createdAt: 1000 - ago, updatedAt: 1000 - ago });
  const drill = (category: string, base: number, attempts: number, progress: number) =>
    ({ category, attempts, made: Math.min(attempts, Math.round(attempts * (base + progress + (rand() - 0.5) * 0.06))) });
  for (let ago = 68; ago >= 7; ago -= 4) {
    const t = (68 - ago) / 61; // 0 → 1 over the period
    const kind = ago % 12 === 0 ? 'coaching' : ago % 8 === 0 ? 'partner' : 'solo';
    add(ago, { type: kind, minutes: kind === 'coaching' ? 60 : kind === 'partner' ? 90 : 45, intensity: 3 + Math.floor(rand() * 2), fatigue: 2 + Math.floor(rand() * 3),
      drills: [drill('Third-shot drops', 0.6, 25, t * 0.12), drill(kind === 'solo' ? 'Serves' : 'Backhand drives', kind === 'solo' ? 0.84 : 0.48, kind === 'solo' ? 30 : 25, t * 0.06), drill('Dinks', 0.74, 50, t * 0.08)],
      notes: kind === 'coaching' ? 'Coach: keep the paddle face open on drops.' : undefined });
    if (ago % 3 === 0) add(ago - 1, { type: 'fitness', minutes: 40, intensity: 4, fatigue: 3, drills: [] });
  }
  // This week: 6-day streak including a rest day
  add(5, { type: 'partner', minutes: 90, intensity: 4, fatigue: 4, drills: [drill('Backhand drives', 0.5, 25, 0.04), drill('Resets', 0.55, 20, 0)] });
  add(4, { type: 'rest', minutes: 0, fatigue: 2, drills: [] });
  add(3, { type: 'solo', minutes: 45, intensity: 3, fatigue: 2, drills: [drill('Serves', 0.9, 30, 0)] });
  add(2, { type: 'coaching', minutes: 60, intensity: 4, fatigue: 3, drills: [drill('Third-shot drops', 0.72, 25, 0), drill('Resets', 0.55, 20, 0)] });
  add(1, { type: 'fitness', minutes: 40, intensity: 3, fatigue: 2, drills: [] });
  add(0, { type: 'solo', minutes: 45, intensity: 3, fatigue: 2, drills: [drill('Backhand drives', 0.52, 25, 0)] });
  return out;
}

export function sampleGoals(): Goal[] {
  return [
    { id: newId(), kind: 'rating', ratingKind: 'doubles', target: 4.0, createdAt: 1 },
    { id: newId(), kind: 'weekly-hours', target: 6, createdAt: 2 },
    { id: newId(), kind: 'drill-rate', drillCategory: 'Third-shot drops', target: 80, createdAt: 3 },
    { id: newId(), kind: 'tournament', target: 0, text: 'Medal at Bengaluru Open', createdAt: 4 },
  ];
}

export async function loadSampleData(d: PickleqDB = db): Promise<number> {
  const items = sampleMatches();
  for (const m of items) await addMatch(m, d);
  await d.ratings.bulkPut(sampleRatings());
  await d.sessions.bulkPut(sampleSessions());
  await d.goals.bulkPut(sampleGoals());
  const extra = await addSampleTournaments(d);
  return items.length + extra;
}

/** One finished tournament with its matches, and one coming up with a schedule. Preview only. */
export async function addSampleTournaments(d: PickleqDB = db, today = new Date()): Promise<number> {
  const g = (you: number, them: number, momentum: Game['momentum'] = 'neither', fromYou?: number, fromThem?: number): Game => ({ you, them, momentum, fromYou, fromThem });
  const md = { id: newId(), name: 'Men’s doubles 3.5–4.0', type: 'doubles' as MatchType, format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' } as Format, partnerName: 'Dev', structure: 'pools-knockout' as const,
    teams: [{ id: newId(), name: 'Arjun / Rohan' }, { id: newId(), name: 'Sameer / Ali' }, { id: newId(), name: 'Om / Nikhil' }], otherResults: [] as Tournament['events'][number]['otherResults'], schedule: [], placement: '3' as const };
  md.otherResults = [
    { id: newId(), teamA: md.teams[0].id, teamB: md.teams[1].id, games: [{ a: 11, b: 8 }] },
    { id: newId(), teamA: md.teams[0].id, teamB: md.teams[2].id, games: [{ a: 11, b: 4 }] },
    { id: newId(), teamA: md.teams[1].id, teamB: md.teams[2].id, games: [{ a: 9, b: 11 }] },
  ];
  const mx = { id: newId(), name: 'Mixed doubles 3.5', type: 'mixed' as MatchType, format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' } as Format, partnerName: 'Priya', structure: 'round-robin' as const,
    teams: [{ id: newId(), name: 'Kavya / Ravi' }, { id: newId(), name: 'Isha / Neel' }], otherResults: [], schedule: [], poolPosition: 2 };
  const past: Tournament = { id: newId(), name: 'Bengaluru Open', startDate: daysAgo(17, today), endDate: daysAgo(16, today), venue: 'Indiranagar Arena', events: [md, mx],
    checklist: starterChecklist().map((c) => ({ ...c, done: true })), notes: 'Pool went well. Lost the semi from 8–5 up; work on closing out.', createdAt: 1, updatedAt: 1 };
  const upcomingStart = daysAgo(-10, today);
  const ev = { id: newId(), name: 'Men’s doubles 4.0', type: 'doubles' as MatchType, format: { pointsTo: 11, bestOf: 1, scoring: 'rally' } as Format, partnerName: 'Dev', structure: 'pools-knockout' as const,
    teams: [{ id: newId(), name: 'Kiran / Sameer' }, { id: newId(), name: 'Arjun / Om' }], otherResults: [], schedule: [] as Tournament['events'][number]['schedule'] };
  ev.schedule = [
    { id: newId(), at: `${upcomingStart}T09:30`, stage: 'pool', teamId: ev.teams[0].id, court: '2' },
    { id: newId(), at: `${upcomingStart}T11:00`, stage: 'pool', teamId: ev.teams[1].id, court: '4' },
  ];
  const upcoming: Tournament = { id: newId(), name: 'Chennai Pickleball Classic', startDate: upcomingStart, endDate: upcomingStart, venue: 'Anna Nagar Sports Club', events: [ev],
    checklist: starterChecklist().map((c, i) => ({ ...c, done: i < 3 })), createdAt: 2, updatedAt: 2 };
  await d.tournaments.bulkPut([past, upcoming]);

  const who = (names: string[]): Participant[] => [{ name: 'Dev', role: 'partner' }, ...names.map((n) => ({ name: n, role: 'opponent' as const, strength: 'equal' as const }))];
  const base = { type: 'doubles' as MatchType, category: 'tournament' as Category, format: md.format, outcome: 'played' as const, status: 'complete' as const, backfilled: false, tags: {}, venue: 'Indiranagar Arena' };
  const link = (stage: 'pool' | 'knockout', extra: object) => ({ tournamentId: past.id, eventId: md.id, stage, ...extra });
  const list: NewMatch[] = [
    { ...base, date: past.startDate, participants: who(['Arjun', 'Rohan']), games: [g(11, 9)], won: true, tournament: link('pool', { teamId: md.teams[0].id }) },
    { ...base, date: past.startDate, participants: who(['Sameer', 'Ali']), games: [g(11, 6, 'dominated')], won: true, tournament: link('pool', { teamId: md.teams[1].id }) },
    { ...base, date: past.startDate, participants: who(['Om', 'Nikhil']), games: [g(12, 10, 'came-back', 5, 9)], won: true, tournament: link('pool', { teamId: md.teams[2].id }) },
    { ...base, date: past.endDate, participants: who(['Neel', 'Isha']), games: [g(11, 7)], won: true, tournament: link('knockout', { round: 'Quarterfinal' }) },
    { ...base, date: past.endDate, participants: who(['Kiran', 'Sameer']), games: [g(9, 11, 'lost-lead', 8, 5)], won: false, tournament: link('knockout', { round: 'Semifinal' }) },
    { ...base, date: past.endDate, participants: who(['Arjun', 'Rohan']), games: [g(11, 8)], won: true, tournament: link('knockout', { round: 'Bronze match' }) },
    { ...base, type: 'mixed', date: past.endDate, participants: [{ name: 'Priya', role: 'partner' }, { name: 'Kavya', role: 'opponent', strength: 'weaker' }, { name: 'Ravi', role: 'opponent', strength: 'weaker' }], games: [g(11, 4)], won: true, tournament: { tournamentId: past.id, eventId: mx.id, stage: 'pool', teamId: mx.teams[0].id } },
    { ...base, type: 'mixed', date: past.endDate, participants: [{ name: 'Priya', role: 'partner' }, { name: 'Isha', role: 'opponent', rating: 3.8 }, { name: 'Neel', role: 'opponent', strength: 'stronger' }], games: [g(8, 11)], won: false, tournament: { tournamentId: past.id, eventId: mx.id, stage: 'pool', teamId: mx.teams[1].id } },
  ];
  for (const m of list) await addMatch(m, d);
  return list.length;
}

export async function clearAllData(d: PickleqDB = db): Promise<void> {
  await d.transaction('rw', [d.matches, d.players, d.ratings, d.sessions, d.drillCategories, d.goals, d.tournaments], async () => {
    for (const t of [d.matches, d.players, d.ratings, d.sessions, d.drillCategories, d.goals, d.tournaments]) await t.clear();
  });
}
