/** What the organiser's Club overview says about entries (UX-01..UX-03, 19 Nov 2026). */
export interface EntryLike { status: string; payment?: string }

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function overviewNotes(all: EntryLike[]) {
  const r = all.filter((x) => !['withdrawn', 'rejected'].includes(x.status));
  const pending = r.filter((x) => x.status === 'pending').length;
  const waitlist = r.filter((x) => x.status === 'waitlist').length;
  const claims = r.filter((x) => x.payment === 'claimed' && x.status !== 'withdrawn').length;
  // An entry needs the organiser when it's pending or its UPI payment is claimed but not checked (counted once).
  const needs = r.filter((x) => x.status === 'pending' || x.payment === 'claimed').length;
  const accepted = r.filter((x) => x.status === 'accepted').length;

  const enteredParts = [pending && n(pending, 'to review', 'to review'), waitlist && n(waitlist, 'on the waitlist', 'on the waitlist')].filter(Boolean);
  const enteredNote = !r.length ? 'No entries yet' : enteredParts.length ? enteredParts.join(' · ') : accepted === r.length ? 'all confirmed' : `${accepted} confirmed`;

  const needParts = [pending && n(pending, 'entry to review', 'entries to review'), claims && n(claims, 'payment to confirm', 'payments to confirm')].filter(Boolean);
  const needsNote = needParts.length ? needParts.join(' · ') : 'nothing waiting';

  return { entered: r.length, enteredNote, needs, needsNote, pending, claims, waitlist };
}
