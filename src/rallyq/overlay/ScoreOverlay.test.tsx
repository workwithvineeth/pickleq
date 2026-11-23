import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicTournament } from '../../club/backend';
import type { PublicMatch } from '../../club/liveView';
import { usePublicScores } from '../../club/screens/usePublicScores';
import { COUNT_STEP_MS, HOLD_MS } from '../tv/motion';
import { ScoreOverlay } from './ScoreOverlay';

vi.mock('../../club/screens/usePublicScores');

const format = { bestOf: 3, pointsTo: 11, scoring: 'sideout' } as const;
const semi: PublicMatch = {
  id: 'semi', divisionId: 'doubles', stage: 'sf', bracketPos: 0, court: 1, entryA: 'a', entryB: 'b', status: 'live',
  games: [
    { a: 7, b: 11, points: '' },
    { a: 10, b: 7, points: '', serve: 'A', mode: 'sideout', rallies: 'A'.repeat(9) + 'B'.repeat(8) + 'AABA' },
  ],
};
const final: PublicMatch = { ...semi, id: 'final', stage: 'final', status: 'scheduled', games: [] };

function scores(matches: PublicMatch[] | null) {
  const data: PublicTournament | null = matches && {
    name: 'Sample Night Open', club: 'Cedar Paddle Club', startDate: '2026-11-24', startTime: '18:00', slotMinutes: 20, status: 'live',
    divisions: [{ id: 'doubles', name: 'Doubles', kind: 'doubles', pools: 1, advance: 0, format, koFormat: format }],
    entries: [{ id: 'a', divisionId: 'doubles', names: ['Alex', 'Sam'] }, { id: 'b', divisionId: 'doubles', names: ['Robin', 'Taylor'] }],
    matches,
  };
  vi.mocked(usePublicScores).mockReturnValue({ data, loading: false, error: null, updatedAt: null, failures: 0, live: true });
}

const page = <ScoreOverlay courtPath="sample-open/1" />;

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ScoreOverlay', () => {
  it('shows the public court score, server, games and referee call', () => {
    scores([final, semi]);
    render(page);
    const overlay = screen.getByRole('main', { name: 'Score overlay, Court 1' });
    expect(usePublicScores).toHaveBeenCalledWith('sample-open');
    expect(within(overlay).getByText('Sample Night Open · Court 1')).toBeVisible();
    expect(within(overlay).getByText('LIVE', { exact: true })).toBeVisible();
    const teamA = within(overlay).getByRole('group', { name: 'Alex / Sam, 10 points' });
    expect(within(teamA).getByText('10')).toBeVisible();
    expect(within(teamA).getByRole('img', { name: 'Serving' })).toBeVisible();
    const teamB = within(overlay).getByRole('group', { name: 'Robin / Taylor, 7 points' });
    expect(within(teamB).getByText('7')).toBeVisible();
    expect(within(teamB).getByRole('img', { name: '1 of 2 games won' })).toBeVisible();
    expect(within(overlay).getByText('Semi-final 1 · G2')).toBeVisible();
    expect(within(overlay).getByText('10-7-2')).toBeVisible();
    expect(within(overlay).getByText('Game point')).toBeVisible();
  });

  it('holds a newly finished score, then shows the next match', () => {
    vi.useFakeTimers();
    scores([semi, final]);
    const { rerender } = render(page);
    scores([{ ...semi, status: 'done', games: [{ a: 11, b: 7, points: '' }] }, final]);
    rerender(<ScoreOverlay courtPath="sample-open/1" />);
    expect(screen.queryByText('LIVE', { exact: true })).toBeNull();
    expect(screen.getByRole('group', { name: 'Alex / Sam, 11 points' })).toBeVisible();
    act(() => { vi.advanceTimersByTime(HOLD_MS); });
    expect(screen.getByText('Next: Alex / Sam v Robin / Taylor')).toBeVisible();
    expect(screen.getByText('Final')).toBeVisible();
  });

  it.each<{ state: string; matches: PublicMatch[] | null }>([
    { state: 'unknown event', matches: null },
    { state: 'empty court', matches: [] },
    { state: 'old result', matches: [{ ...semi, status: 'done' }] },
  ])('shows only the mark for $state', ({ matches }) => {
    scores(matches);
    const { container } = render(page);
    expect(screen.getByRole('img', { name: 'RallyQ' })).toBeVisible();
    expect(container.textContent).toBe('');
  });

  it('reads hash options over search options and clamps scale in both directions', () => {
    scores([final]);
    window.history.replaceState(null, '', '?bar=bottom&scale=0.4#/overlay/sample-open/1?bar=top');
    const { container, rerender } = render(page);
    const fit = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    expect(container.querySelector('.overlay-bar-top')).toBeVisible();
    expect(container.querySelector('.overlay-stage')).toHaveStyle({ transform: `scale(${fit * 0.75})` });
    window.history.replaceState(null, '', '?bar=top#/overlay/sample-open/1?bar=bottom&scale=2');
    rerender(<ScoreOverlay courtPath="sample-open/1" />);
    expect(container.querySelector('.overlay-bar-bottom')).toBeVisible();
    expect(container.querySelector('.overlay-stage')).toHaveStyle({ transform: `scale(${fit * 1.25})` });
  });

  it('adds the transparent canvas class only while mounted', () => {
    scores(null);
    const { unmount } = render(page);
    expect(document.documentElement).toHaveClass('score-overlay-active');
    unmount();
    expect(document.documentElement).not.toHaveClass('score-overlay-active');
  });

  it('counts up one point per step and jumps with reduced motion', () => {
    vi.useFakeTimers();
    scores([{ ...semi, games: [{ a: 4, b: 2, points: '', mode: 'rally' }] }]);
    const { rerender, unmount } = render(page);
    scores([{ ...semi, games: [{ a: 6, b: 2, points: '', mode: 'rally' }] }]);
    rerender(<ScoreOverlay courtPath="sample-open/1" />);
    expect(screen.getByText('4-2')).toBeVisible();
    act(() => { vi.advanceTimersByTime(COUNT_STEP_MS); });
    expect(screen.getByText('5-2')).toBeVisible();
    act(() => { vi.advanceTimersByTime(COUNT_STEP_MS); });
    expect(screen.getByText('6-2')).toBeVisible();
    unmount();

    const matchMedia = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...matchMedia(query), matches: true }));
    const reduced = render(page);
    scores([{ ...semi, games: [{ a: 9, b: 2, points: '', mode: 'rally' }] }]);
    reduced.rerender(<ScoreOverlay courtPath="sample-open/1" />);
    expect(screen.getByText('9-2')).toBeVisible();
  });
});
