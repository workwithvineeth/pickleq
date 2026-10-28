import { describe, expect, it, vi } from 'vitest';
import { callClaude, ClaudeError, explainError, parseEvents } from './api';
import { buildContext, hasEnoughData, periodsFor, type CoachData } from './context';
import { costUsd, fmtInr, fmtUsd } from './cost';
import { checkKey, checkWorkspace, maskKey } from './key';
import { stripMarkdown } from './markdown';
import { pdfSafe, buildReportPdf, measuredLines } from './pdf';
import { firstMessage, SYSTEM } from './prompt';
import { sampleMatches, sampleSessions, sampleRatings, sampleGoals } from '../db/sample';
import { summarize } from '../domain/stats';
import type { Match } from '../domain/types';

const sse = (events: object[]) => events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');
const stream = (text: string, chunk = 17) => new ReadableStream<Uint8Array>({
  start(c) { const b = new TextEncoder().encode(text); for (let i = 0; i < b.length; i += chunk) c.enqueue(b.slice(i, i + chunk)); c.close(); },
});
const answerEvents = (text: string) => sse([
  { type: 'message_start', message: { usage: { input_tokens: 12000, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'secret reasoning' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(0, 10) } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(10) } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 900 } },
  { type: 'message_stop' },
]);

describe('cost', () => {
  it('uses Haiku 5.5 prices, with the higher tier over 100k prompt tokens', () => {
    expect(costUsd({ input: 100_000, output: 0 })).toBeCloseTo(0.01);
    expect(costUsd({ input: 1_000_000, output: 0 })).toBeCloseTo(0.50);
    expect(costUsd({ input: 0, output: 1_000_000 })).toBeCloseTo(0.50);
    expect(costUsd({ input: 12_000, output: 900 })).toBeCloseTo(0.00165);
    expect(costUsd({ input: 200_000, output: 1000 })).toBeCloseTo(0.1025);
    expect(fmtUsd(0.00172)).toBe('$0.0017');
    expect(fmtInr(0.00165, 95)).toBe('₹0.16');
    expect(fmtInr(1, 95)).toBe('₹95');
  });
});

describe('key checks', () => {
  it('accepts real-looking keys only', () => {
    expect(checkKey('')).toBe('Paste your key');
    expect(checkKey('sk-proj-abc')).toMatch(/sk-ant-/);
    expect(checkKey('sk-ant-short')).toMatch(/whole key/);
    expect(checkKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789')).toBeNull();
    expect(checkWorkspace('')).toBeNull();
    expect(checkWorkspace('wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ')).toBeNull();
    expect(checkWorkspace('workspace 1')).toMatch(/wrkspc_/);
    expect(maskKey('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant-api…mnop');
  });
});

describe('Claude API client', () => {
  it('streams only the visible answer and reads the token counts', async () => {
    const fetchImpl = vi.fn(async () => new Response(stream(answerEvents('## Headline\nFrom your data'))));
    const seen: string[] = [];
    const r = await callClaude({ key: 'sk-ant-x', workspace: 'wrkspc_1', system: 'S', messages: [{ role: 'user', content: 'hi' }], onText: (t) => seen.push(t), fetchImpl });
    expect(r.text).toBe('## Headline\nFrom your data');
    expect(r.text).not.toContain('secret');
    expect(r.usage).toEqual({ input: 12000, output: 900 });
    expect(seen.at(-1)).toBe(r.text);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const h = init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe('sk-ant-x');
    expect(h.authorization).toBeUndefined();
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(h['anthropic-workspace-id']).toBe('wrkspc_1');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', stream: true, system: 'S', output_config: { effort: 'low' } });
    expect(body.temperature).toBeUndefined();
  });

  it('explains each kind of error in plain words', () => {
    expect(explainError(401, '{}').kind).toBe('bad-key');
    expect(explainError(400, JSON.stringify({ error: { message: 'Your credit balance is too low to access the Anthropic API.' } })).kind).toBe('credits');
    expect(explainError(400, JSON.stringify({ error: { message: 'this request must include the anthropic-workspace-id header' } })).kind).toBe('workspace');
    expect(explainError(429, '{}').kind).toBe('rate');
    expect(explainError(529, '{}').kind).toBe('overloaded');
    expect(explainError(400, JSON.stringify({ error: { message: 'odd' } })).message).toContain('odd');
  });

  it('refuses without a key or when offline, and reports network failures', async () => {
    await expect(callClaude({ key: '', system: '', messages: [] })).rejects.toMatchObject({ kind: 'no-key' });
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(callClaude({ key: 'k', system: '', messages: [] })).rejects.toMatchObject({ kind: 'offline' });
    spy.mockRestore();
    await expect(callClaude({ key: 'k', system: '', messages: [], fetchImpl: async () => { throw new TypeError('Failed to fetch'); } })).rejects.toMatchObject({ kind: 'network' });
    await expect(callClaude({ key: 'k', system: '', messages: [], fetchImpl: async () => new Response('{"error":{"message":"Your credit balance is too low"}}', { status: 400 }) })).rejects.toBeInstanceOf(ClaudeError);
  });

  it('turns a mid-stream overload into a friendly error', () => {
    const st = { buffer: '', text: '', usage: { input: 0, output: 0 } };
    expect(() => parseEvents(sse([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]), st)).toThrow(/busy/);
  });
});

function data(): CoachData {
  const today = new Date();
  const matches: Match[] = sampleMatches(today).map((m, i) => ({ ...m, id: `m${i}`, createdAt: i, updatedAt: i, history: [] }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return { matches, sessions: sampleSessions(today), singles: sampleRatings(today).filter((r) => r.kind === 'singles'), doubles: sampleRatings(today).filter((r) => r.kind === 'doubles'), goals: sampleGoals(), tournaments: [] };
}

describe('what Claude sees', () => {
  it('gives the app’s own computed stats for each period', () => {
    const d = data();
    const ctx = buildContext('weaknesses', {}, d);
    const [p] = periodsFor('weaknesses', {}, new Date());
    const ms = d.matches.filter((m) => m.date >= p.from && m.date <= p.to);
    const s = summarize(ms);
    expect(ctx).toContain(`record ${s.record.wins}–${s.record.losses}`);
    expect(ctx).toContain(`MATCHES (${ms.length} in the period`);
    expect(ctx).toContain('shot ESTIMATES');
    expect(ctx).toContain('MEASURED drill success');
    expect(ctx).toContain('Priya'); // you chose to send real names
    expect(ctx.match(/^- \d{4}-/gm)!.length).toBe(ms.length + d.sessions.filter((x) => x.date >= p.from).length);
  });
  it('compares two periods and builds the first message', () => {
    const ctx = buildContext('compare', { compare: '30v30' }, data());
    expect(ctx).toContain('[Last 30 days');
    expect(ctx).toContain('[The 30 days before');
    const msg = firstMessage('compare', { compare: '30v30', question: 'Focus on doubles' }, ctx);
    expect(msg).toContain('TASK: Compare periods');
    expect(msg).toContain('My question: Focus on doubles');
    expect(SYSTEM).toContain('Never invent');
  });
  it('says when there isn’t enough to go on', () => {
    const empty: CoachData = { matches: [], sessions: [], singles: [], doubles: [], goals: [], tournaments: [] };
    expect(hasEnoughData('weekly', {}, empty)).toMatch(/no matches/);
    expect(hasEnoughData('chat', {}, data())).toBe('Type your question');
    expect(hasEnoughData('tournament', {}, data())).toBe('Pick a tournament');
    expect(hasEnoughData('weaknesses', {}, data())).toBeNull();
  });
});

describe('report', () => {
  it('cleans text for the PDF fonts and builds a PDF with measured numbers first', () => {
    expect(pdfSafe('≤3 points → ₹0.2 ✓ 😀')).toBe('<=3 points -> Rs 0.2 v ');
    const md = '## Strong month\n### From your data\n- Won **7 of 9**\n1. Drill dinks\n2. Rest';
    expect(stripMarkdown(md)).toEqual([
      { kind: 'h1', text: 'Strong month' }, { kind: 'h2', text: 'From your data' }, { kind: 'li', text: 'Won 7 of 9' },
      { kind: 'li', text: 'Drill dinks', n: 1 }, { kind: 'li', text: 'Rest', n: 2 },
    ]);
    const lines = measuredLines(data());
    expect(lines[0].label).toBe('Matches');
    const doc = buildReportPdf(md, data());
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });
});
