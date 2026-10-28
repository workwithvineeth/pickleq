import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createBackup } from './backup/backup';
import { loadKey, saveKey } from './coach/key';
import { db } from './db/db';
import { loadSampleData } from './db/sample';

const KEY = 'sk-ant-api03-testkeytestkeytestkeytestkey0123';
const sse = (events: object[]) => events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');
const answer = (text: string) => sse([
  { type: 'message_start', message: { usage: { input_tokens: 15000, output_tokens: 1 } } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1200 } },
]);
const ok = (text: string) => new Response(answer(text), { status: 200, headers: { 'content-type': 'text/event-stream' } });

beforeEach(async () => {
  for (const t of [db.matches, db.players, db.ratings, db.sessions, db.goals, db.tournaments, db.conversations, db.usage]) await t.clear();
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => vi.unstubAllGlobals());

describe('Claude coach', () => {
  it('asks for a key first, and checks a key before saving it', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"type":"authentication_error","message":"invalid x-api-key"}}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/coach';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Add your Claude key' }));
    await screen.findByRole('heading', { name: 'Coach settings' });
    await user.type(screen.getByLabelText('Claude API key'), 'sk-proj-123');
    await user.click(screen.getByRole('button', { name: 'Check and save' }));
    expect(screen.getByRole('status')).toHaveTextContent('start with sk-ant-');
    await user.clear(screen.getByLabelText('Claude API key'));
    await user.type(screen.getByLabelText('Claude API key'), KEY);
    await user.click(screen.getByRole('button', { name: 'Check and save' }));
    expect(await screen.findByText(/didn’t accept your key/)).toBeInTheDocument();
    expect(loadKey()).toBe('');
    fetchMock.mockImplementation(async () => new Response('{"input_tokens":8}', { status: 200 }));
    await user.click(screen.getByRole('button', { name: 'Check and save' }));
    expect(await screen.findByText('Key works and is saved on this phone')).toBeInTheDocument();
    expect(loadKey()).toBe(KEY);
    const [url] = fetchMock.mock.calls.at(-1) as unknown as [string];
    expect(url).toBe('https://api.anthropic.com/v1/messages/count_tokens');
  });

  it('writes a weekly summary from the records, saves it, counts the cost, and answers a follow-up', async () => {
    await loadSampleData();
    saveKey(KEY);
    const fetchMock = vi.fn(async () => ok('## Good week\n### From your data\n- You won **3 of 4** matches'));
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/coach';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Weekly summary/ }));
    await screen.findByRole('heading', { name: 'Weekly summary' });
    expect(await screen.findByText(/Claude will see about [\d,]+ tokens/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ask Claude' }));
    expect(await screen.findByRole('heading', { name: 'Good week' })).toBeInTheDocument();
    expect(screen.getByText(/15,000 in, 1,200 out/)).toBeInTheDocument();
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[0].content).toContain('TASK: Weekly summary');
    expect(body.messages[0].content).toContain('[Last 7 days');
    expect(JSON.stringify(body)).not.toContain(KEY);
    await waitFor(async () => expect(await db.usage.count()).toBe(1));
    // follow-up carries the history
    fetchMock.mockImplementation(async () => ok('Yes — focus on resets.'));
    await user.type(screen.getByLabelText('Follow-up question'), 'Should I drill resets?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Yes — focus on resets.')).toBeInTheDocument();
    const body2 = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body2.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(body2.messages[2].content).toBe('Should I drill resets?');
    // saved and listed on the Coach tab
    window.location.hash = '#/coach';
    expect(await screen.findByRole('button', { name: /Weekly summary ·.*2 answers/ })).toBeInTheDocument();
    // conversations go into backups; the key never does
    const file = await createBackup('court-green-11', db, 1000);
    expect(file).not.toContain('sk-ant');
  });

  it('shows a clear message when credits run out, and can try again', async () => {
    await loadSampleData();
    saveKey(KEY);
    const fetchMock = vi.fn(async () => new Response('{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    window.location.hash = '#/coach-task/weaknesses';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/Claude will see about/);
    await user.click(screen.getByRole('button', { name: 'Ask Claude' }));
    expect(await screen.findByText(/credits have run out/)).toBeInTheDocument();
    expect(await db.usage.count()).toBe(0);
    fetchMock.mockImplementation(async () => ok('## Recurring: backhand'));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Recurring: backhand' })).toBeInTheDocument();
    const c = (await db.conversations.toArray())[0];
    expect(c.messages.map((m) => [m.role, !!m.error])).toEqual([['user', false], ['assistant', false]]);
  });

  it('won’t send when offline, and needs a question for Ask anything', async () => {
    await loadSampleData();
    saveKey(KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.location.hash = '#/coach-task/chat';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/You’re offline. Claude needs internet/);
    await screen.findByText(/Claude will see about/);
    await user.click(screen.getByRole('button', { name: 'Ask Claude' }));
    expect(screen.getByRole('status')).toHaveTextContent('You’re offline');
    spy.mockRestore();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes the 90-day report and makes a PDF', async () => {
    await loadSampleData();
    saveKey(KEY);
    vi.stubGlobal('fetch', vi.fn(async () => ok('## Your 90 days\n### Suggestions\n1. Drill dinks')));
    window.location.hash = '#/report';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Write my report' }));
    const report = await screen.findByRole('article', { name: 'Latest report' });
    expect(within(report).getByRole('heading', { name: 'Your 90 days' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save or share as PDF' }));
    expect(await screen.findByText('PDF downloaded')).toBeInTheDocument();
  });
});
