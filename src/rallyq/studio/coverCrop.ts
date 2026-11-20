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
 * On-phone enhance (no AI, no upload of the original): auto levels, slight warmth, a subtle Court Green grade in the
 * shadows, a soft vignette, and gentle sharpening. Works in place on RGBA pixels.
 */
export function enhance(px: Uint8ClampedArray, w: number, h: number) {
  // auto levels from the 1st and 99th luminance percentiles (never stretch more than 1.6×)
  const hist = new Uint32Array(256); const n = w * h;
  for (let i = 0; i < px.length; i += 4) hist[(px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8]++;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.01) break; }
  acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.01) break; }
  if (hi - lo < 160) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 80); hi = Math.min(255, mid + 80); }
  const k = 255 / Math.max(1, hi - lo);
  // sharpen from a copy (3×3 unsharp mask, amount .35)
  const src = new Uint8ClampedArray(px);
  const cx = w / 2, cy = h / 2, maxD = Math.hypot(cx, cy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const d = Math.hypot(x - cx, y - cy) / maxD; const vig = 1 - 0.22 * Math.max(0, d - 0.55) / 0.45;
    for (let c = 0; c < 3; c++) {
      let v = src[i + c];
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const blur = (src[i + c - 4] + src[i + c + 4] + src[i + c - w * 4] + src[i + c + w * 4] + 4 * v) / 8;
        v = v + 0.35 * (v - blur);
      }
      v = (v - lo) * k;
      if (c === 0) v *= 1.03; else if (c === 2) v *= 0.96; // warmth
      const shadow = Math.max(0, 1 - v / 128) * 0.08; // Court Green #0B2418 into the shadows
      v = v * (1 - shadow) + [11, 36, 24][c] * shadow;
      px[i + c] = v * vig;
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
