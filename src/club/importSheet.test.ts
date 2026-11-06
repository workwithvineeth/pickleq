import CSV from '../../e2e/fixtures/google-form.csv?raw';
import SPLIT from '../../e2e/fixtures/google-form-split.csv?raw';
import { describe, expect, it } from 'vitest';
import { DemoBackend } from './demo';
import { buildImport, guessColumns, guessMapping, importSummary, pairBookingRows, parseTable } from './importSheet';
import type { Division } from './types';

const F = { pointsTo: 11 as const, bestOf: 1 as const, scoring: 'sideout' as const, golden: true };
const div = (id: string, kind: 'singles' | 'doubles', avg = false): Division => ({ id, tournamentId: 't', clubId: 'c', name: id, kind, format: F, koFormat: F, pools: 1, advance: 0, sort: 0, rules: { gender: 'open', maxDupr: 3.5, ...(avg ? { duprCap: 'average' as const } : {}) } });
const divs = [div('Singles', 'singles'), div('Doubles', 'doubles', true)];
const settings = { singles: 'Singles', doubles: 'Doubles', adults: true, status: 'accepted' as const, payment: 'unpaid' as const };

describe('Google Form import', () => {
  it('reads a form with separate singles and doubles questions (PLAYER 1 / PLAYER 2, "phone 2", "phone 3")', () => {
    const rows = parseTable(SPLIT);
    const { map, alt } = guessColumns(rows[0]);
    expect(map).toMatchObject({ kind: 1, name: 2, duprId: 3, dupr: 4, phone: 5, partnerName: 10, partnerPhone: 11, partnerDuprId: 12, partnerDupr: 13, paid: 14 });
    expect(alt).toMatchObject({ name: 6, phone: 7, duprId: 8, dupr: 9, paid: 15 });
    const out = buildImport(rows, map, divs, settings, [], alt);
    const by = (row: number) => out.find((r) => r.row === row)!;
    expect(by(2)).toMatchObject({ divisionId: 'Singles', payment: 'paid', players: [{ name: 'Robot Arjun', phone: '9848000001', duprId: 'RBT001', dupr: 3.2 }] });
    expect(by(2).problem).toBeUndefined();
    expect(by(3).problem).toBeUndefined(); // 3.683 + 3.262: team average under 3.5
    expect(by(3)).toMatchObject({ divisionId: 'Doubles', payment: 'paid', players: [{ name: 'Robot Arjun', phone: '9848000002', dupr: 3.683 }, { name: 'Robot Bhavna', phone: '98480 00003', duprId: 'RBT002' }] });
    expect(by(4)).toMatchObject({ payment: 'paid' }); // a UTR number in the payment column
    expect(by(5).problem).toMatch(/average|cap/); // 3.9 + 3.4 is over the team average
    expect(by(5).payment).toBe('unpaid');
  });
  it('a plain form still maps a later DUPR column to the player, not the partner', () => {
    const { map } = guessColumns(['Name', 'Phone', 'Partner name', 'Partner phone', 'DUPR']);
    expect(map).toMatchObject({ name: 0, phone: 1, partnerName: 2, partnerPhone: 3, dupr: 4 });
  });
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

describe('booking-platform export (one row per player, doubles paired by booking ID)', () => {
  const csv = [
    'sourceSheet,bookingId,ticketName,name,phone,email,duprRating,duprId,status',
    'Combined-Age18Plus,BK-1,Open Singles,Kabir Sharma,9844101234,k@example.test,3.41,ABC123,Paid',
    'Combined-Age18Plus,BK-2,Open Doubles,Isha Desai,9844105678,i@example.test,3.10,,Paid',
    'Combined-Age18Plus,BK-2,Open Doubles,Arjun Varma,9844105678,a@example.test,3.25,XYZ9,Paid',
    'Combined-Age18Plus,BK-3,Open Singles,Isha Desai,9844105678,i@example.test,3.10,,Paid',
    'Combined-Age18Plus,BK-4,Open Doubles,Tara Rao,9844107777,t@example.test,,,Paid',
    'Combined-Age18Plus,BK-4,Open Doubles,Dev Nair,9844108888,d@example.test,3.6,,Paid',
  ].join('\n');
  it('pairs doubles by booking, keeps singles, never uses the event as a name, and allows singles + doubles', () => {
    const paired = pairBookingRows(parseTable(csv));
    expect(paired.booking).toBe(true);
    expect(paired.pairs).toBe(2);
    expect(paired.rows.length).toBe(1 + 2 + 2);
    const { map, alt } = guessColumns(paired.rows[0]);
    expect(paired.rows[0][map.name]).toBe('name');
    expect(paired.rows[0][map.kind]).toBe('ticketName');
    const singles = { id: 's', kind: 'singles' } as unknown as Division;
    const doubles = { id: 'd', kind: 'doubles' } as unknown as Division;
    const out = buildImport(paired.rows, map, [singles, doubles], { singles: 's', doubles: 'd', adults: true, status: 'accepted', payment: 'venue' }, [], alt);
    expect(out.filter((r) => r.problem)).toEqual([]);
    const team = out.find((r) => r.players[0].name === 'Isha Desai' && r.divisionId === 'd')!;
    expect(team.players[1].name).toBe('Arjun Varma');
    expect(team.players[1].phone).toBe(''); // shared booking phone is not copied to the partner
    expect(team.players[1].duprId).toBe('XYZ9');
    expect(out.some((r) => r.players[0].name === 'Isha Desai' && r.divisionId === 's')).toBe(true);
    expect(out.every((r) => r.players.every((p) => p.name !== 'Open Singles' && p.name !== 'Open Doubles'))).toBe(true);
  });
  it('leaves ordinary Google Form sheets alone', () => {
    const rows = parseTable('Timestamp,Full name,Phone,Singles or doubles\n1,Asha,98,Singles');
    expect(pairBookingRows(rows).booking).toBe(false);
  });
});
