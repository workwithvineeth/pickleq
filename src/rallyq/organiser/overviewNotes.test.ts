import { describe, expect, it } from 'vitest';
import { overviewNotes } from './overviewNotes';

describe('Club overview entry notes (UX-01..UX-03)', () => {
  it('UX-01: a pending pay-at-venue entry is waiting for the organiser', () => {
    const o = overviewNotes([{ status: 'pending', payment: 'venue' }]);
    expect(o.needs).toBe(1);
    expect(o.needsNote).toBe('1 entry to review');
    expect(o.enteredNote).toBe('1 to review');
  });
  it('UX-02: a waitlisted entry is never "all confirmed"', () => {
    const o = overviewNotes([{ status: 'waitlist', payment: 'unpaid' }]);
    expect(o.enteredNote).toBe('1 on the waitlist');
    expect(o.needsNote).toBe('nothing waiting');
  });
  it('UX-03: an empty event says No entries yet', () => {
    expect(overviewNotes([]).enteredNote).toBe('No entries yet');
    expect(overviewNotes([{ status: 'withdrawn' }]).enteredNote).toBe('No entries yet');
  });
  it('counts a claimed UPI payment once and says all confirmed only when every entry is accepted', () => {
    const o = overviewNotes([{ status: 'pending', payment: 'claimed' }, { status: 'accepted', payment: 'paid' }]);
    expect(o.needs).toBe(1);
    expect(o.needsNote).toBe('1 entry to review · 1 payment to confirm');
    expect(overviewNotes([{ status: 'accepted', payment: 'paid' }, { status: 'accepted', payment: 'venue' }]).enteredNote).toBe('all confirmed');
  });
});
