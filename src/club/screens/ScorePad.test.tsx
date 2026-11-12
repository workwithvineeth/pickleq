import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScorePatch } from '../backend';
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
});
