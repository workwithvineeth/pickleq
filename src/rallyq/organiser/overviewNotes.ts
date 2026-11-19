/** What the organiser's Club overview says about entries (UX-01..UX-03, 19 Nov 2026 exact-copy spec). */
export interface EntryLike { status: string; payment?: string; id?: string; players?: { name: string }[] }

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const active = (all: EntryLike[]) => all.filter((x) => !['withdrawn', 'rejected'].includes(x.status));

export function overviewNotes(all: EntryLike[]) {
  const r = active(all);
  const pending = r.filter((x) => x.status === 'pending').length;
  const waitlist = r.filter((x) => x.status === 'waitlist').length;
  const claims = r.filter((x) => x.payment === 'claimed').length;
  // An entry needs the organiser when it's pending or its UPI payment is claimed but not checked (counted once).
  const needs = r.filter((x) => x.status === 'pending' || x.payment === 'claimed').length;
  const accepted = r.filter((x) => x.status === 'accepted').length;
  // Waitlisted teams are not entered (UX-02): they wait for a place.
  const entered = r.length - waitlist;

  const enteredParts = [pending && n(pending, 'to review', 'to review'), waitlist && `On the waitlist · ${waitlist}`].filter(Boolean);
  const enteredNote = !r.length ? 'No entries yet' : enteredParts.length ? enteredParts.join(' · ') : accepted === r.length ? 'all confirmed' : `${accepted} confirmed`;

  const needParts = [pending && n(pending, 'entry waiting for your decision', 'entries waiting for your decision'), claims && n(claims, 'payment to confirm', 'payments to confirm')].filter(Boolean);
  const needsNote = needParts.length ? needParts.join(' · ') : 'nothing waiting';

  return { entered, enteredNote, needs, needsNote, pending, claims, waitlist };
}

export interface EventLike { entryMode?: string; listing?: string; registrationOpen?: boolean; approval?: string }
export interface EntryPanel { title: string; note: string; items: { id: string; name: string; payment: string }[]; cta?: { label: string; to: 'club-inbox' | 'event-enter' } }

/** The entries panels under the overview tiles: decisions first, then the waitlist, then the empty state. */
export function entryPanels(all: EntryLike[], ev: EventLike, paymentLabel: (p?: string) => string): EntryPanel[] {
  if (ev.listing === 'listed') return []; // listing-only events take entries outside RallyQ
  const r = active(all);
  const pending = r.filter((x) => x.status === 'pending');
  const waiting = r.filter((x) => x.status === 'waitlist');
  const name = (x: EntryLike) => (x.players ?? []).map((p) => p.name).filter(Boolean).join(' & ') || 'Entry';
  const out: EntryPanel[] = [];
  if (pending.length) out.push({ title: `Needs your decision · ${pending.length}`, note: n(pending.length, 'entry waiting for your decision', 'entries waiting for your decision'),
    items: pending.map((x, i) => ({ id: x.id ?? String(i), name: name(x), payment: paymentLabel(x.payment) })), cta: { label: pending.length === 1 ? 'Review entry' : 'Review entries', to: 'club-inbox' } });
  if (waiting.length) out.push({ title: `On the waitlist · ${waiting.length}`, note: n(waiting.length, 'team waiting for a place', 'teams waiting for a place'), items: [] });
  if (!r.length) {
    // Only an approved event with open online registration has an entry page to show (UX-03).
    const online = ev.entryMode === 'registration' && !!ev.registrationOpen && (!ev.approval || ev.approval === 'approved');
    out.push({ title: 'No entries yet', note: 'Teams will appear here when they request entry or you add them.', items: [],
      cta: online ? { label: 'View entry page', to: 'event-enter' } : { label: 'Add players', to: 'club-inbox' } });
  }
  return out;
}
