import { checkMatch } from '../domain/scoring';
import { TAGS, type Category, type Format, type Game, type MatchType, type Participant, type RatingEntry, type TagMark } from '../domain/types';
import { db, newId, type PickleqDB } from './db';
import { addMatch, type NewMatch } from './matches';

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

export async function loadSampleData(d: PickleqDB = db): Promise<number> {
  const items = sampleMatches();
  for (const m of items) await addMatch(m, d);
  await d.ratings.bulkPut(sampleRatings());
  return items.length;
}

export async function clearAllData(d: PickleqDB = db): Promise<void> {
  await d.transaction('rw', [d.matches, d.players, d.ratings], async () => {
    await d.matches.clear();
    await d.players.clear();
    await d.ratings.clear();
  });
}
