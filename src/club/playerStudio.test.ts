import { describe, expect, it } from 'vitest';
import {
  blankLog, cleanLog, cleanSession, goalProgress, homeStory, logProblem, logToMatch, matchStory, officialToMatch, ratingHistory, ratingPrefill,
  ratingProblem, sessionProblem, studioCoach, studioMatches, studioStats, type OfficialMatch, type StudioData, type StudioLog, type StudioSession,
} from './playerStudio';

const TODAY = new Date('2026-11-07T10:00:00');

const official = (over: Partial<OfficialMatch> = {}): OfficialMatch => ({
  id: 'o1', club: 'Fixture Club', tournament: 'Fixture Open', tournamentId: 't1', division: 'Singles', kind: 'singles', stage: 'pool',
  playedOn: '2026-11-01', format: { pointsTo: 11 }, games: [{ a: 11, b: 7 }], winner: 'A', mySide: 'A', me: 'p-me',
  sideA: [{ id: 'p-me', name: 'Fixture Me' }], sideB: [{ id: 'p-o', name: 'Fixture Rival' }], ...over,
});
const log = (over: Partial<StudioLog> = {}): StudioLog => ({ ...blankLog('2026-11-05'), id: 'l1', opponents: 'Casual Friend', games: [{ you: 11, them: 5 }], score_for: 11, score_against: 5, ...over });
const session = (over: Partial<StudioSession> = {}): StudioSession => ({
  id: 's1', session_on: '2026-11-06', kind: 'solo', minutes: 45, intensity: 3, drills: [{ category: 'Dinks', made: 18, attempts: 25 }], ratings: {}, note: '', created_at: '2026-11-06T10:00:00Z', ...over,
});
const data = (over: Partial<StudioData> = {}): StudioData => ({
  players: [], official: [], logs: [], sessions: [], ratings: [], settings: { useOfficial: true, goals: [] }, ...over,
});

describe('match logging', () => {
  it('needs an opponent and a decided score, and fills totals from the games', () => {
    expect(logProblem({ ...blankLog('2026-11-07'), opponents: '' })).toMatch(/who you played/);
    expect(logProblem({ ...blankLog('2026-11-07'), opponents: 'X', games: [{ you: 11, them: 11 }] })).toMatch(/can’t end level/);
    const twoGames = { ...blankLog('2026-11-07'), opponents: 'X', games: [{ you: 11, them: 4 }, { you: 6, them: 11 }] };
    expect(logProblem(twoGames)).toMatch(/deciding game/);
    const three = cleanLog({ ...twoGames, opponents: '  X  ', games: [...twoGames.games, { you: 11, them: 9 }] });
    expect([three.opponents, three.score_for, three.score_against]).toEqual(['X', 2, 1]);
    expect(cleanLog({ ...twoGames, games: [{ you: 11, them: 8 }] })).toMatchObject({ score_for: 11, score_against: 8 });
  });

  it('turns a diary match into a self-reported Phase 1 match', () => {
    const m = logToMatch(log({ partner: 'Pal', opponents: 'Ravi & Meena', match_type: 'mixed', energy: 4, opponent_strength: 'stronger', shot_ratings: { Dink: 3 } }));
    expect(m).toMatchObject({ type: 'mixed', category: 'casual', won: true, backfilled: true, energy: 4, shotRatings: { Dink: 3 } });
    expect(m.participants.map((p) => `${p.role}:${p.name}:${p.strength ?? ''}`)).toEqual(['partner:Pal:', 'opponent:Ravi:stronger', 'opponent:Meena:stronger']);
  });
});

describe('practice sessions', () => {
  it('checks minutes and made ≤ tries, and strips a rest day', () => {
    expect(sessionProblem({ ...session(), minutes: 0 }, TODAY)).toMatch(/minutes/);
    expect(sessionProblem({ ...session(), drills: [{ category: 'Dinks', made: 30, attempts: 25 }] }, TODAY)).toMatch(/more than tries/);
    expect(sessionProblem({ ...session(), session_on: '2026-12-01' }, TODAY)).toMatch(/future/);
    expect(sessionProblem({ ...session(), kind: 'rest', minutes: 0 }, TODAY)).toBe('');
    expect(cleanSession({ ...session(), kind: 'rest', ratings: { Serve: 3 } })).toMatchObject({ minutes: 0, drills: [], ratings: {}, intensity: null });
  });
});

describe('official results', () => {
  it('reads momentum from point-by-point scoring, from my side', () => {
    // B (the rival) leads 0–5, then A (me) wins 11 straight: a comeback for me.
    const points = 'BBBBB' + 'A'.repeat(11);
    const o = official({ games: [{ a: 11, b: 5, points }] });
    const s = matchStory(o);
    expect(s.tracked).toBe(true);
    expect(s.games[0]).toMatchObject({ you: 11, them: 5, momentum: 'came-back', from: '0–5' });
    expect(homeStory(data({ official: [o] }))).toMatch(/^Came back from 0–5 to win in Fixture Open/);
  });

  it('shows the score from my side when I was side B, and marks untracked games', () => {
    const o = official({ mySide: 'B', me: 'p-o', winner: 'A', games: [{ a: 11, b: 9 }] });
    expect(officialToMatch(o)).toMatchObject({ won: false, category: 'tournament', backfilled: true });
    expect(matchStory(o)).toEqual({ tracked: false, games: [{ you: 9, them: 11, momentum: 'neither' }] });
  });
});

describe('DUPR ratings', () => {
  const players = [{ playerId: 'p1', name: 'Me', club: 'Fixture Club', claimedAt: '2026-11-02T08:00:00Z', duprSingles: 3.4 }];
  it('prefills from the organiser until you save your own, and keeps both in the history', () => {
    expect(ratingPrefill('singles', { ratings: [], players })).toBe(3.4);
    expect(ratingPrefill('doubles', { ratings: [], players })).toBeUndefined();
    const ratings = [{ id: 'r1', kind: 'singles' as const, value: 3.52, rated_on: '2026-11-05' }];
    expect(ratingHistory('singles', { ratings, players }).map((h) => `${h.source}:${h.value}:${h.date}`)).toEqual(['you:3.52:2026-11-05', 'organiser:3.4:2026-11-02']);
    expect(ratingPrefill('singles', { ratings, players })).toBe(3.52);
  });
  it('rejects ratings outside 1–8', () => {
    expect(ratingProblem({ kind: 'singles', value: 9, rated_on: '2026-11-01' }, TODAY)).toMatch(/between 1.000 and 8.000/);
    expect(ratingProblem({ kind: 'singles', value: 3.5, rated_on: '2026-11-01' }, TODAY)).toBe('');
  });
});

describe('stats', () => {
  it('filters by source and respects “use official results”', () => {
    const d = data({ official: [official()], logs: [log({ score_for: 4, score_against: 11, games: [{ you: 4, them: 11 }] })] });
    expect(studioMatches(d).length).toBe(2);
    expect(studioMatches({ ...d, settings: { useOfficial: false, goals: [] } }).length).toBe(1);
    expect(studioStats(d, { source: 'official', range: 'all', type: 'all' }, TODAY).summary.record).toEqual({ wins: 1, losses: 0 });
    const all = studioStats(d, undefined, TODAY);
    expect(all.summary.record).toEqual({ wins: 1, losses: 1 });
    expect(all.splits.byCategory.tournament).toEqual({ wins: 1, losses: 0 });
    expect(all.opponents.map((o) => o.name)).toEqual(['Fixture Rival', 'Casual Friend']);
  });

  it('counts the week, the streak and drill success', () => {
    const st = studioStats(data({ sessions: [session(), session({ id: 's2', session_on: '2026-11-07', kind: 'rest', minutes: 0, drills: [] })] }), undefined, TODAY);
    expect([st.weekMinutes, st.streak]).toEqual([45, 2]);
    expect(st.drills[0]).toMatchObject({ category: 'Dinks', made: 18, attempts: 25, pct: 72 });
  });
});

describe('coach', () => {
  it('labels official and drill findings as measured, diary findings as estimates', () => {
    const offs = [1, 2, 3, 4].map((i) => official({ id: `o${i}`, playedOn: `2026-10-0${i}`, games: [{ a: i % 2 ? 11 : 9, b: i % 2 ? 9 : 11 }], winner: i % 2 ? 'A' : 'B' }));
    const sessions = [session({ drills: [{ category: 'Dinks', made: 20, attempts: 50 }] }), session({ id: 's2', session_on: '2026-11-01', ratings: { Serve: 2 } }),
      session({ id: 's3', session_on: '2026-11-02', ratings: { Serve: 3 } }), session({ id: 's4', session_on: '2026-11-03', ratings: { Serve: 2 } })];
    const cards = studioCoach(data({ official: offs, sessions }), TODAY);
    const ids = (e: string) => cards.filter((c) => c.evidence === e).map((c) => c.id);
    expect(ids('measured')).toEqual(expect.arrayContaining(['official-close', 'drill-Dinks']));
    expect(ids('self-reported')).toContain('rating-Serve');
    expect(cards.find((c) => c.id === 'rating-Serve')!.text).toMatch(/your estimate, not a measurement/);
    // Measured always comes first.
    expect(cards.findIndex((c) => c.evidence === 'self-reported')).toBeGreaterThan(cards.findLastIndex((c) => c.evidence === 'measured'));
  });

  it('says nothing about official results the player chose to leave out', () => {
    const offs = [1, 2, 3].map((i) => official({ id: `o${i}` }));
    expect(studioCoach(data({ official: offs, settings: { useOfficial: false, goals: [] } }), TODAY)).toEqual([]);
  });
});

describe('goals', () => {
  it('tracks a DUPR goal from your latest reading', () => {
    const st = studioStats(data({ ratings: [{ id: 'r', kind: 'doubles', value: 3.6, rated_on: '2026-11-01' }] }), undefined, TODAY);
    expect(goalProgress({ kind: 'rating', rating: 'doubles', target: 4 }, st)).toMatchObject({ current: 3.6, fraction: 0.9, text: 'Doubles DUPR: 3.600 of 4.000' });
    expect(goalProgress({ kind: 'rating', rating: 'singles', target: 4 }, st).text).toMatch(/add a reading/);
    expect(goalProgress({ kind: 'weekly-minutes', target: 90 }, st)).toMatchObject({ current: 0, fraction: 0 });
  });
});
