import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubError, type ScorePatch } from '../backend';
import { blockUnsent, countUnsent, flushLinkUnsent, readBlocked, readUnsent, writeUnsent } from '../matchdaySafety';
import { ScorePad } from './ScorePad';

const fmt = { bestOf: 1, pointsTo: 11, golden: false, scoring: 'rally' } as const;
const sideoutFmt = { ...fmt, scoring: 'sideout' } as const;
function pad(send = vi.fn(async (_p: ScorePatch) => undefined), doubles = true, format: typeof fmt | typeof sideoutFmt = fmt) {
  render(<ScorePad matchKey="m1" initialGames={[]} format={format} nameA="Asha / Lata" nameB="Gita / Rekha" send={send} onFinished={() => undefined} canScore doubles={doubles} />);
  return send;
}

describe('referee scoring choice', () => {
  beforeEach(() => localStorage.clear());

  it('offers side-out, rally or final scores before the first rally', async () => {
    pad();
    const choice = screen.getByRole('group', { name: 'How are you scoring?' });
    expect(choice).toHaveTextContent('Side-out scoring');
    expect(choice).toHaveTextContent('Rally scoring');
    expect(choice).toHaveTextContent('Final scores only');
    // The event's scoring (rally here) is the starting choice.
    expect(screen.getByRole('button', { name: 'Point to Asha / Lata' })).toBeInTheDocument();
  });

  it('side-out: asks who serves, calls 0-0-2, only the serving side scores, keeps every rally', async () => {
    const user = userEvent.setup();
    const send = pad();
    await user.click(screen.getByRole('button', { name: 'Side-out scoring' }));
    await user.click(screen.getByRole('button', { name: 'Asha / Lata' }));
    expect(screen.getByLabelText(/Score call 0-0-2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rally to Asha / Lata' }));
    await user.click(screen.getByRole('button', { name: 'Rally to Gita / Rekha' })); // opening side out (only one server at 0-0-2)
    await user.click(screen.getByRole('button', { name: 'Rally to Asha / Lata' })); // receiving side wins: second server
    expect(screen.getByLabelText(/Score call 0-1-2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rally to Asha / Lata' })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Rally to Gita / Rekha' })).toHaveTextContent('0');
    await waitFor(() => expect(send).toHaveBeenCalled());
    const last = send.mock.calls.at(-1)![0];
    expect(last.games[0]).toMatchObject({ a: 1, b: 0, points: 'A', rallies: 'ABA', mode: 'sideout', serve: 'A' });
    // Undo drops the last rally only.
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText(/Score call 0-1-1/)).toBeInTheDocument();
  });

  it('starts in side-out when the organiser set side-out for the event', () => {
    pad(undefined, true, sideoutFmt);
    expect(screen.getByRole('region', { name: 'First serve' })).toBeInTheDocument();
  });

  it('rally scoring records every rally as a point', async () => {
    const user = userEvent.setup();
    const send = pad();
    await user.click(screen.getByRole('button', { name: 'Point to Gita / Rekha' }));
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls.at(-1)![0].games[0]).toMatchObject({ a: 1, b: 1, points: 'BA', rallies: 'BA', mode: 'rally' });
  });

  it('final scores only opens the score boxes', async () => {
    const user = userEvent.setup();
    pad();
    await user.click(screen.getByRole('button', { name: 'Final scores only' }));
    expect(screen.getByRole('region', { name: 'Final scores' })).toBeInTheDocument();
  });

  it('side-out edge cases: a game ends at 11, win by 2 or golden point, and game 2 asks who serves again', async () => {
    const user = userEvent.setup();
    const bo3 = { bestOf: 3, pointsTo: 11, golden: false, scoring: 'sideout' } as const;
    const send = vi.fn(async (_p: ScorePatch) => undefined);
    render(<ScorePad matchKey="m2" initialGames={[]} format={bo3 as unknown as typeof fmt} nameA="Asha / Lata" nameB="Gita / Rekha" send={send} onFinished={() => undefined} canScore doubles />);
    await user.click(screen.getByRole('button', { name: 'Asha / Lata' }));
    const A = () => user.click(screen.getByRole('button', { name: 'Rally to Asha / Lata' }));
    const B = () => user.click(screen.getByRole('button', { name: 'Rally to Gita / Rekha' }));
    for (let i = 0; i < 10; i++) await A();            // 10-0-2
    await B();                                          // opening side out
    for (let i = 0; i < 10; i++) await B();            // 10-10, Gita / Rekha serving
    expect(screen.getByLabelText(/Score call 10-10-1/)).toBeInTheDocument();
    await B();                                          // 11-10: win by 2, so the game goes on
    expect(screen.getByRole('button', { name: 'Rally to Gita / Rekha' })).toBeEnabled();
    await B();                                          // 12-10: game over
    expect(screen.getByRole('button', { name: 'Rally to Gita / Rekha' })).toBeDisabled();
    expect(screen.getByText('Game 1 won · match goes on')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game 2' }));
    expect(screen.getByRole('region', { name: 'First serve' })).toBeInTheDocument();
  });

  it('golden point: at 10-10 the next point wins', async () => {
    const user = userEvent.setup();
    const g = { bestOf: 1, pointsTo: 11, golden: true, scoring: 'sideout' } as const;
    render(<ScorePad matchKey="m3" initialGames={[]} format={g as unknown as typeof fmt} nameA="Asha / Lata" nameB="Gita / Rekha" send={vi.fn(async () => undefined)} onFinished={() => undefined} canScore doubles />);
    await user.click(screen.getByRole('button', { name: 'Asha / Lata' }));
    for (let i = 0; i < 10; i++) await user.click(screen.getByRole('button', { name: 'Rally to Asha / Lata' }));
    for (let i = 0; i < 11; i++) await user.click(screen.getByRole('button', { name: 'Rally to Gita / Rekha' }));
    await user.click(screen.getByRole('button', { name: 'Rally to Gita / Rekha' }));
    expect(screen.getByText('Match finished')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save result' })).toBeInTheDocument();
  });
});


describe('saving overlapping taps', () => {
  beforeEach(() => localStorage.clear());

  it('sends one save at a time, so an older score never lands after a newer one', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const send = vi.fn((_p: ScorePatch) => (send.mock.calls.length === 1 ? new Promise<undefined>((r) => { release = () => r(undefined); }) : Promise.resolve(undefined)));
    pad(send);
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1)); // first save is slow and still open
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    await new Promise((r) => setTimeout(r, 800)); // past the save delay
    expect(send).toHaveBeenCalledTimes(1); // the newer score waits instead of racing the older one
    release();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0].games[0].a).toBe(2);
    await waitFor(() => expect(screen.getByText(/Saved/)).toBeInTheDocument());
  });
});


describe('moving from the court list into the pad', () => {
  beforeEach(() => localStorage.clear());

  it('waits for an in-flight list retry before saving the newer pad score', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const persisted: number[] = [];
    writeUnsent({ 'link:t:m1': { games: [{ points: 'AA', a: 2, b: 0, mode: 'rally' }], status: 'live' } });
    const listSave = vi.fn(async (_id: string, patch: ScorePatch) => { await held; persisted.push(patch.games[0].a); });
    const flushing = flushLinkUnsent('t', listSave);
    await waitFor(() => expect(listSave).toHaveBeenCalledTimes(1));
    const send = vi.fn(async (patch: ScorePatch) => { persisted.push(patch.games[0].a); });
    render(<ScorePad matchKey="link:t:m1" initialGames={[]} format={fmt} nameA="Asha" nameB="Gita" send={send} onFinished={() => undefined} canScore />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Point to Asha' }));
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(send).not.toHaveBeenCalled();
    await act(async () => { release(); await flushing; });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(persisted).toEqual([2, 3]);
    expect(readUnsent()).toEqual({});
  });
});

describe('point tap feedback', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('vibrates once for each accepted point, not Undo', async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { vibrate }));
    const user = userEvent.setup();
    pad();
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    await user.click(screen.getByRole('button', { name: 'Point to Gita / Rekha' }));
    expect(vibrate.mock.calls).toEqual([[10], [10]]);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('keeps scoring when vibration is unavailable or throws', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', Object.create(navigator));
    pad();
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    Object.defineProperty(navigator, 'vibrate', { value: () => { throw new Error('Blocked'); } });
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    expect(screen.getByRole('button', { name: 'Point to Asha / Lata' })).toHaveTextContent('2');
  });

  it('honours reduced motion for haptic feedback too', async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { vibrate }));
    const original = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      ...original(query), matches: query === '(prefers-reduced-motion: reduce)',
    }));
    pad();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Point to Asha / Lata' })).toHaveTextContent('1');
  });
});

describe('a score the server refuses for good', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('stops retrying and tells the referee to show the desk', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const send = vi.fn(async (_p: ScorePatch) => { throw new ClubError('Wrong PIN. 2 tries left.'); });
    pad(send);
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Show this screen to the desk'));
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong PIN');
    const calls = send.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(60_000); window.dispatchEvent(new Event('online')); });
    expect(send.mock.calls.length).toBe(calls);
    // Nothing is lost: the score is kept on the phone, outside the "to send" list.
    expect(readBlocked()['m1']?.patch.games[0]).toMatchObject({ a: 1, b: 0 });
    expect(countUnsent()).toBe(0);
    // And no more points can pile up on a score that cannot be sent.
    expect(screen.getByRole('button', { name: 'Point to Asha / Lata' })).toBeDisabled();
  });

  it('a connection problem is not permanent: it keeps the score and retries', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let fail = true;
    const send = vi.fn(async (_p: ScorePatch) => { if (fail) throw new ClubError('No connection to the club server. Check your internet and try again.'); return undefined; });
    pad(send);
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    await waitFor(() => expect(screen.getByText('Not sent yet · retrying')).toBeInTheDocument());
    expect(screen.queryByText(/Show this screen to the desk/)).toBeNull();
    fail = false;
    await act(async () => { vi.advanceTimersByTime(10_000); });
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  it('shows the blocked bar again when the screen is reopened, and “Try sending again” puts it back in the queue', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    blockUnsent('m1', { games: [{ points: 'A', a: 1, b: 0 }], status: 'live' }, 'The organiser cancelled this match.');
    const send = pad();
    expect(screen.getByRole('alert')).toHaveTextContent('Show this screen to the desk');
    expect(screen.getByRole('alert')).toHaveTextContent('The organiser cancelled this match.');
    expect(send).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Try sending again' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('offline banner', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('appears after 5 seconds without signal and counts the scores waiting on this phone', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const send = vi.fn(async (_p: ScorePatch) => { throw new ClubError('No connection to the club server. Check your internet and try again.'); });
    pad(send);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    expect(screen.queryByRole('status', { name: 'Connection' })).toBeNull();
    await act(async () => { vi.advanceTimersByTime(5_100); });
    const banner = await screen.findByRole('status', { name: 'Connection' });
    expect(banner).toHaveTextContent('No connection');
    expect(banner).toHaveTextContent('1 score saved on this phone');
  });

  it('goes away when the signal is back and the score is sent', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let fail = true;
    const send = vi.fn(async (_p: ScorePatch) => { if (fail) throw new ClubError('No connection to the club server. Check your internet and try again.'); return undefined; });
    pad(send);
    await user.click(screen.getByRole('button', { name: 'Point to Asha / Lata' }));
    await act(async () => { vi.advanceTimersByTime(5_100); });
    expect(await screen.findByRole('status', { name: 'Connection' })).toBeInTheDocument();
    fail = false;
    await act(async () => { window.dispatchEvent(new Event('online')); vi.advanceTimersByTime(3_000); });
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Connection' })).toBeNull());
  });
});
