import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ClubBackend } from '../../club/backend';
import { DemoBackend } from '../../club/demo';
import { LiveStreams } from './LiveStreams';

const fixtures = vi.hoisted(() => ({ backend: null as ClubBackend | null }));
vi.mock('../../club/screens/deskContext', () => ({ useClubBackend: () => fixtures.backend }));

let demo: DemoBackend;
let tournamentId: string;
const videoId = 'Ab3dEfG_h-1';
const dialogMethods = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);

beforeEach(async () => {
  // jsdom has the dialog element but does not implement its modal methods.
  if (!dialogMethods.showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
  });
  if (!dialogMethods.close) Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value(this: HTMLDialogElement) { this.open = false; },
  });
  localStorage.clear();
  demo = new DemoBackend(localStorage);
  const clubId = await demo.start('Alex');
  tournamentId = (await demo.clubBundle(clubId)).tournaments.find(t => t.publicSlug === 'pq-demo-open')!.id;
  fixtures.backend = demo;
});
afterEach(() => {
  cleanup();
  if (!dialogMethods.showModal) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (!dialogMethods.close) Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

async function open() {
  render(<LiveStreams id={tournamentId} go={vi.fn()} />);
  const card = await screen.findByRole('region', { name: 'Court 1' });
  return within(card);
}

it('saves a valid link, keeps it hidden, and offers no status check without a checker', async () => {
  const court = await open();
  expect(court.getByText('No link')).toBeInTheDocument();
  fireEvent.change(court.getByLabelText('YouTube link for Court 1'), { target: { value: `https://youtu.be/${videoId}` } });
  fireEvent.click(court.getByRole('button', { name: 'Save' }));
  expect(await court.findByText('Link saved')).toBeInTheDocument();
  expect(court.getByText('Stream linked')).toBeInTheDocument();
  expect(court.getByRole('button', { name: 'Show to fans' })).toHaveAttribute('aria-pressed', 'false');
  expect(court.getByRole('button', { name: 'Check now' })).toBeDisabled();
  expect(await demo.publicCourtStreams('pq-demo-open')).toEqual([]);
  expect(await new DemoBackend(localStorage).courtStreams(tournamentId)).toEqual([
    { court: 1, videoId, visible: false, status: 'unknown' },
  ]);
});

it('shows the parser message under a bad link and does not save it', async () => {
  const save = vi.spyOn(demo, 'setCourtStream');
  const court = await open();
  const link = court.getByLabelText('YouTube link for Court 1');
  fireEvent.change(link, { target: { value: `https://youtube.com.evil.in/watch?v=${videoId}` } });
  fireEvent.click(court.getByRole('button', { name: 'Save' }));
  expect(court.getByRole('alert')).toHaveTextContent("Paste the link from YouTube's Share button.");
  expect(link).toHaveAttribute('aria-invalid', 'true');
  expect(save).not.toHaveBeenCalled();
});

it('asks before the first show, leaves a cancelled link hidden, and can show and hide', async () => {
  await demo.setCourtStream(tournamentId, 1, videoId);
  await demo.setCourtStream(tournamentId, 2, videoId);
  const court = await open();
  fireEvent.click(court.getByRole('button', { name: 'Show to fans' }));
  const prompt = await screen.findByRole('dialog');
  expect(prompt).toHaveTextContent('Put up the filming notice at the venue');
  fireEvent.click(within(prompt).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await demo.publicCourtStreams('pq-demo-open')).toHaveLength(0);
  fireEvent.click(court.getByRole('button', { name: 'Show to fans' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "I've told them — show it" }));
  const showing = await court.findByRole('button', { name: 'Showing to fans' });
  expect(showing).toHaveAttribute('aria-pressed', 'true');
  expect(await demo.publicCourtStreams('pq-demo-open')).toMatchObject([{ court: 1, videoId }]);
  fireEvent.click(showing);
  expect(await court.findByText('Stream hidden')).toBeInTheDocument();
  expect(await demo.publicCourtStreams('pq-demo-open')).toHaveLength(0);
  const secondCourt = within(screen.getByRole('region', { name: 'Court 2' }));
  fireEvent.click(secondCourt.getByRole('button', { name: 'Show to fans' }));
  expect(await secondCourt.findByRole('button', { name: 'Showing to fans' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('copies the overlay URL with the public slug and court', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText } }));
  try {
    const court = await open();
    fireEvent.click(court.getByRole('button', { name: 'Copy overlay link' }));
    expect(await court.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      new URL(import.meta.env.BASE_URL, location.origin).href + '#/overlay/pq-demo-open/1',
    ));
  } finally {
    vi.unstubAllGlobals();
  }
});
