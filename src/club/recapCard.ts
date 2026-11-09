import { artworkPalette, currentSkin } from '../skin';
// Draws a recap (recap.ts) as a 1080 × 1350 PNG (Instagram portrait, fine on WhatsApp) in PaddleQ's brand:
// maroon and cream, the Paddle Q, Fraunces for names and numbers, DM Sans for text. Browser only (canvas).
import { Q_PATH } from '../components/Logo';
import type { Recap } from './recap';

export const RECAP_W = 1080;
export const RECAP_H = 1350;
const BODY = '"DM Sans", system-ui, sans-serif';

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Splits text into at most `max` lines that fit `width` (the last one ends with … if it had to be cut). */
export function wrapText(measure: (s: string) => number, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= width || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last.length > 1 && measure(`${last}…`) > width) last = last.slice(0, -1);
  kept[max - 1] = `${last.trimEnd()}…`;
  return kept;
}

function mark(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
 const art=artworkPalette(), CREAM=art.brand, MAROON=art.hero;
  c.save(); c.translate(x, y); c.scale(size / 260, size / 260);
  c.save(); c.translate(130, 130); c.rotate((-28 * Math.PI) / 180); c.translate(-130, -130);
  c.fillStyle = CREAM; roundRect(c, 72, 16, 116, 150, 54); c.fill();
  c.fillRect(119, 160, 22, 14);
  c.globalAlpha = 0.6; roundRect(c, 113, 170, 34, 80, 12); c.fill(); c.globalAlpha = 1;
  c.save(); c.translate(89.75, 124); c.scale(0.052, -0.052); c.fillStyle = MAROON; c.fill(new Path2D(Q_PATH)); c.restore();
  c.restore();
  c.fillStyle = CREAM; c.beginPath(); c.arc(212, 54, 24, 0, Math.PI * 2); c.fill();
  c.restore();
}

const pct = (a: number, b: number) => (a + b ? Math.round((100 * a) / (a + b)) : 0);
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Draws the card onto `canvas` (sized to 1080 × 1350). Waits for the brand fonts first. */
export async function drawRecap(canvas: HTMLCanvasElement, r: Recap, name: string): Promise<void> {
 const art=artworkPalette(),skin=currentSkin(),axis=skin!=="maroon";
 const {hero:MAROON,deep:DEEP,chalk:CREAM,surface:SURFACE,ink:INK,muted:MUTED,opponent:SOFT,line:LINE}=art;
 const headingWeight=axis?800:600;
 const DISPLAY=skin==='court'?'Archivo, Arial, sans-serif':axis?'"PaddleQ Axis Display", Arial, sans-serif':"Fraunces, Georgia, serif";
  try { await Promise.all([document.fonts.load(`${headingWeight} 96px ${DISPLAY}`), document.fonts.load('800 92px "PaddleQ Axis Score"'), document.fonts.load(`600 34px ${BODY}`), document.fonts.load(`400 28px ${BODY}`)]); } catch { /* fall back to system fonts */ }
  canvas.width = RECAP_W; canvas.height = RECAP_H;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('This browser can’t make images');
  c.fillStyle = MAROON; c.fillRect(0, 0, RECAP_W, RECAP_H);
  // Faint court lines, like the app's maroon headers.
  c.strokeStyle = skin==='court'?'rgba(241,244,234,.12)':axis?'rgba(243,242,236,.12)':'rgba(243,235,221,.12)'; c.lineWidth = 3;
  roundRect(c, 40, 40, RECAP_W - 80, RECAP_H - 80, 18); c.stroke();
  c.beginPath(); c.moveTo(40, 600); c.lineTo(RECAP_W - 40, 600); c.stroke();

  // Brand row.
  mark(c, 80, 78, 96);
  c.fillStyle = CREAM; c.font = '600 54px Fraunces, Georgia, serif'; c.textBaseline = 'middle'; c.fillText('PaddleQ', 188, 128);
  c.font = `600 24px ${BODY}`;
  const chip = 'TOURNAMENT RECAP'; const cw = c.measureText(chip).width + 44;
  c.strokeStyle = skin==='court'?'rgba(241,244,234,.55)':axis?'rgba(243,242,236,.55)':'rgba(243,235,221,.55)'; c.lineWidth = 2; roundRect(c, RECAP_W - 80 - cw, 104, cw, 48, 24); c.stroke();
  c.fillStyle = CREAM; c.fillText(chip, RECAP_W - 80 - cw + 22, 129);

  // Tournament and player.
  c.textBaseline = 'alphabetic';
  c.fillStyle = art.heroMuted; c.font = `600 34px ${BODY}`;
  let y = 262;
  for (const line of wrapText((s) => c.measureText(s).width, r.tournament.toUpperCase(), RECAP_W - 160, 2)) { c.fillText(line, 80, y); y += 44; }
  c.font = `400 28px ${BODY}`; c.fillStyle = SOFT;
  c.fillText([fmtDate(r.date), r.club, r.division].filter(Boolean).join('  ·  '), 80, y + 4);
  y += 120;
  let size = 104;
  c.font = `${headingWeight} ${size}px ${DISPLAY}`;
  while (size > 60 && c.measureText(name).width > RECAP_W - 160) { size -= 4; c.font = `${headingWeight} ${size}px ${DISPLAY}`; }
  c.fillStyle = CREAM; c.fillText(name, 80, y);

  // Finish badge.
  y += 46;
  c.font = `600 30px ${BODY}`;
  const badge = r.finish.toUpperCase(); const bw = c.measureText(badge).width + 56;
  c.fillStyle = CREAM; roundRect(c, 80, y, bw, 62, 31); c.fill();
  c.fillStyle = MAROON; c.textBaseline = 'middle'; c.fillText(badge, 108, y + 32);
  c.textBaseline = 'alphabetic';

  // Numbers card.
  const top = 640;
  c.fillStyle = skin==='court'?SURFACE:CREAM; roundRect(c, 80, top, RECAP_W - 160, 230, 28); c.fill();
  const cols = [[`${r.won}–${r.lost}`, 'Won–lost'], [`${pct(r.pointsFor, r.pointsAgainst)}%`, 'Points won'], [String(r.played), r.played === 1 ? 'Match' : 'Matches']];
  const colW = (RECAP_W - 160) / 3;
  cols.forEach(([v, label], i) => {
    const cx = 80 + colW * i + colW / 2;
    c.textAlign = 'center';
    c.fillStyle = skin==='court'?CREAM:MAROON; c.font = `${headingWeight} 92px ${axis?'"PaddleQ Axis Score", Arial, sans-serif':DISPLAY}`; c.fillText(v, cx, top + 128);
    c.fillStyle = MUTED; c.font = `600 26px ${BODY}`; c.fillText(label.toUpperCase(), cx, top + 180);
    if (i) { c.fillStyle = LINE; c.fillRect(80 + colW * i, top + 40, 2, 150); }
  });
  c.textAlign = 'left';

  // Best moment, with the momentum line when the court scored it point by point.
  const mt = 900, mh = 310;
  c.fillStyle = SURFACE; roundRect(c, 80, mt, RECAP_W - 160, mh, 28); c.fill();
  c.fillStyle = MUTED; c.font = `600 24px ${BODY}`; c.fillText(r.comeback ? 'BEST MOMENT' : r.lead ? 'CLOSEST WIN' : 'HEADLINE', 120, mt + 50);
  c.fillStyle = INK; c.font = `${headingWeight} 34px ${DISPLAY}`;
  const moment = r.comeback ? `Down ${r.comeback.from}, won ${r.comeback.final} (${r.comeback.stage})` : r.featured ? `Won ${r.featured}` : r.headline;
  c.fillText(wrapText((s) => c.measureText(s).width, moment, RECAP_W - 240, 1)[0], 120, mt + 96);
  if (r.lead && r.lead.length > 2) {
    const gx = 120, gw = RECAP_W - 240, gy = mt + 130, gh = 150;
    const lo = Math.min(0, ...r.lead), hi = Math.max(0, ...r.lead), span = Math.max(1, hi - lo);
    const X = (i: number) => gx + (gw * i) / (r.lead!.length - 1);
    const Y = (v: number) => gy + gh - ((v - lo) / span) * gh;
    c.strokeStyle = LINE; c.lineWidth = 2; c.beginPath(); c.moveTo(gx, Y(0)); c.lineTo(gx + gw, Y(0)); c.stroke();
    c.beginPath(); c.moveTo(X(0), Y(0)); r.lead.forEach((v, i) => c.lineTo(X(i), Y(v))); c.lineTo(X(r.lead.length - 1), Y(0)); c.closePath();
    c.fillStyle = skin==='court'?"rgba(217,242,74,.1)":axis?"rgba(215,255,59,.1)":"rgba(122,31,43,.12)"; c.fill();
    c.strokeStyle = MAROON; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath(); r.lead.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke();
    c.fillStyle = MAROON; c.beginPath(); c.arc(X(r.lead.length - 1), Y(r.lead[r.lead.length - 1]), 9, 0, Math.PI * 2); c.fill();
  }

  // Footer.
  c.fillStyle = DEEP; c.fillRect(40, RECAP_H - 112, RECAP_W - 80, 72);
  c.fillStyle = CREAM; c.font = `600 28px ${BODY}`; c.textBaseline = 'middle';
  c.fillText('Official results on paddleq.in', 80, RECAP_H - 76);
  c.textAlign = 'right'; c.fillStyle = SOFT; c.font = `400 26px ${BODY}`; c.fillText('Player Studio', RECAP_W - 80, RECAP_H - 76);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t make the image'))), 'image/png'));
}
