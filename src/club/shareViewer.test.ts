import { describe, expect, it } from 'vitest';
import { publicSourcesFor, resetClubBackendsForTests } from './index';

describe('Shared demo links', () => {
  it('open on a phone that never started the demo (e.g. Instagram’s browser)', async () => {
    localStorage.clear(); resetClubBackendsForTests();
    const find = async (slug: string) => { for (const s of await publicSourcesFor(slug)) { const e = await s.publicEvent(slug); if (e) return e; } return null; };
    expect((await find('pq-demo-night'))?.name).toBe('PQ Demo Night');
    expect((await find('pq-demo-central-s8'))?.status).toBe('live');
    // Nothing is saved on that phone.
    expect(localStorage.getItem('pq-club-demo-v1')).toBeNull();
    // Results links too.
    let res = null;
    for (const s of await publicSourcesFor('pq-demo-diwali')) { res = await s.publicTournament('pq-demo-diwali'); if (res) break; }
    expect(res?.name).toBe('PQ Demo Diwali Doubles');
    // Other links don't get the sample set.
    expect(await find('someone-elses-cup')).toBeNull();
  });
});
