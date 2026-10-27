import { describe, expect, it } from 'vitest';
import { insights, shotAverages, tagStats } from './insights';
import { DEFAULT_FORMAT, type Game, type Match, type TagMark, type TrainingSession } from './types';

let seq = 0;
function m(won: boolean, over: Partial<Match> = {}): Match {
  seq++;
  const g: Game = won ? { you: 11, them: 5, momentum: 'neither' } : { you: 5, them: 11, momentum: 'neither' };
  return { id: `m${seq}`, date: `2026-10-${String((seq % 27) + 1).padStart(2, '0')}`, type: 'singles', category: 'casual', format: DEFAULT_FORMAT,
    participants: [], outcome: 'played', games: [g], won, status: 'complete', backfilled: false, tags: {}, createdAt: seq, updatedAt: seq, history: [], ...over };
}
const tags = (t: Record<string, TagMark>) => ({ tags: t });
const base = { sessions: [] as TrainingSession[], singles: [], doubles: [], today: new Date('2026-10-28T10:00:00') };

describe('tag stats', () => {
  it('counts needs-work and went-well tags in wins and losses, only from tagged matches', () => {
    const list = [
      m(false, tags({ 'Backhand drive': 'needs-work' })), m(true, tags({ 'Backhand drive': 'needs-work', Serve: 'went-well' })),
      m(false, { ...tags({ 'Backhand drive': 'needs-work' }), status: 'incomplete' }),
    ];
    const bh = tagStats(list).find((t) => t.tag === 'Backhand drive')!;
    expect(bh).toMatchObject({ needsWork: 2, needsInLosses: 1, needsInWins: 1 });
    expect(tagStats(list).find((t) => t.tag === 'Serve')).toMatchObject({ wentWell: 1, wellInWins: 1 });
  });
});

describe('insights', () => {
  it('flags a tag that clusters in losses, with the exact counts and no cause', () => {
    const list = [
      ...Array.from({ length: 4 }, () => m(false, tags({ 'Backhand drive': 'needs-work' }))),
      m(false),
      ...Array.from({ length: 5 }, () => m(true)), m(true, tags({ 'Backhand drive': 'needs-work' })),
    ];
    const i = insights({ ...base, matches: list }).find((x) => x.id === 'tag-losses-Backhand drive');
    expect(i?.text).toBe('Backhand drive was tagged “needs work” in 4 of your 5 tagged losses, but in 1 of 6 tagged wins.');
    expect(i?.text).not.toMatch(/because|caused|reason/i);
    expect(i?.coachQuestion).toMatch(/backhand drive/);
  });

  it('stays quiet with too little data', () => {
    expect(insights({ ...base, matches: [m(false, tags({ 'Backhand drive': 'needs-work' })), m(true)] })).toEqual([]);
  });

  it('notes a low close-game record against the overall record', () => {
    const close = (won: boolean) => m(won, { games: [won ? { you: 11, them: 9, momentum: 'neither' } : { you: 9, them: 11, momentum: 'neither' }] });
    const list = [close(true), close(false), close(false), close(false), close(false), m(true), m(true), m(true), m(true), m(true)];
    expect(insights({ ...base, matches: list }).find((x) => x.id === 'close-games')?.text).toBe(
      'You\'ve won 20% of close games (decided by 3 or fewer, 1–4), against 60% of matches overall.');
  });

  it('compares low and high energy only when both have at least 3 matches', () => {
    const list = [m(false, { energy: 1 }), m(false, { energy: 2 }), m(true, { energy: 2 }), m(true, { energy: 4 }), m(true, { energy: 5 }), m(true, { energy: 4 })];
    expect(insights({ ...base, matches: list }).find((x) => x.id === 'energy')?.text).toBe(
      'Your win rate is 33% when you logged energy 1–2 (3 matches) and 100% at energy 4–5 (3 matches).');
    expect(insights({ ...base, matches: list.slice(1) }).find((x) => x.id === 'energy')).toBeUndefined();
  });

  it('finds the weakest drill and a drill-versus-match gap, labelling the estimate', () => {
    const sess = (date: string, category: string, made: number, attempts: number): TrainingSession =>
      ({ id: date + category, date, type: 'solo', minutes: 60, drills: [{ category, made, attempts }], createdAt: 0, updatedAt: 0 });
    const sessions = [sess('2026-10-20', 'Backhand drives', 26, 50), sess('2026-10-21', 'Third-shot drops', 36, 50)];
    const rated = [1, 2, 3].map(() => m(true, { shotRatings: { 'Third-shot drop': 3 } }));
    const out = insights({ ...base, matches: rated, sessions });
    expect(out.find((x) => x.id === 'weak-drill-Backhand drives')?.text).toBe('Backhand drives is your lowest measured drill in the last 30 days: 52% (26/50).');
    expect(out.find((x) => x.id === 'drill-gap-Third-shot drop')?.text).toMatch(/72% in drills, but you rate your third-shot drop 3\/5 in matches \(your estimate, 3 matches\)/);
  });

  it('reports rating progress over 30 days', () => {
    const r = (value: number, date: string) => ({ id: date, kind: 'doubles' as const, value, date, source: 'dupr-manual' as const, createdAt: 0 });
    const out = insights({ ...base, matches: [], doubles: [r(3.7, '2026-09-20'), r(3.82, '2026-10-25')] });
    expect(out.find((x) => x.id === 'rating-doubles')?.text).toBe('Your doubles DUPR rose 0.12 in the last 30 days, to 3.82.');
  });
});

describe('coach questions', () => {
  it('asks about a shot only once when both a tag pattern and a weak drill point at it', () => {
    const list = [
      ...Array.from({ length: 4 }, () => m(false, tags({ 'Backhand drive': 'needs-work' }))),
      ...Array.from({ length: 4 }, () => m(true)),
    ];
    const sessions = [{ id: 'x', date: '2026-10-20', type: 'solo' as const, minutes: 60, drills: [{ category: 'Backhand drives', made: 26, attempts: 50 }], createdAt: 0, updatedAt: 0 }];
    const out = insights({ ...base, matches: list, sessions });
    expect(out.filter((i) => i.coachQuestion && /backhand/i.test(i.coachQuestion))).toHaveLength(1);
    expect(out.find((i) => i.id === 'weak-drill-Backhand drives')).toBeDefined();
  });
});

describe('shot averages', () => {
  it('averages your estimates and splits recent from earlier', () => {
    const list = [5, 4, 4, 3, 3, 2, 2].map((v) => m(true, { shotRatings: { Serve: v } }));
    expect(shotAverages(list).find((s) => s.shot === 'Serve')).toEqual({ shot: 'Serve', average: 3.3, n: 7, recent: 3.8, earlier: 2 });
  });
});
