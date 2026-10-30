import { checkShape, drawRows, shapeFields, type NewMatchRow } from './plan';
import type { Format } from '../domain/types';
import type { ClubPlayer, ClubTournament, Division, DivisionKind, DivisionRules, Entry, EntryPerson, KnockoutStage, Registration } from './types';

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
  const teamAvg = need === 2 && rules?.maxDupr !== undefined && rules.duprCap === 'average';
  for (const [i, p] of players.entries()) {
    const name = p.name.trim();
    if (name.length < 1 || name.length > 60) return `Player ${i + 1}: enter their name`;
    if ((needPhone || p.phone.trim()) && !PHONE.test(p.phone.trim())) return `${name}: enter a phone number`;
    if (p.duprId?.trim() && !DUPR_ID.test(p.duprId.trim())) return `${name}: a DUPR ID is 3 to 20 letters or numbers`;
    if (p.dupr !== undefined && (!Number.isFinite(p.dupr) || p.dupr < 1 || p.dupr > 8)) return `${name}: DUPR rating is a number between 1 and 8`;
    if (!p.gender) return `${name}: choose a gender`;
    if (p.age === undefined && !needPhone && p.adult) {
      // Imported entry: the organiser confirmed this player is an adult.
      if (minAge > ADULT_AGE) return `${name}: this event is for players aged ${minAge} and over, so add their age`;
    } else {
      if (p.age === undefined || !Number.isInteger(p.age) || p.age < 1 || p.age > 120) return `${name}: enter their age`;
      if (p.age < ADULT_AGE) return 'Players must be 18 or over. Junior events aren’t supported yet.';
      if (p.age < minAge) return `${name}: this event is for players aged ${minAge} and over`;
    }
    if (rules?.maxDupr !== undefined) {
      if (p.dupr === undefined) return `${name}: this event needs a DUPR rating (${teamAvg ? 'team average ' : ''}${capText(rules.maxDupr)} and under)`;
      if (!teamAvg && p.dupr > rules.maxDupr) return `${name}: rating ${p.dupr} is above this event’s cap of ${capText(rules.maxDupr)}`;
    }
  }
  if (teamAvg && rules?.maxDupr !== undefined) {
    const avg = Math.round(((players[0].dupr ?? 0) + (players[1].dupr ?? 0)) / 2 * 1000) / 1000;
    if (avg > rules.maxDupr) return `Team average ${capText(avg)} is above this event’s cap of ${capText(rules.maxDupr)}`;
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
  if (rules?.maxDupr !== undefined) parts.push(`${kind === 'doubles' && rules.duprCap === 'average' ? 'DUPR team average' : 'DUPR'} ${capText(rules.maxDupr)} and under`);
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

export interface DrawChoice {
  divisionId: string;
  pools: number;
  advance: number;
  shape?: 'ko';
  extra?: number;
  /** Game formats chosen at the draw; the event's own formats are kept when these are left out. */
  format?: Format;
  koFormat?: Format;
  stageFormats?: Partial<Record<KnockoutStage, Format>>;
}

export interface DrawPlan {
  players: ClubPlayer[];
  divisions: Division[];
  entries: Entry[];
  matches: NewMatchRow[];
  links: { registrationId: string; entryId: string }[];
  /** Courts, match length and start time, if the organiser changed them at the draw. */
  timing?: { courts: number; slotMinutes: number; startTime: string };
}

/** Checks a division's pools before drawing, using the same rules as creating a tournament. */
export function drawProblem(div: Division, accepted: number, choice: DrawChoice): string | null {
  if (accepted < 2) return `${div.name}: an event needs at least 2 entries`;
  const e = checkShape(choice, accepted);
  return e ? `${div.name}: ${e}` : null;
}

/** The division as it will be drawn: its pools, knockout shape and formats from the organiser's choice. */
export function applyChoice(div: Division, choice: DrawChoice): Division {
  const ko = choice.shape === 'ko';
  const base: Division = { ...div, pools: ko ? 1 : choice.pools, advance: ko ? 0 : choice.advance, format: choice.format ?? div.format, koFormat: choice.koFormat ?? div.koFormat };
  delete base.shape; delete base.extra; delete base.stageFormats;
  return { ...base, ...shapeFields({ shape: choice.shape, extra: ko ? undefined : choice.extra, stageFormats: choice.stageFormats ?? div.stageFormats }) };
}

/**
 * Who a person on an entry is, for spotting the same person twice (people often play singles and doubles, and sheets get
 * imported again): the last 10 digits of their phone, else their name. The server's import uses the same rule (person_key).
 */
export function personKey(p: Pick<EntryPerson, 'name' | 'phone'>): string {
  const ph = digits(p.phone ?? '');
  if (ph.length >= 8) return `p:${ph.slice(-10)}`;
  return `n:${p.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

/**
 * The draw for a registration tournament: every accepted entry becomes a roster player (with their DUPR ID and rating)
 * and an entry, then pools and a schedule are made exactly as for a tournament set up by hand. Someone entered in more
 * than one event (same phone) is one player, so the schedule never puts them on two courts at once.
 */
export function planDraw(t0: ClubTournament, divisions: Division[], regs: Registration[], choices: DrawChoice[], newId: () => string, timing?: DrawPlan['timing']): DrawPlan | string {
  if (t0.drawnAt) return 'The draw is already made';
  const t = timing ? { ...t0, ...timing } : t0;
  const players: ClubPlayer[] = [];
  const groups: { division: Division; entries: string[][]; regIds: string[] }[] = [];
  const pmap = new Map<string, ClubPlayer>();
  const byPerson = new Map<string, ClubPlayer>();
  const outDivs: Division[] = [];
  for (const div of divisions) {
    const accepted = regs.filter((r) => r.divisionId === div.id && r.status === 'accepted');
    if (!accepted.length) continue;
    const choice = choices.find((c) => c.divisionId === div.id) ?? { divisionId: div.id, pools: 1, advance: 0 };
    const problem = drawProblem(div, accepted.length, choice);
    if (problem) return problem;
    const d2 = applyChoice(div, choice);
    outDivs.push(d2);
    const entries: string[][] = [];
    for (const r of accepted) {
      const ids = r.players.map((p) => {
        const key = personKey(p);
        const known = byPerson.get(key);
        const duprId = p.duprId?.trim().toUpperCase() || undefined;
        if (known) {
          // Same person in another event: keep one player, and fill in the rating for this kind of event.
          if (div.kind === 'singles' && p.dupr !== undefined && known.duprSingles === undefined) known.duprSingles = p.dupr;
          if (div.kind === 'doubles' && p.dupr !== undefined && known.duprDoubles === undefined) known.duprDoubles = p.dupr;
          if (!known.duprId && duprId) known.duprId = duprId;
          return known.id;
        }
        const pl: ClubPlayer = { id: newId(), clubId: t.clubId, name: p.name.trim(), duprSingles: div.kind === 'singles' ? p.dupr : undefined, duprDoubles: div.kind === 'doubles' ? p.dupr : undefined, duprId, share: {} };
        players.push(pl);
        pmap.set(pl.id, pl);
        byPerson.set(key, pl);
        return pl.id;
      });
      entries.push(ids);
    }
    groups.push({ division: d2, entries, regIds: accepted.map((r) => r.id) });
  }
  if (!groups.length) return 'Accept some entries first';
  // The same person can't be in two entries of one event (or both players of one team).
  for (const g of groups) {
    const ids = g.entries.flat();
    const twice = ids.find((id, i) => ids.indexOf(id) !== i);
    if (twice) return `${g.division.name}: ${pmap.get(twice)?.name ?? 'a player'} is in two accepted entries (same phone number). Turn one down first.`;
  }
  const drawn = drawRows(t, groups.map(({ division, entries }) => ({ division, entries })), pmap, newId);
  // drawRows reorders by seed, so match each entry back to its registration by its players.
  const links: DrawPlan['links'] = [];
  for (const g of groups) {
    g.entries.forEach((ids, i) => {
      const e = drawn.entries.find((x) => x.divisionId === g.division.id && x.playerIds.join() === ids.join());
      if (e) links.push({ registrationId: g.regIds[i], entryId: e.id });
    });
  }
  return { players, divisions: outDivs, entries: drawn.entries, matches: drawn.matches, links, ...(timing ? { timing } : {}) };
}

/** An empty person for entry forms. */
export const blankPerson = (): EntryPerson => ({ name: '', phone: '', duprId: '', dupr: undefined, gender: '', age: undefined });
