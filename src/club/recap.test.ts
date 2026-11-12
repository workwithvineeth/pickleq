import { describe, expect, it } from 'vitest';
import type { OfficialMatch } from './playerStudio';
import { buildRecaps, leadLine, recapCaption } from './recap';
import { wrapText } from './recapCard';

const m = (x: Partial<OfficialMatch>): OfficialMatch => ({
  id: 'x', club: 'Fixture Club', tournament: 'Fixture Open', tournamentId: 't1', division: 'Open Singles', kind: 'singles', stage: 'pool', playedOn: '2026-11-01',
  format: { pointsTo: 11 }, games: [{ a: 11, b: 5 }], winner: 'A', mySide: 'A', me: 'me', sideA: [{ id: 'me', name: 'Fixture Me' }], sideB: [{ id: 'r', name: 'Fixture Rival' }], ...x,
});
// 4–0 up, then 4–9 down, then seven straight: 11–9.
const comeback = 'AAAA' + 'BBBBBBBBB' + 'AAAAAAA';

describe('recap card data', () => {
  it('a champion: wins, points, finish and a comeback from the point-by-point record', () => {
    const [r] = buildRecaps([
      m({ id: 'p1', games: [{ a: 11, b: 4 }] }),
      m({ id: 'p2', winner: 'B', games: [{ a: 7, b: 11 }] }),
      m({ id: 's1', stage: 'sf', games: [{ a: 11, b: 9, points: comeback }] }),
      m({ id: 'f1', stage: 'final', playedOn: '2026-11-01', games: [{ a: 11, b: 6 }, { a: 11, b: 8 }] }),
    ]);
    expect(r).toMatchObject({ tournament: 'Fixture Open', played: 4, won: 3, lost: 1, pointsFor: 51, pointsAgainst: 38, finish: 'Champion' });
    expect(r.comeback).toEqual({ from: '4–9', final: '11–9', stage: 'semi-final' });
    expect(r.lead?.length).toBe(comeback.length + 1);
    expect(r.lead?.at(-1)).toBe(2);
    expect(r.headline).toBe('Champion · Open Singles');
  });

  it('finish is the furthest stage reached, from your side of the net', () => {
    expect(buildRecaps([m({ stage: 'final', winner: 'B' })])[0].finish).toBe('Runner-up');
    expect(buildRecaps([m({ stage: 'sf', mySide: 'B', winner: 'A', games: [{ a: 11, b: 3 }] })])[0].finish).toBe('Semi-finalist');
    expect(buildRecaps([m({ stage: 'sf' })])[0].finish).toBe('Finalist');
    expect(buildRecaps([m({ stage: 'qf', winner: 'B' })])[0].finish).toBe('Quarter-finalist');
    expect(buildRecaps([m({})])[0].finish).toBe('Pool stage');
  });

  it('one recap per tournament and division, newest first; scores read from your side', () => {
    const rs = buildRecaps([m({ tournamentId: 'old', tournament: 'Old Cup', playedOn: '2026-10-01' }), m({ mySide: 'B', winner: 'B', games: [{ a: 3, b: 11 }] }), m({ division: 'Open Doubles', kind: 'doubles' })]);
    expect(rs.map((r) => `${r.tournament}/${r.division}`)).toEqual(['Fixture Open/Open Singles', 'Fixture Open/Open Doubles', 'Old Cup/Open Singles']);
    expect(rs[0]).toMatchObject({ won: 1, pointsFor: 11, pointsAgainst: 3 });
  });

  it('the lead line follows your side', () => {
    expect(leadLine('ABBA', 'A')).toEqual([0, 1, 0, -1, 0]);
    expect(leadLine('ABBA', 'B')).toEqual([0, -1, 0, 1, 0]);
  });

  it('privacy: the caption and recap carry no partner or opponent names', () => {
    const r = buildRecaps([m({ stage: 'final', games: [{ a: 11, b: 9, points: comeback }] })])[0];
    const text = JSON.stringify(r) + recapCaption(r, 'Fixture Me');
    expect(text).not.toContain('Fixture Rival');
    expect(recapCaption(r, 'Fixture Me')).toBe('Fixture Me at Fixture Open (Open Singles): Champion. Came back from 4–9 to win 11–9. Results on RallyQ: rallyq.in');
  });

  it('long tournament names wrap and are cut with …', () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText(measure, 'PQ Demo Monsoon Singles Championship Hyderabad', 200, 2)).toEqual(['PQ Demo Monsoon', 'Singles Championshi…']);
    expect(wrapText(measure, 'Short Cup', 200, 2)).toEqual(['Short Cup']);
  });
});
