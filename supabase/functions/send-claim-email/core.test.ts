import { describe, expect, it, vi } from 'vitest';
import { claimEmail, claimLink, parseMode, sendClaimEmails, type Batch, type Deps } from './core';

const batch: Batch = {
  tournament: 'Diwali <Open>', club: 'Lakeside', skipped: 2, limited: false,
  targets: [
    { log_id: 1, player_id: 'p1', name: 'Asha Rao', email: 'asha@example.test', token: 'a'.repeat(64) },
    { log_id: 2, player_id: 'p2', name: 'Bina "B" Shah', email: 'bina@example.test', token: 'b'.repeat(64) },
  ],
};
const deps = (over: Partial<Deps> = {}): Deps => ({
  mode: 'live', appUrl: 'https://paddleq.in', batch: vi.fn(async () => batch),
  send: vi.fn(async () => ({ ok: true, id: 'brevo-1' })), record: vi.fn(async () => undefined), ...over,
});

describe('claim emails', () => {
  it('stays off unless switched on, and never asks the database for emails while off', async () => {
    expect(parseMode(undefined)).toBe('off');
    expect(parseMode('LIVE')).toBe('off');
    const d = deps({ mode: 'off' });
    const out = await sendClaimEmails('t1', null, d);
    expect(out.error).toMatch(/isn’t switched on/);
    expect(d.batch).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('in test mode sends every player’s real link to the test inbox only', async () => {
    const d = deps({ mode: 'test', testTo: 'hello@paddleq.in' });
    const out = await sendClaimEmails('t1', null, d);
    expect(d.batch).toHaveBeenCalledWith('t1', null, 'test');
    const sent = vi.mocked(d.send).mock.calls.map(([m]) => m);
    expect(sent.map((m) => m.to.email)).toEqual(['hello@paddleq.in', 'hello@paddleq.in']);
    expect(sent[0].subject).toBe('[Test for Asha Rao] Your results from Diwali <Open>');
    expect(sent[0].text).toContain(`https://paddleq.in/#/club-claim/${'a'.repeat(64)}`);
    expect(out).toMatchObject({ sent: 2, failed: 0, test: true });
    expect(await sendClaimEmails('t1', null, deps({ mode: 'test' }))).toMatchObject({ error: expect.stringMatching(/test address/) });
  });

  it('in live mode emails each player, and records each result (including failures)', async () => {
    const send = vi.fn().mockResolvedValueOnce({ ok: true, id: 'brevo-1' }).mockResolvedValueOnce({ ok: false, error: '400 invalid email' });
    const d = deps({ send });
    const out = await sendClaimEmails('t1', ['p1', 'p2'], d);
    expect(send.mock.calls.map(([m]) => m.to)).toEqual([{ email: 'asha@example.test', name: 'Asha Rao' }, { email: 'bina@example.test', name: 'Bina "B" Shah' }]);
    expect(vi.mocked(d.record).mock.calls).toEqual([[1, true, 'brevo-1'], [2, false, '400 invalid email']]);
    expect(out).toEqual({ sent: 1, failed: 1, skipped: 2, limited: false, test: false });
  });

  it('writes a plain, safe email with one claim button', () => {
    const m = claimEmail({ name: 'Bina "B" Shah', tournament: 'Diwali <Open>', club: 'Lakeside & Co', link: claimLink('https://paddleq.in/', 'x'.repeat(64)) });
    expect(m.subject).toBe('Your results from Diwali <Open>');
    expect(m.html).toContain('Diwali &lt;Open&gt;');
    expect(m.html).toContain('Lakeside &amp; Co');
    expect(m.html).not.toContain('<Open>');
    expect(m.html).toContain(`href="https://paddleq.in/#/club-claim/${'x'.repeat(64)}"`);
    expect(m.text).toMatch(/^Hi Bina,/);
    expect(m.text).toContain('Ignore this email and nothing happens');
  });
});
