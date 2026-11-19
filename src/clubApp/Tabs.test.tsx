import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubResultsTab, ClubTournamentsTab } from './Tabs';

const { be } = vi.hoisted(() => {
  const club = { id: 'c1', name: 'Cedar Paddle Club', trusted: true };
  const t = { id: 't1', clubId: 'c1', name: 'Cedar Open', startDate: '2026-11-20', startTime: '08:00', courts: 4, slotMinutes: 20, status: 'draft', isPublic: false, publicSlug: 'cedar-open' };
  const backend = {
    kind: 'demo', currentUser: async () => ({ email: 'a@example.test' }), isPlatformAdmin: async () => false,
    myClubs: async () => [{ club, role: 'owner' }], clubBundle: async () => ({ club, role: 'owner', tournaments: [t, { ...t, id: 't2', name: 'Old Cup', status: 'done', startDate: '2026-10-01', publicSlug: 'old-cup' }], players: [], matches: [] }),
    publicEvents: async () => [], recentResults: async () => [{ slug: 'old-cup', name: 'Old Cup', club: 'Cedar Paddle Club', startDate: '2026-10-01', results: true }],
  };
  return { be: backend };
});
vi.mock('../club/index', () => ({ backend: () => be, eventsBackend: () => be, serverBackend: () => be }));

beforeEach(() => { document.documentElement.dataset.skin = 'court'; document.documentElement.dataset.theme = 'dark'; });

describe('organiser Tournaments page', () => {
  it('wears the new shell: RallyQ organiser menu, no old side rail or screen header', async () => {
    const go = vi.fn();
    const { container } = render(<ClubTournamentsTab go={go} />); await act(async () => {});
    expect(container.querySelector('.rq-v12 .shell')).not.toBeNull();
    expect(screen.getByLabelText('Organiser menu')).toBeInTheDocument();
    expect(container.querySelector('.screen')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Tournaments', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tournaments' })).toHaveAttribute('aria-current', 'page');
  });
  it('lists tournaments newest first and opens one', async () => {
    const go = vi.fn();
    render(<ClubTournamentsTab go={go} />); await act(async () => {});
    const region = screen.getByRole('region', { name: 'Cedar Paddle Club tournaments' });
    const rows = region.querySelectorAll('.list button');
    expect(rows[0]).toHaveAccessibleName('Cedar Open, Not started');
    fireEvent.click(rows[0]); expect(go).toHaveBeenCalledWith('club-tournament', 't1');
    fireEvent.click(screen.getByRole('button', { name: '+ Create Tournament at Cedar Paddle Club' })); expect(go).toHaveBeenCalledWith('club-tournament-new', 'c1');
  });
});

describe('organiser Results page', () => {
  it('wears the new shell and links to Results & DUPR and public results', async () => {
    const go = vi.fn();
    const { container } = render(<ClubResultsTab go={go} />); await act(async () => {});
    expect(container.querySelector('.rq-v12 .shell')).not.toBeNull();
    expect(container.querySelector('.screen')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Results', level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Old Cup Results & DUPR' })); expect(go).toHaveBeenCalledWith('club-results-dupr', 't2');
    fireEvent.click(screen.getByRole('button', { name: 'Old Cup results' })); expect(go).toHaveBeenCalledWith('results', 'old-cup');
  });
});
