import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { resetClubBackendsForTests } from './club';

// jsdom can't decode images; the shrinking itself is browser-only, so stand in a small JPEG for it here.
vi.mock('./club/poster', async (orig) => ({ ...(await orig<typeof import('./club/poster')>()), shrinkImage: async () => new Blob([new Uint8Array([255, 216, 255, 224, 1, 2])], { type: 'image/jpeg' }) }));

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); resetClubBackendsForTests(); window.location.hash = ''; vi.stubEnv('VITE_CLUB', 'on'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('Poster upload', () => {
  it('the organiser adds a poster on the tournament page; it shows on the club page, the board and the event page', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/club';
    render(<App />);
    await user.type(await screen.findByLabelText('Your name in the demo'), 'Robot');
    await user.click(screen.getByRole('button', { name: 'Open PQ Demo Club' }));
    await user.click(await screen.findByRole('button', { name: /PQ Demo Night/ }));
    const card = await screen.findByRole('region', { name: 'Events board' });
    expect(within(card).getByRole('img', { name: 'Poster for PQ Demo Night' }).getAttribute('src')).toMatch(/^data:image\/svg/);
    await user.upload(within(card).getByLabelText('Poster picture'), new File(['photo'], 'poster.png', { type: 'image/png' }));
    expect(await within(card).findByText('Poster saved')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Poster for PQ Demo Night' }).getAttribute('src')).toMatch(/^data:image\/jpeg/);
    window.location.hash = '#/events';
    const boardCard = await screen.findByRole('button', { name: 'PQ Demo Night' });
    expect(within(boardCard).getByRole('img', { name: 'Poster for PQ Demo Night' }).getAttribute('src')).toMatch(/^data:image\/jpeg/);
    window.location.hash = '#/event/pq-demo-night';
    expect((await screen.findByRole('img', { name: 'Poster for PQ Demo Night' })).getAttribute('src')).toMatch(/^data:image\/jpeg/);
  });

  it('a new tournament can carry a poster from the start', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/club';
    render(<App />);
    await user.type(await screen.findByLabelText('Your name in the demo'), 'Robot');
    await user.click(screen.getByRole('button', { name: 'Open PQ Demo Club' }));
    await screen.findByRole('heading', { name: 'PQ Demo Club' });
    window.location.hash = `#/club-tournament-new/${window.location.hash.split('/')[2]}`;
    await screen.findByRole('heading', { name: 'New tournament' });
    await user.click(within(screen.getByRole('group', { name: 'How do players enter?' })).getByRole('button', { name: 'List only' }));
    await user.upload(screen.getByLabelText('Poster picture'), new File(['photo'], 'poster.png', { type: 'image/png' }));
    expect(await screen.findByText(/Poster ready/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tournament name'), 'Robot Poster Cup');
    await user.type(screen.getByLabelText('City'), 'Hyderabad');
    await user.type(screen.getByLabelText('Venue'), 'Robot Park');
    await user.type(screen.getByLabelText('Contact number for entries'), '90000 11111');
    await user.click(screen.getByRole('button', { name: 'Post the listing' }));
    const card = await screen.findByRole('region', { name: 'Events board' });
    expect(within(card).getByRole('img', { name: 'Poster for Robot Poster Cup' }).getAttribute('src')).toMatch(/^data:image\/jpeg/);
  });
});
