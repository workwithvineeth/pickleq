import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceNav } from './Workspace';
const { bundle, publicRead } = vi.hoisted(() => ({ bundle: vi.fn(), publicRead: vi.fn() }));
vi.mock('../club/index', () => {
  const backend = { clubBundle: bundle, currentUser: async () => ({ email: 'alex@example.test' }), publicTournament: publicRead, publicEvents: async () => [], signOut: vi.fn() };
  return { backend: () => backend, eventsBackend: () => backend };
});
beforeEach(() => { sessionStorage.clear(); publicRead.mockResolvedValue(null); });
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
  it('subscribes to a public draft so the chip can appear when play starts remotely', async () => {
    bundle.mockResolvedValue({ club: { id: 'c', name: 'Cedar Paddle Club' }, role: 'owner', tournaments: [{ id: 't', name: 'Tomorrow Open', startDate: '9999-01-01', status: 'draft', isPublic: true, publicSlug: 'public-draft' }] });
    render(<WorkspaceNav kind="club" route={{ name: 'club-view', id: 'c' }} go={vi.fn()} admin={false} />); await act(async () => {});
    expect(publicRead).toHaveBeenCalledWith('public-draft');
  });
  it('does not reveal admin sections before admin permission is known', async () => {
    render(<WorkspaceNav kind="admin" route={{ name: 'admin', id: 'overview' }} go={vi.fn()} admin={false} />); await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Audit log' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Permissions' })).toBeNull();
  });
});
it('opens the selected public event in TV and Social, using its slug',async()=>{const go=vi.fn();bundle.mockResolvedValue({club:{id:'c',name:'Sample'},role:'owner',tournaments:[{id:'t',name:'Open',status:'live',isPublic:true,publicSlug:'sample-open',startDate:'2026-11-10'}]});render(<WorkspaceNav kind="club" route={{name:'club-view',id:'c'}} go={go} admin={false}/>);await act(async()=>{});fireEvent.click(screen.getAllByRole('button',{name:'TV board'})[0]);expect(go).toHaveBeenCalledWith('club-tv','sample-open');fireEvent.click(screen.getAllByRole('button',{name:'Social studio'})[0]);expect(go).toHaveBeenCalledWith('club-social','sample-open')});
