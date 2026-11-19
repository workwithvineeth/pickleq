import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClubApp from './ClubApp';
const { sessions } = vi.hoisted(() => ({ sessions: vi.fn() }));
vi.mock('../club/index', () => {
  const backend = { currentUser: async () => ({ email: 'alex@example.test' }), isPlatformAdmin: async () => false, supportSessions: sessions, endSupport: vi.fn(), signOut: vi.fn(), clubBundle: async () => null, publicEvents: async () => [], publicTournament: async () => null };
  return { backend: () => backend, eventsBackend: () => backend };
});
vi.mock('../club/screens/ClubRoutes', () => ({ default: ({ route }: { route: { name: string; id?: string } }) => <div data-testid="screen">{route.name}{route.id ? `/${route.id}` : ''}</div> }));
vi.mock('./Tabs', () => ({ ClubResultsTab: () => null, ClubTournamentsTab: () => null }));
vi.mock('../components/UpdatePrompt', () => ({ UpdatePrompt: () => null }));
async function open(hash: string) { window.location.hash = hash; const view = render(<ClubApp />); await act(async () => {}); return view; }
afterEach(() => { vi.clearAllMocks(); window.location.hash = ''; });
describe('RallyQ v1.2 app frame', () => {
  const bare = ['#/club-player/p1', '#/demo', '#/events-post', '#/club-signin', '#/events', '#/event-enter/e1', '#/my-entries', '#/results/cup', '#/club-inbox/t1', '#/club-entries/t1', '#/club-tournament/t1', '#/club-desk/t1', '#/club-scorers/t1', '#/club-results-dupr/t1', '#/club-dupr/t1', '#/club-tournaments', '#/club-results', '#/club-claim/abc', '#/club-join/abc'];
  it.each(bare)('renders %s bare: the screen brings its own shell', async (hash) => {
    sessions.mockResolvedValue([]);
    const { container, unmount } = await open(hash);
    expect(screen.getByTestId('screen')).toHaveTextContent(hash.slice(2));
    expect(container.querySelector('.app')).toBeNull();
    expect(container.querySelector('.pq-brand')).toBeNull();
    expect(container.querySelector('.rallyq-prototype')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Account' })).toBeNull();
    expect(screen.queryByText(/Signed in as/)).toBeNull();
    expect(screen.queryByLabelText('App settings')).toBeNull();
    unmount();
  });
  it('still shows a running support session on bare organiser screens', async () => {
    sessions.mockResolvedValue([{ clubId: 'c', club: 'Cedar Paddle Club', until: new Date(Date.now() + 3600000).toISOString() }]);
    await open('#/club-inbox/t1');
    expect(screen.getByRole('status', { name: 'RallyQ support session' })).toHaveTextContent('Cedar Paddle Club');
    expect(screen.getByRole('button', { name: 'End support' })).toBeInTheDocument();
  });
  it('keeps the old frame on screens that are not rebuilt yet', async () => {
    sessions.mockResolvedValue([]);
    const { container } = await open('#/club-score/m1');
    expect(container.querySelector('.app.pq-brand')).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Account' })).toHaveTextContent('alex@example.test');
  });
});
