import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TournamentBundle } from './backend';
import { DemoBackend } from './demo';
const fake = vi.hoisted(() => ({ currentUser: vi.fn(), resultsBundle: vi.fn(), updatePlayer: vi.fn(), isPlatformAdmin: vi.fn(), adminUpdateTournamentDupr: vi.fn() }));
vi.mock('./index', () => ({ backend: () => fake, serverBackend: () => fake, rememberReturn: (hash: string) => localStorage.setItem('pq-club-return', hash) }));
const { ResultsDupr } = await import('./screens/ResultsDupr');
let bundle: TournamentBundle;
beforeEach(async () => {
  vi.clearAllMocks(); localStorage.clear();
  const b = new DemoBackend(null); const club = await b.start('Fixture');
  const cb = await b.clubBundle(club); bundle = await b.tournamentBundle(cb.tournaments.find((t) => t.name === 'PQ Demo Open')!.id);
  fake.currentUser.mockResolvedValue({ id: 'fixture', email: 'fixture@example.test' });
  fake.resultsBundle.mockImplementation(async () => bundle); fake.updatePlayer.mockResolvedValue(undefined);
  fake.isPlatformAdmin.mockResolvedValue(false); fake.adminUpdateTournamentDupr.mockResolvedValue(undefined);
});
describe('results access and editing', () => {
  it('offers sign-in and preserves the shared destination for a fresh visitor', async () => {
    fake.currentUser.mockResolvedValue(null); const go = vi.fn();
    render(<ResultsDupr id="shared-event" go={go} onBack={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in to view results' }));
    expect(localStorage.getItem('pq-club-return')).toBe('#/club-results-dupr/shared-event');
    expect(go).toHaveBeenCalledWith('club-signin'); expect(fake.resultsBundle).not.toHaveBeenCalled();
  });
  it('shows ratings beneath names, knockout scores and saves organiser changes before export', async () => {
    const user = userEvent.setup(); const div = bundle.divisions[0];
    const match = bundle.matches.find((m) => m.divisionId === div.id)!;
    bundle.matches.push({ ...match, id: 'final-fixture', stage: 'final', status: 'done', winner: 'A', games: [{ a: 11, b: 7, points: '' }] });
    render(<ResultsDupr id={bundle.tournament.id} go={vi.fn()} onBack={() => {}} />);
    await screen.findByText(bundle.tournament.name);
    const final = screen.getByRole('region', { name: `${div.name} Final` });
    expect(within(final).getByText(/11–7/)).toBeInTheDocument();
    expect(final.querySelector('.pq-result-player')?.children[1].textContent).toMatch(/^DUPR /);
    const rating = screen.getAllByLabelText(/DUPR (singles|doubles) rating/)[0];
    await user.clear(rating); await user.type(rating, '3.45');
    expect(screen.getByRole('button', { name: 'Download results (CSV)' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save DUPR details' }));
    expect(await screen.findByText('Saved. RallyQ can see the new DUPR details now.')).toBeInTheDocument();
    expect(fake.updatePlayer).toHaveBeenCalled();
  });
  it('ordinary player projection has exports and no editing controls', async () => {
    bundle.role = 'player'; render(<ResultsDupr id={bundle.tournament.id} go={vi.fn()} onBack={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Save as PDF' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Save DUPR details' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/DUPR ID/)).not.toBeInTheDocument();
  });
  it('platform admin edits only through the tournament-scoped DUPR API', async () => {
    bundle.role = 'player'; fake.isPlatformAdmin.mockResolvedValue(true); const user = userEvent.setup();
    render(<ResultsDupr id={bundle.tournament.id} go={vi.fn()} onBack={() => {}} />);
    const rating = (await screen.findAllByLabelText(/DUPR (singles|doubles) rating/))[0];
    await user.clear(rating); await user.type(rating, '3.45');
    await user.click(screen.getByRole('button', { name: 'Save DUPR details' }));
    expect(await screen.findByText('Saved. RallyQ can see the new DUPR details now.')).toBeInTheDocument();
    expect(fake.adminUpdateTournamentDupr).toHaveBeenCalledWith(bundle.tournament.id, expect.any(String), expect.objectContaining({ duprSingles: 3.45 }));
    expect(fake.updatePlayer).not.toHaveBeenCalled();
  });
  it('does not claim success for a denied update', async () => {
    fake.updatePlayer.mockRejectedValue(new Error('No permission')); const user = userEvent.setup();
    render(<ResultsDupr id={bundle.tournament.id} go={vi.fn()} onBack={() => {}} />);
    const box = (await screen.findAllByLabelText(/DUPR (singles|doubles) rating/))[0];
    await user.clear(box); await user.type(box, '4.2'); await user.click(screen.getByRole('button', { name: 'Save DUPR details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No permission');
    expect(screen.getByRole('button', { name: 'Save as PDF' })).toBeDisabled();
  });
});
