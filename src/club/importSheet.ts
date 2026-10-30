/**
 * Importing entries from a Google Form's response sheet (downloaded as CSV, or rows copied from Google Sheets, which
 * paste as tab-separated text). Columns are guessed from their headings; the organiser confirms the guess. Nothing here
 * talks to the server: it only turns the sheet into entries and lists the problems.
 */
import { capText, entryProblem, personKey } from './registration';
import type { Division, EntryPerson, Payment, PlayerGender, Registration } from './types';

/** Parses CSV (with "quoted, fields" and "" escapes) or tab-separated rows. Empty rows are dropped. */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n').find((l) => l.trim()) ?? '';
  const sep = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

export type Field = 'kind' | 'name' | 'phone' | 'gender' | 'age' | 'dupr' | 'duprId' | 'partnerName' | 'partnerPhone' | 'partnerGender' | 'partnerAge' | 'partnerDupr' | 'partnerDuprId' | 'paid';
export const FIELD_LABEL: Record<Field, string> = {
  kind: 'Singles or doubles', name: 'Player name', phone: 'Player phone', gender: 'Player gender', age: 'Player age', dupr: 'Player DUPR rating', duprId: 'Player DUPR ID',
  partnerName: 'Partner name', partnerPhone: 'Partner phone', partnerGender: 'Partner gender', partnerAge: 'Partner age', partnerDupr: 'Partner DUPR rating', partnerDuprId: 'Partner DUPR ID',
  paid: 'Paid (yes/no)',
};
export const FIELDS = Object.keys(FIELD_LABEL) as Field[];
/** Column number for each field; -1 = not in the sheet. */
export type Mapping = Record<Field, number>;

const isPartner = (h: string) => /partner|player\s*2|2nd\s*player|second\s*player|team\s*-?mate|player\s*two/.test(h);
const isIdCol = (h: string) => /\bid\b|dupr\s*(id|number|no\b)|player\s*id/.test(h);

/** Guesses which column holds what, from the headings. Timestamp and email columns are ignored. */
export function guessMapping(header: string[]): Mapping {
  const m = Object.fromEntries(FIELDS.map((f) => [f, -1])) as Mapping;
  const take = (f: Field, i: number) => { if (m[f] === -1) m[f] = i; };
  header.forEach((raw, i) => {
    const h = raw.toLowerCase();
    if (/time\s*stamp|^email|e-mail|email address/.test(h)) return;
    const partner = isPartner(h);
    if (/singles|doubles|are you playing|category|event|format/.test(h) && !/name|phone|dupr/.test(h)) return take('kind', i);
    if (/dupr|rating/.test(h)) return take(isIdCol(h) ? (partner ? 'partnerDuprId' : 'duprId') : (partner ? 'partnerDupr' : 'dupr'), i);
    if (/phone|mobile|whats\s*app|contact\s*(no|number)|\bcell\b/.test(h)) return take(partner ? 'partnerPhone' : 'phone', i);
    if (/gender|\bsex\b/.test(h)) return take(partner ? 'partnerGender' : 'gender', i);
    if (/\bage\b|years old/.test(h)) return take(partner ? 'partnerAge' : 'age', i);
    if (/paid|payment|transaction|utr/.test(h)) return take('paid', i);
    if (/name/.test(h)) return take(partner ? 'partnerName' : 'name', i);
  });
  return m;
}

export interface ImportSettings {
  /** Division for rows that say singles / doubles (or every row, when there's no singles/doubles column). */
  singles?: string;
  doubles?: string;
  /** The organiser confirms every player is 18 or over (needed when the sheet has no ages). */
  adults: boolean;
  status: 'accepted' | 'pending';
  payment: Extract<Payment, 'unpaid' | 'venue' | 'paid'>;
}

export interface ImportRow {
  /** Row number in the sheet (the heading is row 1). */
  row: number;
  divisionId?: string;
  players: EntryPerson[];
  /** Why this row can't be imported (it's left out). */
  problem?: string;
  /** Already entered in this event: skipped, so importing again never makes duplicates. */
  already?: boolean;
  payment: ImportSettings['payment'];
}

const gender = (v: string): PlayerGender | '' => {
  const x = v.trim().toLowerCase();
  if (/^(m|male|man|men|boy|gents?)$/.test(x)) return 'm';
  if (/^(f|female|woman|women|girl|ladies|lady)$/.test(x)) return 'f';
  return x ? 'x' : '';
};
const num = (v: string) => { const m = v.replace(',', '.').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : undefined; };
const phone = (v: string) => v.replace(/[^\d+ -]/g, '').trim();

/**
 * Turns sheet rows into entries for the chosen events, flagging problems: no event, missing partner, rule breaks
 * (DUPR cap, gender, age), the same phone twice in the sheet, and people already entered (skipped).
 */
export function buildImport(rows: string[][], map: Mapping, divisions: Division[], s: ImportSettings, existing: Registration[]): ImportRow[] {
  const body = rows.slice(1);
  const cell = (r: string[], f: Field) => (map[f] >= 0 ? (r[map[f]] ?? '').trim() : '');
  const seen = new Map<string, number>();
  for (const x of existing) for (const p of x.players) seen.set(`${x.divisionId}|${personKey(p)}`, -1);
  return body.map((r, i): ImportRow => {
    const row = i + 2;
    const kind = cell(r, 'kind').toLowerCase();
    const isDoubles = map.kind >= 0 ? /double|pair|team/.test(kind) : !!s.doubles && !s.singles;
    const divisionId = map.kind >= 0 ? (/double|pair|team/.test(kind) ? s.doubles : /single/.test(kind) ? s.singles : undefined) : (s.singles ?? s.doubles);
    const div = divisions.find((d) => d.id === divisionId);
    const person = (pre: '' | 'partner'): EntryPerson => {
      const f = (k: string) => cell(r, (pre ? `partner${k[0].toUpperCase()}${k.slice(1)}` : k) as Field);
      const age = num(f('age'));
      const rawGender = gender(f('gender'));
      return {
        name: f('name').replace(/\s+/g, ' ').slice(0, 60), phone: phone(f('phone')), duprId: f('duprId').replace(/[^A-Za-z0-9-]/g, '') || undefined,
        dupr: (() => { const d = num(f('dupr')); return d !== undefined && d >= 1 && d <= 8 ? d : undefined; })(),
        // Open events don't need a gender; "x" means not given.
        gender: rawGender || (div && (div.rules?.gender ?? 'open') === 'open' ? 'x' : ''),
        ...(age !== undefined ? { age: Math.round(age) } : s.adults ? { adult: true } : {}),
      };
    };
    const players = [person('')];
    if (isDoubles || div?.kind === 'doubles') players.push(person('partner'));
    const paidCell = cell(r, 'paid').toLowerCase();
    const payment: ImportSettings['payment'] = map.paid >= 0 && /^(y|yes|paid|done|✓|true)/.test(paidCell) ? 'paid' : s.payment;
    const base = { row, divisionId, players, payment };
    if (!div) return { ...base, problem: kind ? `No event chosen for “${cell(r, 'kind')}”` : 'Says neither singles nor doubles' };
    if (!players[0].name) return { ...base, problem: 'No player name' };
    if (div.kind === 'doubles' && !players[1]?.name) return { ...base, problem: 'Doubles entry with no partner name' };
    const keys = players.map((p) => `${div.id}|${personKey(p)}`);
    const before = keys.map((k) => seen.get(k)).find((v) => v !== undefined);
    if (before === -1) return { ...base, already: true };
    if (before !== undefined) return { ...base, problem: `Same person as row ${before} (same phone or name)` };
    const rule = entryProblem(div.kind, div.rules, players, false);
    if (rule) return { ...base, problem: rule.replace('choose a gender', 'gender is missing (this event is for one gender)') };
    keys.forEach((k) => seen.set(k, row));
    return base;
  });
}

/** Counts for the preview. */
export function importSummary(rows: ImportRow[]) {
  return { ready: rows.filter((r) => !r.problem && !r.already).length, already: rows.filter((r) => r.already).length, problems: rows.filter((r) => r.problem).length };
}

/** What the DUPR column check says, e.g. "DUPR team average 3.5 and under". */
export const capWords = (d: Division) => (d.rules?.maxDupr === undefined ? '' : `${d.kind === 'doubles' && d.rules.duprCap === 'average' ? 'team average ' : ''}${capText(d.rules.maxDupr)} and under`);
