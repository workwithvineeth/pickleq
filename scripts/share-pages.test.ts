import { describe as group, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript build script
import { describe, page } from './share-pages.mjs';

group('Link-preview pages', () => {
  it('carry the event’s title and details, escaped, and forward to the app', () => {
    const html = page({ title: 'Night <Open> & "Cup"', description: 'Sat 1 Nov · 6:30 pm', url: 'https://x.test/pqclub/e/abc/', target: 'https://x.test/pqclub/#/event/abc' });
    expect(html).toContain('<meta property="og:title" content="Night &lt;Open&gt; &amp; &quot;Cup&quot;">');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://x.test/pqclub/#/event/abc">');
    expect(html).not.toContain('<Open>');
  });
  it('use the poster as the preview picture when there is one', () => {
    const withPoster = page({ title: 'Cup', description: 'x', url: 'https://x.test/e/a/', target: 'https://x.test/#/event/a', image: 'https://cdn.test/posters/a.jpg?v=1' });
    expect(withPoster).toContain('<meta property="og:image" content="https://cdn.test/posters/a.jpg?v=1">');
    expect(withPoster).toContain('summary_large_image');
    const without = page({ title: 'Cup', description: 'x', url: 'https://x.test/e/a/', target: 'https://x.test/#/event/a' });
    expect(without).toContain('icons/club-512.png');
  });
  it('describe when, where, which events and whether entries are open', () => {
    const d = describe({ start_date: '2026-11-01', start_time: '18:30:00', venue: 'Court One', city: 'Hyderabad', divisions: [{ name: 'Men 3.5' }, { name: 'Mixed' }], registration_open: true, status: 'draft', listing: 'run' });
    expect(d).toBe('Sun, 1 Nov · 6:30 pm · Court One, Hyderabad · Men 3.5, Mixed · Entries open');
  });
});
