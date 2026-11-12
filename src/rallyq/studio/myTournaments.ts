import type { MyEntry, PublicTournament } from '../../club/backend';
import { slotTime } from '../../club/domain/engine';
import { friendlyDate } from '../../club/dates';
import { PAYMENT_LABEL, REG_STATUS_LABEL } from '../../club/types';

/** One upcoming tournament on the Player Studio "My tournaments" card. */
export interface MyTournamentItem {
  id: string;
  slug: string;
  title: string;
  when: string;
  status: { cls: string; text: string };
  /** "Playing now · Court 2" or "Next match 10:30 am · Court 1 · vs Asha / Lata"; empty before the draw. */
  next: string;
  /** Payment words when there's a fee ("Paid by UPI · not checked yet"); empty for free events. */
  pay: string;
}

const clock12 = (hm: string) => { const [h, m] = hm.split(':').map(Number); return Number.isFinite(h) ? `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` : hm; };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Same words as My entries: waiting is neutral, confirmed is good, the rest is quiet. */
export function entryStatus(x: Pick<MyEntry, 'status' | 'fee' | 'payment'>): { cls: string; text: string } {
  if (x.status === 'accepted') return { cls: 'st ok', text: 'Confirmed' };
  if (x.status === 'pending') return { cls: 'st wait', text: x.fee && x.payment === 'unpaid' ? 'Waiting for payment' : REG_STATUS_LABEL.pending };
  if (x.status === 'waitlist') return { cls: 'st off', text: 'Waitlist' };
  return { cls: x.status === 'rejected' ? 'st no' : 'st off', text: REG_STATUS_LABEL[x.status] };
}

/** Entries still in play (requested, accepted, waitlist), today or later, soonest first. */
export function upcomingEntries(entries: MyEntry[], today: string): MyEntry[] {
  return entries
    .filter((x) => (x.status === 'pending' || x.status === 'accepted' || x.status === 'waitlist') && !x.results && x.startDate >= today)
    .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
}

/** The player's next match in a drawn tournament, found by division and the entry's player names. */
export function nextMatchLine(x: MyEntry, d: PublicTournament | null | undefined): string {
  if (!d || !x.drawn) return '';
  const div = d.divisions.find((v) => norm(v.name) === norm(x.division));
  const names = x.players.map((p) => norm(p.name)).sort().join('|');
  const entry = d.entries.find((e) => (!div || e.divisionId === div.id) && e.names.map(norm).sort().join('|') === names);
  if (!entry) return '';
  const mine = d.matches.filter((m) => m.entryA === entry.id || m.entryB === entry.id);
  const other = (m: (typeof mine)[number]) => { const id = m.entryA === entry.id ? m.entryB : m.entryA; return d.entries.find((e) => e.id === id)?.names.join(' / '); };
  const live = mine.find((m) => m.status === 'live');
  if (live) return ['Playing now', live.court ? `Court ${live.court}` : '', other(live) ? `vs ${other(live)}` : ''].filter(Boolean).join(' · ');
  const next = mine.filter((m) => m.status === 'scheduled').sort((a, b) => (a.slot ?? 1e9) - (b.slot ?? 1e9))[0];
  if (!next) return mine.length ? 'All your matches so far are played' : '';
  return [next.slot !== undefined ? `Next match ${clock12(slotTime(d.startTime, next.slot, d.slotMinutes))}` : 'Next match', next.court ? `Court ${next.court}` : '', other(next) ? `vs ${other(next)}` : ''].filter(Boolean).join(' · ');
}

export function myTournamentItems(entries: MyEntry[], today: string, events: Record<string, PublicTournament | null | undefined>): MyTournamentItem[] {
  return upcomingEntries(entries, today).map((x) => ({
    id: x.id,
    slug: x.slug,
    title: `${x.tournament} · ${x.division}`,
    when: [friendlyDate(x.startDate), [x.venue, x.city].filter(Boolean).join(', '), x.club].filter(Boolean).join(' · '),
    status: entryStatus(x),
    next: nextMatchLine(x, events[x.slug]),
    pay: x.fee ? `₹${x.fee} · ${PAYMENT_LABEL[x.payment]}` : '',
  }));
}
