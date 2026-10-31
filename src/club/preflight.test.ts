import { describe, expect, it } from 'vitest';
import { preflight, type PreflightInput } from './preflight';
import type { ClubTournament, Division, Entry } from './types';

const fmt = { pointsTo: 11, bestOf: 1, scoring: 'sideout' } as const;
const t = { id: 't', clubId: 'c', name: 'Diwali Open', startDate: '2026-11-01', startTime: '14:30', courts: 3, slotMinutes: 20, status: 'live', isPublic: true, publicSlug: 's', entryMode: 'registration' } as ClubTournament;
const div = (id: string, pools: number, advance: number): Division => ({ id, tournamentId: 't', clubId: 'c', name: id, kind: 'singles', format: fmt, koFormat: fmt, pools, advance, sort: 0, rules: {} } as Division);
const entries = (d: string, n: number): Entry[] => Array.from({ length: n }, (_, i) => ({ id: `${d}${i}`, divisionId: d, clubId: 'c', playerIds: [`${d}p${i}`], status: 'active' } as Entry));
const base: PreflightInput = { t, divisions: [div('Singles', 1, 0), div('Doubles', 1, 0)], entries: [], matches: [], linkCourts: [], pins: true };

describe('organiser pre-flight check', () => {
  it('catches what TPC had on Saturday: no entries, no draw, no referee links', () => {
    const r = preflight(base);
    expect(r.map((x) => [x.key, x.ok])).toEqual([['entries', false], ['draw', false], ['links', false], ['pins', true], ['finish', false]]);
    expect(r[0].text).toBe('No entries yet');
    expect(r[0].fix).toBe('inbox');
  });

  it('warns when one big round robin would run past 10 pm (16 + 16 entries ≈ next day)', () => {
    const r = preflight({ ...base, accepted: { Singles: 16, Doubles: 16 } });
    const finish = r.find((x) => x.key === 'finish');
    expect(finish?.ok).toBe(false);
    expect(finish?.text).toMatch(/240 matches; the last one ends about .* the next day\. Choose a faster format/);
  });

  it('pools of 4 with top 2 to the knockouts finish the same evening', () => {
    const r = preflight({ ...base, divisions: [div('Singles', 4, 2), div('Doubles', 4, 2)], accepted: { Singles: 16, Doubles: 16 } });
    expect(r.find((x) => x.key === 'finish')?.ok).toBe(true);
  });

  it('is all ticks once entries, draw, links and PINs are done', () => {
    const es = [...entries('Singles', 8), ...entries('Doubles', 8)];
    const matches = [es[0], es[8]].map((e, i) => ({ id: `m${i}`, divisionId: e.divisionId, status: 'scheduled' })) as PreflightInput['matches'];
    const r = preflight({ ...base, divisions: [div('Singles', 2, 2), div('Doubles', 2, 2)], entries: es, matches, linkCourts: [1, 2, 3] });
    expect(r.every((x) => x.ok)).toBe(true);
    expect(r[2].text).toBe('Referee links for all 3 courts');
  });

  it('counts an any-court link, and says how many courts still need one', () => {
    expect(preflight({ ...base, linkCourts: [0] })[2].ok).toBe(true);
    expect(preflight({ ...base, linkCourts: [1] })[2].text).toBe('Referee links for 1 of 3 courts');
  });
});
