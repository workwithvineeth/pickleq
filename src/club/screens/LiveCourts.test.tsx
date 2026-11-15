import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourtStage, LiveCourts } from './LiveCourts';
import { courtMatches, isMatchPoint, gameChance, headToHead, matchView, pointHistory, videoState, winChance, type CourtVideo } from '../liveView';
import type { PublicTournament } from '../backend';

const fixture = (): PublicTournament => ({ name: 'Sample Open', club: 'Cedar Paddle Club', startDate: '2026-11-09', startTime: '08:00', slotMinutes: 20, status: 'live',
  divisions: [{ id: 'd', name: 'Open doubles', kind: 'doubles', pools: 1, advance: 2, format: { bestOf: 3, pointsTo: 11, scoring: 'rally' }, koFormat: { bestOf: 3, pointsTo: 11, scoring: 'rally' } }],
  entries: [{ id: 'a', divisionId: 'd', names: ['Alex', 'Sam'] }, { id: 'b', divisionId: 'd', names: ['Robin', 'Taylor'] }],
  matches: [{ id: 'm', divisionId: 'd', court: 1, entryA: 'a', entryB: 'b', stage: 'pool', status: 'live', games: [{ a: 2, b: 1, points: 'ABA' }] }, { id: 'n', divisionId: 'd', court: 2, entryA: 'b', entryB: 'a', stage: 'pool', status: 'scheduled', games: [] }] });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('public live score presentation', () => {
  it('selects the active match before future matches, and excludes void courts', () => {
    const d = fixture(); d.matches.unshift({ ...d.matches[1], id: 'early', court: 1, slot: 0 }); d.matches.push({ ...d.matches[0], id: 'void', court: 3, status: 'void' });
    expect(courtMatches(d).map(x => x.match.id)).toEqual(['m', 'n']);
  });
  it('never hides a live match: two live on one planned court use a court with nothing live', () => {
    const d = fixture(); d.matches.push({ ...d.matches[0], id: 'also-live', court: 1, slot: 3 });
    const shown = courtMatches(d);
    expect(shown.map(x => x.match.id).sort()).toEqual(['also-live', 'm']);
    expect(shown.every(x => x.match.status === 'live')).toBe(true);
    expect(new Set(shown.map(x => x.court)).size).toBe(shown.length);
  });
  it('starts a new game only between games, never after a deciding game', () => {
    const d = fixture(); const m = d.matches[0];
    m.games = [{ a: 11, b: 5, points: '' }]; expect(matchView(d, m)).toMatchObject({ game: 2, pointsA: 0, gamesA: 1 });
    m.games.push({ a: 11, b: 4, points: '' }); expect(matchView(d, m)).toMatchObject({ game: 2, pointsA: 11, gamesA: 2 });
  });
  it('counts reversed previous meetings without counting this live match', () => {
    const d = fixture(); d.matches[1] = { ...d.matches[1], status: 'done', winner: 'A' };
    expect(headToHead(d, d.matches[0])).toEqual({ a: 0, b: 1, total: 1 });
  });
  it('does not fabricate point history from partial or inconsistent scores', () => {
    expect(pointHistory('', 9, 7)).toEqual([]); expect(pointHistory('ABA', 9, 7)).toEqual([]); expect(pointHistory('AXB', 1, 1)).toEqual([]);
    expect(pointHistory('ABA', 2, 1).at(-1)).toEqual({ a: 2, b: 1, side: 'A', index: 3 });
  });
  it('estimates equal odds at a tie, win-by-two deuce, golden point and decided games', () => {
    expect(gameChance(0, 0, 11)).toBeCloseTo(.5); expect(gameChance(10, 10, 11)).toBe(.5); expect(gameChance(11, 10, 11)).toBe(.75);
    expect(gameChance(10, 11, 11)).toBe(.25); expect(gameChance(10, 10, 11, true)).toBe(.5); expect(gameChance(11, 10, 11, true)).toBe(1);
    expect(gameChance(11, 7, 11)).toBe(1); expect(gameChance(7, 11, 11)).toBe(0);
    const d = fixture(); expect(winChance(d, d.matches[1])).toBeNull();
    expect(winChance(d, { ...d.matches[0], status: 'done', winner: 'B' })).toBe(0);
  });
  it('never claims a linked, stale, future-dated or invalid video is live', () => {
    const now = Date.now(), base: CourtVideo = { videoId: 'abcdefghijk', status: 'live', checkedAt: new Date(now).toISOString() };
    expect(videoState(base, now)).toBe('LIVE');
    expect(videoState({ ...base, checkedAt: new Date(now - 180001).toISOString() }, now)).toBe('Stream linked');
    expect(videoState({ ...base, checkedAt: new Date(now + 1).toISOString() }, now)).toBe('Stream linked');
    expect(videoState({ ...base, checkedAt: undefined }, now)).toBe('Stream linked');
    expect(videoState({ ...base, videoId: 'javascript:bad' }, now)).toBe('Video unavailable');
    expect(videoState({ ...base, status: 'upcoming' }, now)).toBe('Starting soon');
    expect(videoState({ ...base, status: 'ended' }, now)).toBe('Stream ended');
    expect(videoState({ ...base, embeddable: false }, now)).toBe('Video unavailable');
  });
  it('keeps the exact iframe DOM node and src when the score changes', () => {
    const d = fixture(), video: CourtVideo = { videoId: 'abcdefghijk', status: 'unknown' };
    const { rerender } = render(<CourtStage d={d} court={1} match={d.matches[0]} video={video} />);
    const frame = screen.getByTitle(/Court 1 video/), src = frame.getAttribute('src');
    expect(screen.getByText('Stream linked')).toBeVisible();
    const match = { ...d.matches[0], games: [{ a: 3, b: 1, points: 'ABAA' }] };
    rerender(<CourtStage d={d} court={1} match={match} video={{ ...video }} />);
    expect(screen.getByTitle(/Court 1 video/)).toBe(frame); expect(frame.getAttribute('src')).toBe(src);
    expect(screen.getByLabelText('Match score')).toHaveTextContent('3');
  });
  it('shows a serve dot and server-first call only when the scorer supplies them', () => {
    const d = fixture(); const { container } = render(<CourtStage d={d} court={1} match={d.matches[0]} serve={{ side: 'B', server: 2 }} />);
    expect(screen.getByLabelText('Serving').parentElement).toHaveTextContent('Robin / Taylor');
    expect(container.querySelector('.pq-broadcast-call')).toHaveTextContent('CALL 1 · 2 · 2');
  });
  it('falls back when a player errors and retains readable scores and YouTube link', () => {
    const d = fixture(); render(<CourtStage d={d} court={1} match={d.matches[0]} video={{ videoId: 'abcdefghijk', status: 'unknown' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Video not playing?' }));
    expect(screen.getByText('Video unavailable')).toBeVisible(); expect(screen.queryByTitle(/Court 1 video/)).toBeNull(); expect(screen.getByRole('link', { name: /Watch on YouTube/ })).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('switches courts and presents real points newest first without inventing serve calls', async () => {
    vi.useFakeTimers(); const d = fixture(); render(<LiveCourts d={d} />);
    const feed = within(screen.getByRole('region', { name: 'Point by point' }));
    expect(feed.getAllByRole('listitem')[0]).toHaveTextContent('2 – 1');
    expect(screen.queryByText(/CALL /)).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Live scores'}));
    fireEvent.click(screen.getByRole('button', { name: 'Watch Court 2' }));
    expect(screen.getByRole('region', { name: 'Watch Court 2' })).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByRole('region',{name:'Point by point'})).toBeNull();
    expect(screen.queryByRole('region',{name:'Momentum'})).toBeNull();
    expect(screen.queryByRole('region',{name:'Head to head'})).toBeNull();
  });
});

it('shows match point only when the next point can finish the match, including golden point',()=>{const d=fixture(),m=d.matches[0];m.games=[{a:10,b:7,points:''}];expect(isMatchPoint(d,m)).toBe(false);m.games=[{a:11,b:3,points:''},{a:10,b:7,points:''}];expect(isMatchPoint(d,m)).toBe(true);m.games[1]={a:10,b:10,points:''};expect(isMatchPoint(d,m)).toBe(false);d.divisions[0].format.golden=true;expect(isMatchPoint(d,m)).toBe(true);});
