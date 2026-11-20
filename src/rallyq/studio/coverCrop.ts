/** Athlete Cover crop: the part of a photo that fills a 4:5 portrait cover, from a zoom (1–3) and a pan (0–1 each way). */
export const COVER_W = 1080, COVER_H = 1350;
export type Crop = { zoom: number; x: number; y: number };
export const CENTRE: Crop = { zoom: 1, x: 0.5, y: 0.5 };
/** Starting crop: faces and upper bodies sit in the top part of most phone photos, so start a little above centre. */
export const UPPER: Crop = { zoom: 1, x: 0.5, y: 0.3 };
/** Below this many source pixels across the crop, the cover will look soft: warn, but still allow it. */
export const LOW_RES_WIDTH = 700;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function cropRect(w: number, h: number, c: Crop, aspect = COVER_W / COVER_H) {
  const zoom = clamp(c.zoom, 1, 3);
  // the largest 4:5 box that fits the photo, then shrunk by the zoom
  let sw = Math.min(w, h * aspect), sh = sw / aspect;
  sw /= zoom; sh /= zoom;
  const sx = (w - sw) * clamp(c.x, 0, 1), sy = (h - sh) * clamp(c.y, 0, 1);
  return { sx: Math.round(sx), sy: Math.round(sy), sw: Math.round(sw), sh: Math.round(sh) };
}

/**
 * On-phone enhance (no AI, nothing reshaped or smoothed), the same recipe as the founder's "Court 4" cover:
 * gentle auto levels, a soft S-curve, highlight roll-off, slight warmth, Court Green in the shadows only,
 * calmer harsh blues, a soft vignette, then light sharpening (unsharp mask .55 with a small threshold).
 * Works in place on RGBA pixels.
 */
export function enhance(px: Uint8ClampedArray, w: number, h: number) {
  const n = w * h; const f = new Float32Array(n * 3);
  for (let p = 0, i = 0; p < n; p++, i += 4) { f[p * 3] = px[i] / 255; f[p * 3 + 1] = px[i + 1] / 255; f[p * 3 + 2] = px[i + 2] / 255; }
  // luminance percentiles 0.4 % and 99.6 %
  const hist = new Uint32Array(256);
  for (let p = 0; p < n; p++) hist[Math.min(255, Math.round((0.2126 * f[p * 3] + 0.7152 * f[p * 3 + 1] + 0.0722 * f[p * 3 + 2]) * 255))]++;
  let acc = 0, lo = 0, hi = 255;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.004) break; }
  acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.004) break; }
  const L0 = lo / 255, span = Math.max(1 / 255, (hi - lo) / 255);
  const cx = w / 2, cy = h * 0.45, green = [0.04, 0.14, 0.09];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 3; const a = [f[p], f[p + 1], f[p + 2]];
    for (let c = 0; c < 3; c++) {
      let v = Math.min(1, Math.max(0, (a[c] - L0) / span)) * 0.6 + a[c] * 0.4; // gentle levels
      v = Math.min(1, Math.max(0, v)); v = v * 0.8 + v * v * (3 - 2 * v) * 0.2;     // soft S-curve
      if (v > 0.85) v = 0.85 + (v - 0.85) * 0.75;                                  // highlight roll-off
      a[c] = v;
    }
    a[0] *= 1.03; a[2] *= 0.965;                                                    // warmth
    const L = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    const sh = Math.pow(Math.min(1, Math.max(0, 1 - L / 0.45)), 1.5) * 0.18;         // Court Green, shadows only
    for (let c = 0; c < 3; c++) a[c] = a[c] * (1 - sh) + green[c] * sh;
    const g = (a[0] + a[1] + a[2]) / 3, bl = Math.min(1, Math.max(0, (a[2] - a[0]) * 3)); // calmer harsh blues
    for (let c = 0; c < 3; c++) a[c] = g + (a[c] - g) * (1 - 0.25 * bl);
    const r = Math.hypot((x - cx) / (w / 2), (y - cy) / (h * 0.6));
    const vig = 1 - 0.22 * Math.pow(Math.min(1, Math.max(0, (r - 0.55) / 0.75)), 1.6); // soft vignette
    f[p] = a[0] * vig; f[p + 1] = a[1] * vig; f[p + 2] = a[2] * vig;
  }
  // light sharpening: 3×3 unsharp mask, amount .55, threshold 3/255 (leaves skin and flat areas alone)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 3, i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      let v = f[p + c];
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const blur = (f[p + c - 3] + f[p + c + 3] + f[p + c - w * 3] + f[p + c + w * 3] + 4 * v) / 8;
        const d = v - blur; if (Math.abs(d) * 255 > 3) v += 0.55 * d;
      }
      px[i + c] = Math.round(Math.min(1, Math.max(0, v)) * 255);
    }
  }
}

/** Draws the crop to a 1080×1350 JPEG under ~900 KB (the server refuses over 1 MB), enhanced unless kept original. */
export async function coverJpeg(bitmap: ImageBitmap, c: Crop, enhanced = true): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_W; canvas.height = COVER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This phone can’t prepare the picture');
  const r = cropRect(bitmap.width, bitmap.height, c);
  ctx.drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, COVER_W, COVER_H);
  if (enhanced) { const img = ctx.getImageData(0, 0, COVER_W, COVER_H); enhance(img.data, COVER_W, COVER_H); ctx.putImageData(img, 0, 0); }
  for (const q of [0.85, 0.75, 0.65, 0.55]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size <= 900_000) return blob;
  }
  throw new Error('That picture is too detailed to send. Try another one.');
}
