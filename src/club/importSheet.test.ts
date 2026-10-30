import CSV from '../../e2e/fixtures/google-form.csv?raw';
import { describe, expect, it } from 'vitest';
import { DemoBackend } from './demo';
import { buildImport, guessMapping, importSummary, parseTable } from './importSheet';
import type { Division } from './types';

const F = { pointsTo: 11 as const, bestOf: 1 as const, scoring: 'sideout' as const, golden: true };
const div = (id: string, kind: 'singles' | 'doubles', avg = false): Division => ({ id, tournamentId: 't', clubId: 'c', name: id, kind, format: F, koFormat: F, pools: 1, advance: 0, sort: 0, rules: { gender: 'open', maxDupr: 3.5, ...(avg ? { duprCap: 'average' as const } : {}) } });
const divs = [div('Singles', 'singles'), div('Doubles', 'doubles', true)];
const settings = { singles: 'Singles', doubles: 'Doubles', adults: true, status: 'accepted' as const, payment: 'unpaid' as const };

describe('Google Form import', () => {
  it('parses CSV with quotes, and tab-separated rows pasted from Sheets', () => {
    const rows = parseTable(CSV);
    expect(rows).toHaveLength(10);
    expect(rows[4][7]).toBe('Robot Farhan, Jr');
    const tsv = parseTable('Name\tPhone\nA B\t98480 00000\n\n');
    expect(tsv).toEqual([['Name', 'Phone'], ['A B', '98480 00000']]);
  });
  it('guesses the columns from a Google Form export (timestamp and email first)', () => {
    const m = guessMapping(parseTable(CSV)[0]);
    expect(m).toMatchObject({ kind: 2, name: 3, phone: 4, dupr: 5, duprId: 6, partnerName: 7, partnerPhone: 8, partnerDupr: 9, gender: -1, age: -1 });
  });
  it('flags problems: over the cap, missing partner, the same person twice; team average allowed', () => {
    const rows = parseTable(CSV);
    const out = buildImport(rows, guessMapping(rows[0]), divs, settings, []);
    const by = (row: number) => out.find((r) => r.row === row);
    expect(by(2)?.problem).toBeUndefined();
    expect(by(3)?.problem).toBeUndefined();
    expect(by(4)?.problem).toBeUndefined(); // Chetan 3.6 + Divya 3.2: team average 3.4
    expect(by(5)?.problem).toMatch(/needs a DUPR rating/); // partner's rating is "NA"
    expect(by(6)?.problem).toMatch(/above this event’s cap/); // 3.9 in singles
    expect(by(7)?.problem).toMatch(/no partner/);
    expect(by(8)?.problem).toMatch(/Same person as row 2/);
    expect(by(9)?.problem).toBeUndefined(); // Chetan plays singles as well as doubles: allowed
    expect(importSummary(out)).toEqual({ ready: 5, already: 0, problems: 4 });
    // Without ages and without the organiser's confirmation, nobody can be imported.
    const noAdults = buildImport(rows, guessMapping(rows[0]), divs, { ...settings, adults: false }, []);
    expect(noAdults.filter((r) => !r.problem)).toHaveLength(0);
  });
  it('imports into the demo once: importing the same sheet again adds nobody', async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as unknown as Storage;
    const b = new DemoBackend(storage);
    const clubId = await b.start('Organiser');
    const tid = await b.createTournament({
      clubId, name: 'Import Open', startDate: '2026-11-01', startTime: '14:30', courts: 3, slotMinutes: 15, entryMode: 'registration',
      divisions: [{ name: 'Singles', kind: 'singles', format: F, koFormat: F, pools: 1, advance: 0, entries: [], rules: { gender: 'open', maxDupr: 3.5 } },
        { name: 'Doubles', kind: 'doubles', format: F, koFormat: F, pools: 1, advance: 0, entries: [], rules: { gender: 'open', maxDupr: 3.5, duprCap: 'average' } }],
    });
    const tb = await b.tournamentBundle(tid);
    const s = { ...settings, singles: tb.divisions[0].id, doubles: tb.divisions[1].id };
    const rows = parseTable(CSV);
    const once = async () => {
      const plan = buildImport(rows, guessMapping(rows[0]), tb.divisions, s, await b.registrations(tid)).filter((r) => !r.problem && !r.already);
      return b.importEntries(tid, plan.map((r) => ({ divisionId: r.divisionId as string, players: r.players, status: 'accepted', payment: r.payment })));
    };
    expect((await once()).added).toBe(5);
    expect((await once()).added).toBe(0);
    // Sent again directly (bypassing the preview), the backend still skips them.
    const again = await b.importEntries(tid, [{ divisionId: tb.divisions[0].id, players: [{ name: 'Robot Aarav', phone: '9848011001', gender: 'x', adult: true, dupr: 3.21 }], status: 'accepted', payment: 'unpaid' }]);
    expect([again.added, again.skipped]).toEqual([0, 1]);
    expect((await b.registrations(tid)).length).toBe(5);
  });
});
