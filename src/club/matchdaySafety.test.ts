import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubError, type ScorePatch } from './backend';
import { blockUnsent, countUnsent, flushLinkUnsent, isPermanentScoreError, readBlocked, readUnsent, writeUnsent } from './matchdaySafety';

const patch = (a: number): ScorePatch => ({ games: [{ points: 'A'.repeat(a), a, b: 0 }], status: 'live' });

describe('which score errors are permanent', () => {
  it.each([
    'This referee link isn’t valid. Ask the organiser for a new one.',
    'Wrong PIN. 3 tries left.',
    'Too many wrong PINs. Try again in 15 minutes, or ask the organiser.',
    'This match isn’t on your court. Ask the organiser.',
    'The organiser cancelled this match.',
    'This match is already finished.',
    'This event has finished, so the referee link no longer works.',
  ])('stops retrying: %s', (m) => expect(isPermanentScoreError(new ClubError(m))).toBe(true));

  it.each([
    'No connection to the club server. Check your internet and try again.',
    'Failed to fetch',
    'Load failed',
    'Something went wrong',
  ])('keeps retrying: %s', (m) => expect(isPermanentScoreError(new Error(m))).toBe(false));

  it('keeps retrying on things that are not errors', () => expect(isPermanentScoreError('nope')).toBe(false));
});

describe('unsent and blocked scores on the phone', () => {
  beforeEach(() => localStorage.clear());

  it('moves a refused score out of the unsent list without losing it', () => {
    writeUnsent({ 'link:t:m1': patch(3), 'link:t:m2': patch(1) });
    blockUnsent('link:t:m1', patch(3), 'The organiser cancelled this match.');
    expect(Object.keys(readUnsent())).toEqual(['link:t:m2']);
    expect(readBlocked()['link:t:m1']).toMatchObject({ reason: 'The organiser cancelled this match.', patch: patch(3) });
    expect(countUnsent()).toBe(1);
  });
});

describe('sending what a court phone kept while offline', () => {
  beforeEach(() => localStorage.clear());

  it('sends only this link’s scores and clears them', async () => {
    writeUnsent({ 'link:t:m1': patch(2), 'link:other:m9': patch(5), 'desk:x:m3': patch(1) });
    const save = vi.fn(async () => undefined);
    const r = await flushLinkUnsent('t', save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('m1', patch(2));
    expect(r).toEqual({ sent: 1, blocked: 0, offline: false });
    expect(Object.keys(readUnsent()).sort()).toEqual(['desk:x:m3', 'link:other:m9']);
  });

  it('stops at the first connection problem and keeps everything', async () => {
    writeUnsent({ 'link:t:m1': patch(2), 'link:t:m2': patch(3) });
    const save = vi.fn(async () => { throw new ClubError('No connection to the club server. Check your internet and try again.'); });
    const r = await flushLinkUnsent('t', save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ sent: 0, blocked: 0, offline: true });
    expect(countUnsent()).toBe(2);
  });

  it('blocks a refused score, never retries it, and carries on with the next', async () => {
    writeUnsent({ 'link:t:m1': patch(2), 'link:t:m2': patch(3) });
    const save = vi.fn(async (id: string) => { if (id === 'm1') throw new ClubError('This match isn’t on your court. Ask the organiser.'); });
    const r = await flushLinkUnsent('t', save);
    expect(r).toEqual({ sent: 1, blocked: 1, offline: false });
    expect(readBlocked()['link:t:m1']).toBeTruthy();
    await flushLinkUnsent('t', save);
    expect(save.mock.calls.filter(([id]) => id === 'm1')).toHaveLength(1);
  });

  it('does not delete a newer score that was written while an older one was in flight', async () => {
    writeUnsent({ 'link:t:m1': patch(2) });
    const save = vi.fn(async () => { writeUnsent({ 'link:t:m1': patch(3) }); });
    await flushLinkUnsent('t', save);
    expect(readUnsent()['link:t:m1']).toEqual(patch(3));
  });
});


describe('shared score send queue', () => {
  beforeEach(() => localStorage.clear());

  it('serializes overlapping list flushes and reads the latest score when the queued send starts', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const saved: number[] = [];
    const save = vi.fn(async (_id: string, score: ScorePatch) => {
      if (save.mock.calls.length === 1) await held;
      saved.push(score.games[0].a);
    });
    writeUnsent({ 'link:t:m1': patch(2) });
    const first = flushLinkUnsent('t', save);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    writeUnsent({ 'link:t:m1': patch(3) });
    const second = flushLinkUnsent('t', save);
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(saved).toEqual([2, 3]);
    expect(readUnsent()).toEqual({});
  });

  it('keeps newer taps when an earlier score is refused', async () => {
    writeUnsent({ 'link:t:m1': patch(2) });
    const save = async () => {
      writeUnsent({ 'link:t:m1': patch(3) });
      throw new ClubError('Wrong PIN');
    };
    expect(await flushLinkUnsent('t', save)).toEqual({ sent: 0, blocked: 0, offline: false });
    expect(readUnsent()['link:t:m1']).toEqual(patch(3));
    expect(readBlocked()).toEqual({});
  });

  it('does not begin another match after leaving the court list', async () => {
    let active = true;
    writeUnsent({ 'link:t:m1': patch(2), 'link:t:m2': patch(3) });
    const save = vi.fn(async () => { active = false; });
    await flushLinkUnsent('t', save, () => active);
    expect(save).toHaveBeenCalledTimes(1);
    expect(readUnsent()).toEqual({ 'link:t:m2': patch(3) });
  });
});
