import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { saveKey, loadKey } from './coach/key';
import { db } from './db/db';
import { addMatch } from './db/matches';
import { pinEnabled, setPin } from './lock/pin';
import { DEFAULT_FORMAT } from './domain/types';

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
  localStorage.clear();
  window.location.hash = '';
});

const pad = () => within(screen.getByRole('group', { name: 'PIN keypad' }));
async function typePin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  for (const d of pin) await user.click(pad().getByRole('button', { name: d }));
}

describe('app lock', () => {
  it('is off by default; turning it on needs the PIN twice', async () => {
    window.location.hash = '#/settings';
    const user = userEvent.setup();
    render(<App />);
    const card = await screen.findByRole('region', { name: 'App lock' });
    expect(within(card).getByText('Off')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Turn on app lock' }));
    await user.type(within(card).getByLabelText('New PIN'), '4821');
    await user.type(within(card).getByLabelText('New PIN again'), '4822');
    await user.click(within(card).getByRole('button', { name: 'Save PIN' }));
    expect(within(card).getByRole('status')).toHaveTextContent('don’t match');
    await user.clear(within(card).getByLabelText('New PIN again'));
    await user.type(within(card).getByLabelText('New PIN again'), '4821');
    await user.click(within(card).getByRole('button', { name: 'Save PIN' }));
    await within(card).findByText('App lock is on');
    expect(pinEnabled()).toBe(true);
    // Turning off needs the current PIN.
    await user.click(within(card).getByRole('button', { name: 'Turn off' }));
    await user.type(within(card).getByLabelText('Current PIN'), '1111');
    await user.click(within(card).getByRole('button', { name: 'Turn off app lock' }));
    expect(await within(card).findByText('That PIN is wrong')).toBeInTheDocument();
    await user.clear(within(card).getByLabelText('Current PIN'));
    await user.type(within(card).getByLabelText('Current PIN'), '4821');
    await user.click(within(card).getByRole('button', { name: 'Turn off app lock' }));
    await within(card).findByText('App lock is off');
    expect(pinEnabled()).toBe(false);
  });

  it('shows nothing of your data until the right PIN is entered', async () => {
    await setPin('4821', 1000);
    await addMatch({ date: '2026-10-20', type: 'singles', category: 'casual', format: DEFAULT_FORMAT, participants: [{ name: 'Arjun', role: 'opponent' }], outcome: 'played', games: [{ you: 11, them: 4, momentum: 'neither' }], won: true, status: 'complete', backfilled: false, tags: {} });
    window.location.hash = '#/matches';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Enter your PIN' });
    expect(screen.queryByText(/Arjun/)).toBeNull();
    await typePin(user, '1111');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText(/Wrong PIN. 4 tries/)).toBeInTheDocument();
    await typePin(user, '4821');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText(/Arjun/)).toBeInTheDocument();
  });

  it('forgot PIN erases this app’s data only after typing ERASE', async () => {
    await setPin('4821', 1000);
    saveKey('sk-ant-api03-somekeysomekeysomekeysomekey');
    await addMatch({ date: '2026-10-20', type: 'singles', category: 'casual', format: DEFAULT_FORMAT, participants: [], outcome: 'played', games: [{ you: 11, them: 4, momentum: 'neither' }], won: true, status: 'complete', backfilled: false, tags: {} });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Forgot PIN?' }));
    const erase = screen.getByRole('button', { name: 'Erase and start again' });
    expect(erase).toBeDisabled();
    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'ERASE');
    await user.click(erase);
    await screen.findByRole('heading', { name: 'PICKLEQ' });
    await waitFor(async () => expect(await db.matches.count()).toBe(0));
    expect(pinEnabled()).toBe(false);
    expect(loadKey()).toBe('');
  });
});
