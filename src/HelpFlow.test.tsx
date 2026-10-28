import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });

describe('guide and privacy pages', () => {
  it('opens the guide and privacy pages from Settings', async () => {
    window.location.hash = '#/settings';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /How to use PICKLEQ/ }));
    await screen.findByRole('heading', { name: 'How to use PICKLEQ' });
    for (const t of ['Start here: install and back up', 'Log a match in under a minute', 'Tournaments', 'Coach: insights and Claude', 'App lock']) {
      expect(screen.getByText(t, { selector: 'summary' })).toBeInTheDocument();
    }
    window.location.hash = '#/settings';
    await user.click(await screen.findByRole('button', { name: /Privacy and your data/ }));
    await screen.findByRole('heading', { name: 'Privacy and your data' });
    expect(screen.getByText(/No analytics, ads, tracking or crash reporting/)).toBeInTheDocument();
    expect(screen.getByText(/only on this phone/)).toBeInTheDocument();
  });
});
