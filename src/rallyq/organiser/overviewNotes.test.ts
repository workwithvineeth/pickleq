import { describe, expect, it } from 'vitest';
import { entryPanels, overviewNotes } from './overviewNotes';

const label = (p?: string) => (p === 'venue' ? 'Paying at the venue' : p === 'paid' ? 'Paid' : 'Not paid');
const run = { entryMode: 'roster', listing: 'run' };

describe('Club overview entry notes (UX-01..UX-03)', () => {
  it('UX-01: a pending pay-at-venue entry is waiting for the organiser', () => {
    const o = overviewNotes([{ status: 'pending', payment: 'venue' }]);
    expect(o.needs).toBe(1);
    expect(o.needsNote).toBe('1 entry waiting for your decision');
    expect(o.enteredNote).toBe('1 to review');
    const [p] = entryPanels([{ id: 'r1', status: 'pending', payment: 'venue', players: [{ name: 'Asha Rao' }, { name: 'Dev Iyer' }] }], run, label);
    expect(p.title).toBe('Needs your decision · 1');
    expect(p.note).toBe('1 entry waiting for your decision');
    expect(p.items).toEqual([{ id: 'r1', name: 'Asha Rao & Dev Iyer', payment: 'Paying at the venue' }]);
    expect(p.cta).toEqual({ label: 'Review entry', to: 'club-inbox' });
  });
  it('UX-01: once accepted it leaves the decision queue (payment state is untouched)', () => {
    const o = overviewNotes([{ status: 'accepted', payment: 'venue' }]);
    expect(o.needs).toBe(0);
    expect(o.needsNote).toBe('nothing waiting');
    expect(entryPanels([{ status: 'accepted', payment: 'venue' }], run, label)).toEqual([]);
  });
  it('UX-02: a waitlisted entry is not entered and never "all confirmed"', () => {
    const o = overviewNotes([{ status: 'waitlist', payment: 'unpaid' }]);
    expect(o.entered).toBe(0);
    expect(o.enteredNote).toBe('On the waitlist · 1');
    expect(o.needsNote).toBe('nothing waiting');
    expect(entryPanels([{ status: 'waitlist' }], run, label)).toEqual([{ title: 'On the waitlist · 1', note: '1 team waiting for a place', items: [] }]);
  });
  it('UX-02: promoting from the waitlist moves the team into Teams entered', () => {
    expect(overviewNotes([{ status: 'accepted' }, { status: 'waitlist' }]).entered).toBe(1);
    expect(overviewNotes([{ status: 'accepted' }, { status: 'accepted' }]).entered).toBe(2);
  });
  it('UX-03: an empty event says No entries yet with the CTA for its entry mode', () => {
    expect(overviewNotes([]).enteredNote).toBe('No entries yet');
    expect(overviewNotes([{ status: 'withdrawn' }]).enteredNote).toBe('No entries yet');
    const [roster] = entryPanels([], run, label);
    expect(roster).toEqual({ title: 'No entries yet', note: 'Teams will appear here when they request entry or you add them.', items: [], cta: { label: 'Add players', to: 'club-inbox' } });
    expect(entryPanels([], { entryMode: 'registration', registrationOpen: true, approval: 'approved' }, label)[0].cta?.label).toBe('View entry page');
  });
  it('UX-03: draft or closed events never imply entries are open; listing-only events show no entries', () => {
    expect(entryPanels([], { entryMode: 'registration', registrationOpen: true, approval: 'draft' }, label)[0].cta?.label).toBe('Add players');
    expect(entryPanels([], { entryMode: 'registration', registrationOpen: false }, label)[0].cta?.label).toBe('Add players');
    expect(entryPanels([], { listing: 'listed' }, label)).toEqual([]);
  });
  it('counts a claimed UPI payment once and says all confirmed only when every entry is accepted', () => {
    const o = overviewNotes([{ status: 'pending', payment: 'claimed' }, { status: 'accepted', payment: 'paid' }]);
    expect(o.needs).toBe(1);
    expect(o.needsNote).toBe('1 entry waiting for your decision · 1 payment to confirm');
    expect(overviewNotes([{ status: 'accepted', payment: 'paid' }, { status: 'accepted', payment: 'venue' }]).enteredNote).toBe('all confirmed');
  });
});
