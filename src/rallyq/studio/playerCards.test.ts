import { afterEach, expect, it, vi } from 'vitest';
import { samplePublicPlayer } from '../private/backend';
import { matchCard, playerCard, renderCardPng } from './playerCards';

afterEach(() => vi.restoreAllMocks());

it('projects only public ratings and official matches, ignoring private fields', () => {
  const profile = {
    ...samplePublicPlayer(),
    privatePhoto: 'private-photo',
    practice: [{ id: 'practice-1', opponent: 'Birch Sample', result: 'Won' }],
    shared: { coachNotes: ['Private coach note'] },
  };
  const card = playerCard(profile);
  expect(card).toMatchObject({
    name: 'Kiran Sample', wins: 1, losses: 0, rate: 100,
    ratings: ['DUPR doubles  4.62'], latest: { event: 'Sample Night Open', detail: 'Won · 11–8 · 11–7' },
  });
  expect(card.dna).toHaveLength(28);
  expect(card.photoUrl).toBeUndefined();
  expect(JSON.stringify(card)).not.toMatch(/private-photo|Birch Sample|Private coach note/);
  expect(matchCard(profile, 'practice-1')).toBeNull();
  expect(matchCard(profile, 'sample-official')).toMatchObject({
    result: 'Won', partner: 'Alex Sample', opponents: 'Robin Sample / Jamie Sample', scores: ['11–8', '11–7'],
  });
  expect(playerCard({ ...profile, photoUrl: 'https://example.test/public-cover.jpg' }).photoUrl).toBe('https://example.test/public-cover.jpg');
});

it.each([['Post 4:5', 1350], ['Story 9:16', 1920]] as const)(
  'encodes the %s canvas at 1080 × %s as PNG',
  async (size, height) => {
    const noop = () => {};
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: noop, fillRect: noop, save: noop, translate: noop, stroke: noop, beginPath: noop, arc: noop,
      fill: noop, restore: noop, fillText: noop, measureText: (s: string) => ({ width: 8 * s.length }),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('Path2D', class {});
    const encoder = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
      expect([this.width, this.height]).toEqual([1080, height]);
      expect(type).toBe('image/png');
      callback(new Blob([], { type }));
    });
    try {
      expect((await renderCardPng(playerCard(samplePublicPlayer()), size)).type).toBe('image/png');
      expect(encoder).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  },
);
