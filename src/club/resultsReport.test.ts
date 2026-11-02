import { describe, expect, it } from 'vitest';
import { DemoBackend } from './demo';
import { resultsChampions, resultsCsv, resultsRows, scoreText } from './resultsReport';

describe('organiser results exports', () => {
  it('exports stored format-specific ratings, pool positions and every knockout game', async () => {
    const b = new DemoBackend(null); const club = await b.start('Fixture');
    const cb = await b.clubBundle(club);
    const d = await b.resultsBundle(cb.tournaments.find((t) => t.name === 'PQ Demo Open')!.id);
    const div = d.divisions[0];
    const p = d.players.find((p) => d.entries.some((e) => e.divisionId === div.id && e.playerIds.includes(p.id)))!;
    p.name = '=HYPERLINK("bad")'; p.duprSingles = 3.125; p.duprDoubles = 4.25;
    const m = d.matches.find((m) => m.divisionId === div.id)!;
    d.matches = d.matches.filter((m) => m.divisionId !== div.id || m.stage !== 'final');
    d.matches.push({ ...m, id: 'fixture-final', stage: 'final', status: 'done', winner: 'A', games: [{ a: 11, b: 6, points: '' }, { a: 8, b: 11, points: '' }, { a: 11, b: 9, points: '' }] });
    const rows = resultsRows(d);
    expect(rows.some((r) => r[2] === 'Final' && r[14] === '11–6, 8–11, 11–9')).toBe(true);
    expect(resultsChampions(d).find((c) => c.division === div.name)?.score).toBe('11–6, 8–11, 11–9');
    d.matches[d.matches.length - 1].winner = 'B';
    expect(resultsChampions(d).find((c) => c.division === div.name)?.score).toBe('6–11, 11–8, 9–11');
    d.matches[d.matches.length - 1].status = 'scheduled';
    expect(resultsChampions(d).some((c) => c.division === div.name)).toBe(false);
    const row = rows.find((r) => r[4] === p.name && r[2].endsWith('standings'))!;
    expect(row[5]).toBe(div.kind === 'singles' ? '3.125' : '4.25');
    expect(resultsCsv(d)).toContain("'=HYPERLINK");
    expect(rows[0]).toContain('Position / match');
    expect(scoreText({ ...m, status: 'scheduled' })).toBe('Not played');
    expect(scoreText({ ...m, status: 'void' })).toBe('Cancelled');
  });
});
