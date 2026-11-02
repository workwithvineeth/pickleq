import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ rpc: vi.fn(), select: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: fake.rpc, from: () => ({ update: () => ({ eq: () => ({ select: fake.select }) }) }) }) }));
const { ServerBackend } = await import('./server');
beforeEach(() => vi.clearAllMocks());
describe('server results projection and saving', () => {
  it('maps a platform-admin projection as read only without private fields', async () => {
    fake.rpc.mockResolvedValue({ error: null, data: {
      role: 'player', club: { id: 'club', name: 'Fixture Club' },
      tournament: { id: 'event', club_id: 'club', name: 'Fixture Cup', start_date: '2026-11-02', start_time: '08:00', status: 'done' },
      divisions: [], entries: [], matches: [], players: [{ id: 'player', club_id: 'club', name: 'Fixture Player', dupr_singles: 3.125, dupr_doubles: 4.25, dupr_id: 'ABC123' }],
    } });
    const d = await new ServerBackend('https://fixture.supabase.co', 'fixture').resultsBundle('event');
    expect(fake.rpc).toHaveBeenCalledWith('tournament_results_bundle', { p_tournament: 'event' });
    expect(d.role).toBe('player'); expect(d.club.inviteCode).toBe('');
    expect(d.players[0]).toMatchObject({ duprSingles: 3.125, duprDoubles: 4.25, duprId: 'ABC123' });
    expect(d.players[0].claimCode).toBeUndefined(); expect(d.players[0].userId).toBeUndefined();
  });
  it('rejects a zero-row save rather than reporting success', async () => {
    fake.select.mockResolvedValue({ error: null, data: [] });
    const b = new ServerBackend('https://fixture.supabase.co', 'fixture');
    await expect(b.updatePlayer('player', { duprSingles: 3.25 })).rejects.toThrow('No details were saved');
    fake.select.mockResolvedValue({ error: null, data: [{ id: 'player' }] });
    await expect(b.updatePlayer('player', { duprSingles: 3.25 })).resolves.toBeUndefined();
  });
});
