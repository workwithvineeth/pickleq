import { expect, it, vi } from 'vitest';
import { DemoBackend } from '../demo';

it('publishes a saved public demo score and keeps the confirming read current', async () => {
  const key = 'pq-club-demo-v1';
  localStorage.removeItem(key);
  const writer = new DemoBackend(localStorage);
  const clubId = await writer.start('Alex');
  const tournament = (await writer.clubBundle(clubId)).tournaments.find(t => t.publicSlug === 'pq-demo-open')!;
  const [link] = await writer.createScorerLinks(tournament.id, clubId, [null]);
  const viewer = new DemoBackend(localStorage);
  const slug = tournament.publicSlug;
  const match = (await viewer.publicTournament(slug))!.matches.find(m => m.status === 'scheduled' && m.court)!;
  const receive = vi.fn(), status = vi.fn();
  const stop = viewer.liveScores().subscribe(slug, receive, status);
  try {
    expect(status).toHaveBeenCalledWith('live');
    await writer.scorerSave(link.token, link.pin, match.id, { status: 'live', games: [{ a: 1, b: 0, points: 'A', rallies: 'A', mode: 'rally' }] });
    expect(receive).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ id: match.id, status: 'live', games: [{ a: 1, b: 0, points: '', rallies: 'A', mode: 'rally' }] }));
    expect((await viewer.publicTournament(slug))?.matches.find(m => m.id === match.id)?.games[0].a).toBe(1);
    await writer.patchMatches([{ id: match.id, patch: { court: 2 } }]);
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ id: match.id, court: 2 }));
    await writer.updateTournament(tournament.id, { isPublic: false });
    await writer.patchMatches([{ id: match.id, patch: { court: 3 } }]);
    expect(receive).toHaveBeenCalledTimes(2);
  } finally { stop(); localStorage.removeItem(key); }
});
