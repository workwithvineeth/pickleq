import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db/db';
import App from './App';

describe('App shell', () => {
  beforeEach(async () => {
    await db.matches.clear();
    window.location.hash = '';
  });
  it('opens on Home with the brand, an empty record and all five tabs', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'PICKLEQ' })).toBeInTheDocument();
    expect(screen.getByLabelText('Overall record')).toHaveTextContent('0–0');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Home', 'Matches', 'Train', 'Stats', 'Coach']) {
      expect(nav).toHaveTextContent(label);
    }
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('switches tabs and marks the active one', async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const [tab, heading] of [['Matches', 'Matches'], ['Train', 'Training'], ['Stats', 'Stats'], ['Coach', 'Coach']] as const) {
      await user.click(screen.getByRole('button', { name: tab }));
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument());
      expect(screen.getByRole('button', { name: tab })).toHaveAttribute('aria-current', 'page');
    }
  });

  it('opens the log screen from the + button and hides the tab bar there', async () => {
    const user = userEvent.setup();
    render(<App />);
    const fab = screen.getAllByRole('button', { name: 'Log a match' }).find((b) => b.classList.contains('fab'))!;
    await user.click(fab);
    expect(screen.getByRole('heading', { name: 'Log match' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('opens Settings, which says data stays on this phone', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('This phone only')).toBeInTheDocument();
  });
});
