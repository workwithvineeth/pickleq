import { describe, expect, it } from 'vitest';
import { scrubSentryEvent, scrubText, scrubUrl } from './scrub';

const TOKEN = 'k7Qx9TnB2mVwL4pRzA8cYd3FhJ6sUe1G';

describe('court links never leave the phone', () => {
  it('removes the referee court-link token from a full court URL', () => {
    const out = scrubUrl(`https://paddleq.in/#/court/${TOKEN}`);
    expect(out).not.toContain(TOKEN);
    expect(out).toBe('https://paddleq.in/#/court/[token]');
  });

  it.each([
    [`https://paddleq.in/#/desk/${TOKEN}`, 'https://paddleq.in/#/desk/[token]'],
    [`https://paddleq.in/#/helper/${TOKEN}`, 'https://paddleq.in/#/helper/[token]'],
    [`https://paddleq.in/#/club-claim/${TOKEN}`, 'https://paddleq.in/#/club-claim/[token]'],
    [`https://paddleq.in/pickleq/club/#/court/${TOKEN}?pin=123456`, 'https://paddleq.in/pickleq/club/#/court/[token]?pin=[removed]'],
    [`https://paddleq.in/#/court/${TOKEN}/pin/4821`, 'https://paddleq.in/#/court/[token]/pin/[removed]'],
    ['https://paddleq.in/?pin=4821&x=1', 'https://paddleq.in/?pin=[removed]&x=1'],
    ['https://paddleq.in/?token=abc&desk_pin=9999', 'https://paddleq.in/?token=[removed]&desk_pin=[removed]'],
    ['https://paddleq.in/#/events?email=a@b.in&phone=9876543210&dupr=123', 'https://paddleq.in/#/events?email=[removed]&phone=[removed]&dupr=[removed]'],
  ])('scrubs %s', (input, expected) => expect(scrubUrl(input)).toBe(expected));

  it('keeps an ordinary page address readable', () => {
    expect(scrubUrl('https://paddleq.in/#/events')).toBe('https://paddleq.in/#/events');
    expect(scrubUrl('https://paddleq.in/#/live')).toBe('https://paddleq.in/#/live');
  });

  it('hides any long opaque id, even on a route it does not know', () => {
    expect(scrubUrl(`https://paddleq.in/#/somewhere/${TOKEN}`)).toBe('https://paddleq.in/#/somewhere/[id]');
  });

  it('copes with relative and broken addresses', () => {
    expect(scrubUrl(`/#/court/${TOKEN}`)).toBe('/#/court/[token]');
    expect(scrubUrl('')).toBe('');
  });
});

describe('free text', () => {
  it('removes emails, phone numbers and DUPR ids', () => {
    const out = scrubText('Failed for asha@example.com on +91 98765 43210, DUPR ID: 7H3K9Q, PIN 482913');
    expect(out).not.toMatch(/asha@|98765|7H3K9Q|482913/);
  });
});

describe('what Sentry is allowed to send', () => {
  it('scrubs the request url, breadcrumbs, messages and drops user details', () => {
    const e = scrubSentryEvent({
      request: { url: `https://paddleq.in/#/court/${TOKEN}`, headers: { Referer: `https://paddleq.in/#/desk/${TOKEN}`, Cookie: 'a=b' }, cookies: { a: 'b' } },
      user: { id: 'u1', email: 'a@b.in', ip_address: '1.2.3.4', username: 'asha' },
      message: 'Could not save for asha@example.com',
      exception: { values: [{ type: 'Error', value: `Failed at https://paddleq.in/#/court/${TOKEN} with PIN 123456` }] },
      breadcrumbs: [{ category: 'navigation', data: { from: `/#/court/${TOKEN}`, to: `/#/desk/${TOKEN}` } }, { category: 'fetch', data: { url: `https://x.supabase.co/rest?pin=1234` } }],
      tags: { url: `/#/court/${TOKEN}` },
      transaction: `/#/court/${TOKEN}`,
    });
    const all = JSON.stringify(e);
    expect(all).not.toContain(TOKEN);
    expect(all).not.toMatch(/asha|1\.2\.3\.4|123456|pin=1234|Cookie/i);
    expect(e.user).toBeUndefined();
    expect(e.request?.cookies).toBeUndefined();
  });
});
