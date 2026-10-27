import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { db, PickleqDB } from './db/db';
import { ensureBuiltInClips } from './db/clips';
import { builtInClips } from './domain/clips';
import { collect, openBackup, restoreBackup, createBackup } from './backup/backup';

beforeEach(async () => {
  await db.clips.clear();
  window.location.hash = '';
  document.head.querySelectorAll('script[src*="youtube"]').forEach((s) => s.remove());
});
afterEach(() => vi.restoreAllMocks());

describe('pro clips', () => {
  it('adds the suggested clips once and never brings back a hidden one', async () => {
    await ensureBuiltInClips();
    const n = await db.clips.count();
    expect(n).toBe(builtInClips().length);
    const first = builtInClips()[0];
    await db.clips.update(first.id, { status: 'hidden', start: 12 });
    await ensureBuiltInClips();
    expect(await db.clips.count()).toBe(n);
    expect(await db.clips.get(first.id)).toMatchObject({ status: 'hidden', start: 12 });
  });

  it('opens from Train, lists shots, and loads nothing from YouTube until you press play', async () => {
    window.location.hash = '#/train';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Pro clips/ }));
    await screen.findByRole('heading', { name: 'Pro clips' });
    await user.click(await screen.findByRole('button', { name: /^Dink/ }));
    await screen.findByRole('heading', { name: 'Dink' });
    await screen.findByRole('button', { name: 'Play Soft Hands Drill: Unattackable Dinks' });
    expect(document.querySelector('script[src*="youtube"]')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    const card = screen.getByRole('region', { name: 'Soft Hands Drill: Unattackable Dinks' });
    expect(within(card).getByText(/0:15–1:16 · 1:01 clip/)).toBeInTheDocument();
    expect(within(card).getByText('Not reviewed yet')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /^Play/ }));
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).not.toBeNull();
  });

  it('shows an offline message instead of loading YouTube', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.location.hash = '#/clips/dink';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Play Best Pickleball Dink Technique' }));
    expect(screen.getByText(/You’re offline/)).toBeInTheDocument();
    expect(document.querySelector('script[src*="youtube"]')).toBeNull();
  });

  it('approves, edits times with checks, hides and restores a clip', async () => {
    window.location.hash = '#/clips/dink';
    const user = userEvent.setup();
    render(<App />);
    const card = await screen.findByRole('region', { name: 'Best Pickleball Dink Technique' });
    await user.click(within(card).getByRole('button', { name: 'Approve' }));
    await within(card).findByText('Approved by you');
    await user.click(within(card).getByRole('button', { name: 'Edit times' }));
    await user.clear(within(card).getByLabelText('Clip start'));
    await user.type(within(card).getByLabelText('Clip start'), '1:00');
    await user.type(within(card).getByLabelText('Clip end'), '0:30');
    await user.click(within(card).getByRole('button', { name: 'Save times' }));
    expect(within(card).getByRole('status')).toHaveTextContent('The end has to be after the start');
    await user.clear(within(card).getByLabelText('Clip end'));
    await user.type(within(card).getByLabelText('Clip end'), '1:40');
    await user.click(within(card).getByRole('button', { name: 'Save times' }));
    await within(card).findByText(/1:00–1:40 · 0:40 clip/);
    await user.click(within(card).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Best Pickleball Dink Technique' })).toBeNull());
    await user.click(screen.getByRole('button', { name: /Show hidden clips \(1\)/ }));
    await user.click(screen.getByRole('button', { name: 'Show again' }));
    await screen.findByRole('region', { name: 'Best Pickleball Dink Technique' });
  });

  it('adds your own clip from a link, with the start taken from the link', async () => {
    window.location.hash = '#/clips/backhand-drive';
    const user = userEvent.setup();
    render(<App />);
    const form = await screen.findByRole('region', { name: 'Add your own clip' });
    await user.type(within(form).getByLabelText('YouTube link'), 'https://vimeo.com/1');
    await user.click(within(form).getByRole('button', { name: 'Add clip' }));
    expect(within(form).getByRole('status')).toHaveTextContent('Paste a YouTube link');
    await user.clear(within(form).getByLabelText('YouTube link'));
    await user.type(within(form).getByLabelText('YouTube link'), 'https://youtu.be/dQw4w9WgXcQ?t=42');
    await user.type(within(form).getByLabelText('Clip name'), 'Coach demo');
    await user.click(within(form).getByRole('button', { name: 'Add clip' }));
    const card = await screen.findByRole('region', { name: 'Coach demo' });
    expect(within(card).getByText('Your clip')).toBeInTheDocument();
    expect(within(card).getByText(/0:42–end/)).toBeInTheDocument();
    expect(await db.clips.where('videoId').equals('dQw4w9WgXcQ').first()).toMatchObject({ shot: 'Backhand drive', start: 42, builtIn: false });
  });

  it('includes clip choices in backups and restores them', async () => {
    await ensureBuiltInClips();
    const id = builtInClips()[2].id;
    await db.clips.update(id, { status: 'approved', start: 5 });
    const file = await createBackup('court-green-11', db, 1000);
    const other = new PickleqDB('clips-restore-test');
    await other.open();
    await restoreBackup(await openBackup(file, 'court-green-11'), other);
    expect(await other.clips.get(id)).toMatchObject({ status: 'approved', start: 5 });
    expect((await collect(other)).schema).toBe(4);
  });
});
