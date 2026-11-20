import { describe, expect, it } from 'vitest';
import { CENTRE, cropRect, enhance } from './coverCrop';

describe('Athlete Cover crop', () => {
  it('takes the largest centred 4:5 box from a landscape photo', () => {
    expect(cropRect(4000, 3000, CENTRE)).toEqual({ sx: 800, sy: 0, sw: 2400, sh: 3000 });
  });
  it('takes the full width of a tall photo and pans top to bottom', () => {
    expect(cropRect(1000, 2000, { zoom: 1, x: 0.5, y: 0 })).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1250 });
    expect(cropRect(1000, 2000, { zoom: 1, x: 0.5, y: 1 })).toEqual({ sx: 0, sy: 750, sw: 1000, sh: 1250 });
  });
  it('zooms in up to 3× and keeps the box inside the photo', () => {
    const r = cropRect(1000, 1250, { zoom: 9, x: 2, y: -1 });
    expect(r).toEqual({ sx: 667, sy: 0, sw: 333, sh: 417 });
    expect(r.sx + r.sw).toBeLessThanOrEqual(1000);
  });
});

describe('cover enhance', () => {
  const flat = (w: number, h: number, v: number) => new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v));
  it('lifts a dull, low-contrast photo and keeps alpha', () => {
    const w = 20, h = 20, px = flat(w, h, 100);
    for (let i = 0; i < px.length / 2; i += 4) px[i] = px[i + 1] = px[i + 2] = 140; // two tones close together
    enhance(px, w, h);
    const centre = (10 * w + 10) * 4, top = (2 * w + 10) * 4;
    expect(px[top] - px[centre]).toBeGreaterThan(40); // contrast stretched
    expect(px[3]).toBe(255);
  });
  it('warms slightly and darkens the corners (vignette)', () => {
    const w = 40, h = 50, px = flat(w, h, 160);
    for (let i = 0; i < px.length / 2; i += 4) px[i] = px[i + 1] = px[i + 2] = 60;
    enhance(px, w, h);
    const mid = (25 * w + 20) * 4, corner = (49 * w + 39) * 4;
    expect(px[mid]).toBeGreaterThan(px[mid + 2]);
    expect(px[corner]).toBeLessThan(px[(30 * w + 20) * 4]);
  });
});
