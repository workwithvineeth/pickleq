import { checkDivision, drawRows, type NewMatchRow } from './plan';
import type { ClubPlayer, ClubTournament, Division, DivisionKind, DivisionRules, Entry, EntryPerson, Registration } from './types';

export const ADULT_AGE = 18;
const PHONE = /^\+?[0-9][0-9 -]{7,15}$/;
const DUPR_ID = /^[A-Za-z0-9-]{3,20}$/;

export const digits = (phone: string) => phone.replace(/\D/g, '');

/**
 * Whether these players may enter an event. Returns a message saying why not, or null if they can.
 * The club server checks exactly the same rules (supabase migration 0004, entry_problem), so this only gives a quicker answer.
 * needPhone: online entries need a phone number; the organiser's offline entries may leave it empty.
 */
export function entryProblem(kind: DivisionKind, rules: DivisionRules | undefined, players: EntryPerson[], needPhone: boolean): string | null {
  const need = kind === 'doubles' ? 2 : 1;
  if (players.length !== need) return need === 2 ? 'A doubles entry needs two players' : 'A singles entry is one player';
  const minAge = Math.max(ADULT_AGE, rules?.minAge ?? ADULT_AGE);
  for (const [i, p] of players.entries()) {
    const name = p.name.trim();
    if (name.length < 1 || name.length > 60) return `Player ${i + 1}: enter their name`;
    if ((needPhone || p.phone.trim()) && !PHONE.test(p.phone.trim())) return `${name}: enter a phone number`;
    if (p.duprId?.trim() && !DUPR_ID.test(p.duprId.trim())) return `${name}: a DUPR ID is 3 to 20 letters or numbers`;
    if (p.dupr !== undefined && (!Number.isFinite(p.dupr) || p.dupr < 1 || p.dupr > 8)) return `${name}: DUPR rating is a number between 1 and 8`;
    if (!p.gender) return `${name}: choose a gender`;
    if (p.age === undefined || !Number.isInteger(p.age) || p.age < 1 || p.age > 120) return `${name}: enter their age`;
    if (p.age < ADULT_AGE) return 'Players must be 18 or over. Junior events aren’t supported yet.';
    if (p.age < minAge) return `${name}: this event is for players aged ${minAge} and over`;
    if (rules?.maxDupr !== undefined) {
      if (p.dupr === undefined) return `${name}: this event needs a DUPR rating (${capText(rules.maxDupr)} and under)`;
      if (p.dupr > rules.maxDupr) return `${name}: rating ${p.dupr} is above this event’s cap of ${capText(rules.maxDupr)}`;
    }
  }
  const g = players.map((p) => p.gender);
  if (rules?.gender === 'men' && g.some((x) => x !== 'm')) return 'This event is for men';
  if (rules?.gender === 'women' && g.some((x) => x !== 'f')) return 'This event is for women';
  if (rules?.gender === 'mixed' && !(need === 2 && g.includes('m') && g.includes('f'))) return 'A mixed doubles team is one man and one woman';
  if (need === 2 && players[0].phone.trim() && digits(players[0].phone) === digits(players[1].phone)) return 'The two players need different phone numbers';
  return null;
}

export const capText = (r: number) => (Number.isInteger(r * 10) ? r.toFixed(1) : String(r));

/** A short line saying who an event is for, e.g. "Men · DUPR 3.5 and under · 35+ · ₹800". */
export function rulesLine(kind: DivisionKind, rules?: DivisionRules): string {
  const parts: string[] = [];
  if (rules?.gender && rules.gender !== 'open') parts.push(rules.gender === 'men' ? 'Men' : rules.gender === 'women' ? 'Women' : 'Mixed');
  parts.push(kind === 'doubles' ? 'Doubles' : 'Singles');
  if (rules?.maxDupr !== undefined) parts.push(`DUPR ${capText(rules.maxDupr)} and under`);
  if (rules?.minAge) parts.push(`${rules.minAge}+`);
  parts.push(rules?.fee ? `₹${rules.fee}` : 'Free entry');
  return parts.join(' · ');
}

/**
 * A UPI payment link that opens the player's UPI app with the organiser, amount and a note filled in.
 * PICKLEQ never sees or holds the money; the player pays the organiser directly.
 */
export function upiLink(upiId: string, payee: string, amount: number | undefined, note: string): string {
  const q = new URLSearchParams({ pa: upiId, pn: payee.slice(0, 40), cu: 'INR', tn: note.slice(0, 60) });
  if (amount) q.set('am', String(amount));
  return `upi://pay?${q.toString()}`;
}

export const isActive = (r: Registration) => r.status === 'pending' || r.status === 'accepted' || r.status === 'waitlist';

/** Counts the organiser needs at a glance, for one event. */
export function inboxCounts(regs: Registration[], cap?: number) {
  const c = { accepted: 0, pending: 0, waitlist: 0, rejected: 0, withdrawn: 0, paid: 0, unpaidAccepted: 0, spotsLeft: undefined as number | undefined };
  for (const r of regs) {
    c[r.status] += 1;
    if (r.payment === 'paid') c.paid += 1;
    if (r.status === 'accepted' && r.payment !== 'paid') c.unpaidAccepted += 1;
  }
  if (cap !== undefined) c.spotsLeft = Math.max(0, cap - c.accepted - c.pending);
  return c;
}

export interface DrawChoice { divisionId: string; pools: number; advance: number }

export interface DrawPlan {
  players: ClubPlayer[];
  divisions: Division[];
  entries: Entry[];
  matches: NewMatchRow[];
  links: { registrationId: string; entryId: string }[];
}

/** Checks a division's pools before drawing, using the same rules as creating a tournament. */
export function drawProblem(div: Division, accepted: number, choice: DrawChoice): string | null {
  const fake = Array.from({ length: accepted }, (_, i) => (div.kind === 'doubles' ? [`a${i}`, `b${i}`] : [`a${i}`]));
  const e = checkDivision({ name: div.name, kind: div.kind, format: div.format, koFormat: div.koFormat, pools: choice.pools, advance: choice.advance, entries: fake });
  return e ? `${div.name}: ${e}` : null;
}

/**
 * The draw for a registration tournament: every accepted entry becomes a roster player (with their DUPR ID and rating)
 * and an entry, then pools and a schedule are made exactly as for a tournament set up by hand.
 */
export function planDraw(t: ClubTournament, divisions: Division[], regs: Registration[], choices: DrawChoice[], newId: () => string): DrawPlan | string {
  if (t.drawnAt) return 'The draw is already made';
  const players: ClubPlayer[] = [];
  const groups: { division: Division; entries: string[][]; regIds: string[] }[] = [];
  const pmap = new Map<string, ClubPlayer>();
  const outDivs: Division[] = [];
  for (const div of divisions) {
    const accepted = regs.filter((r) => r.divisionId === div.id && r.status === 'accepted');
    if (!accepted.length) continue;
    const choice = choices.find((c) => c.divisionId === div.id) ?? { divisionId: div.id, pools: 1, advance: 0 };
    const problem = drawProblem(div, accepted.length, choice);
    if (problem) return problem;
    const d2: Division = { ...div, pools: choice.pools, advance: choice.advance };
    outDivs.push(d2);
    const entries: string[][] = [];
    for (const r of accepted) {
      const ids = r.players.map((p) => {
        const pl: ClubPlayer = { id: newId(), clubId: t.clubId, name: p.name.trim(), duprSingles: div.kind === 'singles' ? p.dupr : undefined, duprDoubles: div.kind === 'doubles' ? p.dupr : undefined, duprId: p.duprId?.trim().toUpperCase() || undefined, share: {} };
        players.push(pl);
        pmap.set(pl.id, pl);
        return pl.id;
      });
      entries.push(ids);
    }
    groups.push({ division: d2, entries, regIds: accepted.map((r) => r.id) });
  }
  if (!groups.length) return 'Accept some entries first';
  const drawn = drawRows(t, groups.map(({ division, entries }) => ({ division, entries })), pmap, newId);
  // drawRows reorders by seed, so match each entry back to its registration by its players.
  const links: DrawPlan['links'] = [];
  for (const g of groups) {
    g.entries.forEach((ids, i) => {
      const e = drawn.entries.find((x) => x.divisionId === g.division.id && x.playerIds.join() === ids.join());
      if (e) links.push({ registrationId: g.regIds[i], entryId: e.id });
    });
  }
  return { players, divisions: outDivs, entries: drawn.entries, matches: drawn.matches, links };
}

/** An empty person for entry forms. */
export const blankPerson = (): EntryPerson => ({ name: '', phone: '', duprId: '', dupr: undefined, gender: '', age: undefined });
