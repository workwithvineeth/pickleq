import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceNav } from './Workspace';
const { bundle } = vi.hoisted(() => ({ bundle: vi.fn() }));
vi.mock('../club/index', () => {
  const backend = { clubBundle: bundle, currentUser: async () => ({ email: 'alex@example.test' }), publicTournament: async () => null, publicEvents: async () => [], signOut: vi.fn() };
  return { backend: () => backend, eventsBackend: () => backend };
});
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.clearAllMocks(); });
describe('workspace permissions and routes', () => {
  it('keeps members limited to overview, tournaments and people', async () => {
    bundle.mockResolvedValue({ club: { id: 'c', name: 'Cedar Paddle Club' }, role: 'member', tournaments: [] });
    render(<WorkspaceNav kind="club" route={{ name: 'club-view', id: 'c' }} go={vi.fn()} admin={false} />);
    await act(async () => {});
    expect(screen.getByText('Cedar Paddle Club', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create tournament' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Referee scoring' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'My tournaments' })).toHaveLength(2);
  });
  it('keeps the existing organizer destinations', async () => {
    const go = vi.fn(); bundle.mockResolvedValue({ club: { id: 'c', name: 'Cedar Paddle Club' }, role: 'owner', tournaments: [] });
    render(<WorkspaceNav kind="club" route={{ name: 'club-view', id: 'c' }} go={go} admin={false} />); await act(async () => {});
    fireEvent.click(screen.getAllByRole('button', { name: 'Create tournament' })[0]); expect(go).toHaveBeenCalledWith('club-tournament-new', 'c');
  });
  it('does not reveal admin sections before admin permission is known', async () => {
    render(<WorkspaceNav kind="admin" route={{ name: 'admin', id: 'overview' }} go={vi.fn()} admin={false} />); await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Audit log' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Permissions' })).toBeNull();
  });
});
