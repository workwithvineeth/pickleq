import { describe, expect, it, vi } from 'vitest';
import { ServerBackend } from './server';
import type { NewTournamentInput } from './plan';

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(() => { throw new Error('Unexpected direct table access'); }),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc, from }) }));

const format = { pointsTo: 11, bestOf: 1, scoring: 'sideout' } as const;
const draft: NewTournamentInput = {
  clubId: 'club', name: '  Club Cup  ', startDate: '2026-11-06', startTime: '09:00',
  courts: 2, slotMinutes: 20, platformDraft: true, entryMode: 'registration',
  registrationOpen: true,
  divisions: [{ name: 'Singles', kind: 'singles', format, koFormat: format, pools: 1, advance: 0, entries: [], rules: { fee: 500 } }],
};

describe('ServerBackend platform drafts', () => {
  it('creates the private draft and its divisions through one guarded call', async () => {
    rpc.mockReset().mockResolvedValue({ data: null, error: null });
    from.mockClear();
    const id = await new ServerBackend('https://fixture.supabase.co', 'fixture').createTournament(draft);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('create_platform_tournament_draft', {
      p_tournament: expect.objectContaining({ id, club_id: 'club', name: 'Club Cup', status: 'draft', is_public: false, registration_open: false }),
      p_divisions: [expect.objectContaining({ tournament_id: id, club_id: 'club', name: 'Singles', fee: 500 })],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('propagates a rejected draft without attempting table writes', async () => {
    rpc.mockReset().mockResolvedValue({ data: null, error: { message: 'Only PaddleQ admins can create a club draft' } });
    from.mockClear();
    await expect(new ServerBackend('https://fixture.supabase.co', 'fixture').createTournament(draft))
      .rejects.toThrow('Only PaddleQ admins can create a club draft');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });
});
