import { emptyGame, type Game, type Momentum, type Participant, type TagMark } from '../domain/types';
import { db, type PickleqDB } from './db';
import { addMatch, type NewMatch } from './matches';

const g = (you: number, them: number, momentum: Momentum = 'neither', fromYou?: number, fromThem?: number): Game => ({ ...emptyGame(), you, them, momentum, fromYou, fromThem });
const opp = (name: string, rating?: number, strength?: Participant['strength']): Participant => ({ name, role: 'opponent', rating, strength });
const partner = (name: string): Participant => ({ name, role: 'partner' });

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Realistic sample matches for the Preview version only. Never used in Live. */
export function sampleMatches(): NewMatch[] {
  const base = { format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' } as const, outcome: 'played' as const, backfilled: false };
  const tags = (t: Record<string, TagMark>) => t;
  return [
    { ...base, date: daysAgo(2), type: 'mixed', category: 'casual', participants: [partner('Priya'), opp('Rohan', 3.9), opp('Kiran', undefined, 'equal')], games: [g(11, 8)], won: true, status: 'incomplete', tags: {} },
    { ...base, date: daysAgo(2), type: 'mixed', category: 'casual', participants: [partner('Priya'), opp('Rohan', 3.9), opp('Kiran', undefined, 'equal')], games: [g(9, 11, 'lost-lead', 8, 4)], won: false, status: 'incomplete', tags: {} },
    { ...base, date: daysAgo(4), type: 'singles', category: 'practice', participants: [opp('Arjun', 3.9)], games: [g(11, 6, 'dominated')], won: true, status: 'complete', tags: tags({ Serve: 'went-well' }), energy: 4, venue: 'Koramangala Courts', setting: 'outdoor' },
    { ...base, date: daysAgo(6), type: 'doubles', category: 'casual', participants: [partner('Dev'), opp('Sameer', 4.1), opp('Ali', 3.7)], games: [g(11, 9, 'came-back', 5, 9)], won: true, status: 'complete', tags: tags({ 'Backhand drive': 'needs-work', Dinking: 'went-well' }), energy: 3, venue: 'Koramangala Courts', setting: 'outdoor' },
    { ...base, date: daysAgo(9), type: 'singles', category: 'tournament', format: { pointsTo: 11, bestOf: 3, scoring: 'sideout' }, participants: [opp('Sameer', 4.1)], games: [g(7, 11), g(11, 9), g(8, 11)], won: false, status: 'complete', tags: tags({ 'Backhand drive': 'needs-work', 'Focus when leading': 'needs-work' }), energy: 2, venue: 'Pune Smash', setting: 'indoor', notes: 'Lefty kept attacking my backhand in game 3.' },
    { ...base, date: daysAgo(9), type: 'doubles', category: 'tournament', format: { pointsTo: 11, bestOf: 3, scoring: 'sideout' }, participants: [partner('Dev'), opp('Nikhil', 3.6), opp('Om', 3.5)], games: [g(11, 5), g(11, 7)], won: true, status: 'complete', tags: tags({ 'Third-shot drop': 'went-well' }), energy: 3, venue: 'Pune Smash', setting: 'indoor' },
    { ...base, date: daysAgo(12), type: 'doubles', category: 'practice', format: { pointsTo: 15, bestOf: 1, scoring: 'rally' }, participants: [partner('Meera'), opp('Kavya', undefined, 'weaker'), opp('Ravi', undefined, 'weaker')], games: [g(15, 9)], won: true, status: 'complete', tags: {}, energy: 4 },
    { ...base, date: daysAgo(15), type: 'singles', category: 'casual', participants: [opp('Rohan', 3.9)], games: [], outcome: 'walkover', won: true, status: 'complete', tags: {} },
  ] as NewMatch[];
}

export async function loadSampleData(d: PickleqDB = db): Promise<number> {
  const items = sampleMatches();
  for (const m of items) await addMatch(m, d);
  return items.length;
}

export async function clearAllData(d: PickleqDB = db): Promise<void> {
  await d.transaction('rw', d.matches, d.players, async () => {
    await d.matches.clear();
    await d.players.clear();
  });
}
