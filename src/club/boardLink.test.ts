import { describe, expect, it } from 'vitest';
import { eventsBoardHref } from './boardLink';

describe('eventsBoardHref', () => {
  it('opens that event on the Events board when it is listed there', () => {
    expect(eventsBoardHref({ publicSlug: 'cedar-open', listing: 'run' })).toBe('#/events/cedar-open');
    expect(eventsBoardHref({ publicSlug: 'cedar-open', listing: 'listed' })).toBe('#/events/cedar-open');
  });
  it('falls back to the board itself when the event is not listed or there is no event', () => {
    expect(eventsBoardHref({ publicSlug: 'cedar-open', listing: 'none' })).toBe('#/events');
    expect(eventsBoardHref({ publicSlug: '', listing: 'run' })).toBe('#/events');
    expect(eventsBoardHref(undefined)).toBe('#/events');
  });
  it('never links to the old public page', () => {
    expect(eventsBoardHref({ publicSlug: 'a b', listing: 'run' })).not.toContain('#/event/');
  });
});
