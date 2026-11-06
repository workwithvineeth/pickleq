/**
 * PaddleQ promotional artwork (Phase 3): launch post, story, results card, A4 poster with a real QR code and a
 * WhatsApp banner, filled in from the event. Brand: maroon #7A1F2B and cream #F3EBDD, Fraunces + DM Sans, the
 * official Paddle Q mark. Downloads embed the fonts, so the file looks the same anywhere.
 */
import qrcode from 'qrcode-generator';
import fraunces600 from '@fontsource/fraunces/files/fraunces-latin-600-normal.woff2?url';
import dmSans500 from '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff2?url';
import dmSans600 from '@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff2?url';
import { Q_PATH } from '../components/Logo';

export type PromoTemplate = 'launch' | 'story' | 'results' | 'poster' | 'whatsapp';
export const PROMO_TEMPLATES: { id: PromoTemplate; label: string; w: number; h: number; use: string }[] = [
  { id: 'launch', label: 'Launch post', w: 1080, h: 1080, use: 'Instagram and Facebook feed' },
  { id: 'story', label: 'Story / Status', w: 1080, h: 1920, use: 'Instagram story, WhatsApp status' },
  { id: 'results', label: 'Results card', w: 1080, h: 1350, use: 'Announce the champions' },
  { id: 'poster', label: 'A4 poster with QR', w: 1240, h: 1754, use: 'Print at the venue (A4, 150 dpi)' },
  { id: 'whatsapp', label: 'WhatsApp banner', w: 1600, h: 900, use: 'Group link preview and banners' },
];

export interface PromoInput {
  template: PromoTemplate;
  club: string;
  headline: string;
  subline: string;
  /** Shown on the button (posts, story, banner). */
  cta: string;
  /** Registration or results address; encoded in the poster's QR code. */
  url: string;
  date?: string;
  time?: string;
  courts?: number;
  fee?: string;
  /** Results card: champions, runners-up, bronze, final score. */
  podium?: { champions?: string; runnersUp?: string; bronze?: string; score?: string };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const FD = "font-family=\"Fraunces, Georgia, serif\"";
const FB = "font-family=\"DM Sans, Arial, sans-serif\"";

/** The Paddle Q mark on a cream tile, sized s, at (x, y). */
function markTile(x: number, y: number, s: number) {
  const k = s / 512;
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect width="512" height="512" rx="112" fill="#F3EBDD"/><svg x="66.6" y="66.6" width="378.9" height="378.9" viewBox="0 0 260 260"><g transform="rotate(-28 130 130)"><rect x="72" y="16" width="116" height="150" rx="54" fill="#7A1F2B"/><rect x="119" y="160" width="22" height="14" fill="#7A1F2B"/><rect x="113" y="170" width="34" height="80" rx="12" fill="#7A1F2B" fill-opacity="0.6"/><path transform="translate(89.75 124) scale(0.052 -0.052)" d="${Q_PATH}" fill="#F3EBDD"/></g><circle cx="212" cy="54" r="24" fill="#7A1F2B"/></svg></g>`;
}

/** A real, scannable QR code as SVG rects (error correction M, quiet zone included). */
export function qrSvg(text: string, x: number, y: number, size: number) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), quiet = 2, cell = size / (n + quiet * 2);
  let r = '';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (q.isDark(i, j)) r += `<rect x="${(j + quiet) * cell}" y="${(i + quiet) * cell}" width="${cell + 0.2}" height="${cell + 0.2}"/>`;
  return `<g transform="translate(${x} ${y})"><rect width="${size}" height="${size}" rx="${size * 0.04}" fill="#FFFFFF"/><g fill="#2B1D17">${r}</g></g>`;
}

function wrap(text: string, maxChars: number, maxLines = 3) {
  const lines: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + word).length <= maxChars) lines[lines.length - 1] = last + ' ' + word; else lines.push(word);
  }
  return lines.slice(0, maxLines);
}

/** Builds the artwork as an SVG string (fonts not embedded; use `promoSvgWithFonts` for downloads). */
export function promoSvg(p: PromoInput): string {
  const t = PROMO_TEMPLATES.find((x) => x.id === p.template) ?? PROMO_TEMPLATES[0];
  const W = t.w, H = t.h, pad = W * 0.07;
  const wide = p.template === 'whatsapp';
  const hs = p.template === 'story' ? 132 : wide ? 104 : p.template === 'poster' ? 128 : 116;
  const head = wrap(p.headline || 'Your tournament', wide ? 20 : 14);
  const y0 = wide ? H * 0.36 : p.template === 'story' ? H * 0.28 : H * 0.3;
  const court = `<g fill="none" stroke="#F3EBDD" stroke-opacity=".13" stroke-width="5"><rect x="${W * 0.08}" y="${H * 0.52}" width="${W * 0.84}" height="${H * 0.42}"/><line x1="${W / 2}" y1="${H * 0.52}" x2="${W / 2}" y2="${H * 0.94}"/><line x1="${W * 0.08}" y1="${H * 0.73}" x2="${W * 0.92}" y2="${H * 0.73}"/><line x1="${W * 0.08}" y1="${H * 0.6}" x2="${W * 0.92}" y2="${H * 0.6}"/></g>`;
  let b = `<rect width="${W}" height="${H}" fill="#7A1F2B"/>${court}<circle cx="${W * 0.88}" cy="${H * 0.14}" r="${W * 0.24}" fill="#F3EBDD" opacity=".05"/>`;
  b += markTile(pad, H * 0.05, W * 0.11) + `<text x="${pad + W * 0.14}" y="${H * 0.05 + W * 0.072}" ${FD} font-size="${W * 0.05}" font-weight="600" fill="#F3EBDD">PaddleQ</text>`;
  b += `<text x="${pad}" y="${y0 - hs * 0.95}" ${FB} font-size="${W * 0.026}" font-weight="600" letter-spacing="${W * 0.004}" fill="#E9CBCF">${esc((p.club || 'Your club').toUpperCase())} ${p.template === 'results' ? 'RESULTS' : 'PRESENTS'}</text>`;
  b += head.map((l, i) => `<text x="${pad}" y="${y0 + i * hs * 1.03}" ${FD} font-size="${hs}" font-weight="600" fill="#FBF7F0">${esc(l)}</text>`).join('');
  const yS = y0 + head.length * hs * 1.03 + 18;
  b += `<text x="${pad}" y="${yS}" ${FB} font-size="${W * 0.034}" font-weight="500" fill="#FBF7F0" opacity=".94">${esc(p.subline)}</text>`;
  if (p.template === 'results') {
    const P = p.podium ?? {};
    const rows: [string, string, string][] = [['CHAMPIONS', P.champions ?? '', P.score ?? ''], ['RUNNERS-UP', P.runnersUp ?? '', ''], ['BRONZE', P.bronze ?? '', '']].filter((r) => r[1]) as [string, string, string][];
    const cardH = Math.max(1, rows.length) * 118 + 50;
    b += `<g transform="translate(${pad} ${yS + 56})"><rect width="${W - pad * 2}" height="${cardH}" rx="30" fill="#FBF7F0"/>` + rows.map(([k, n, s], i) => `<text x="44" y="${72 + i * 118}" ${FB} font-size="26" font-weight="600" fill="#7A1F2B" letter-spacing="3">${k}</text><text x="44" y="${120 + i * 118}" ${FD} font-size="46" font-weight="600" fill="#2B1D17">${esc(n.slice(0, 34))}</text>${s ? `<text x="${W - pad * 2 - 44}" y="${120 + i * 118}" text-anchor="end" ${FD} font-size="56" font-weight="600" fill="#7A1F2B">${esc(s)}</text>` : ''}`).join('') + `</g>`;
  } else if (p.template === 'poster') {
    const q = W * 0.3, cy = H * 0.6;
    b += `<g transform="translate(${pad} ${cy})"><rect width="${W - pad * 2}" height="${q + 80}" rx="32" fill="#FBF7F0"/></g>`;
    b += qrSvg(p.url, pad + 40, cy + 40, q);
    const tx = pad + 40 + q + 50;
    b += `<text x="${tx}" y="${cy + 92}" ${FB} font-size="30" font-weight="600" fill="#7A1F2B" letter-spacing="3">SCAN TO REGISTER</text>`;
    if (p.date) b += `<text x="${tx}" y="${cy + 168}" ${FD} font-size="58" font-weight="600" fill="#2B1D17">${esc(p.date)}</text>`;
    b += `<text x="${tx}" y="${cy + 228}" ${FB} font-size="32" fill="#6E5E52">${esc([p.time, p.courts ? `${p.courts} courts` : ''].filter(Boolean).join(' · '))}</text>`;
    if (p.fee) b += `<text x="${tx}" y="${cy + 280}" ${FB} font-size="32" fill="#6E5E52">Entry ${esc(p.fee)}</text>`;
    b += `<text x="${tx}" y="${cy + q + 20}" ${FB} font-size="26" font-weight="600" fill="#7A1F2B">${esc(p.url.replace(/^https?:\/\//, '').slice(0, 34))}</text>`;
  } else {
    const bw = Math.min(W * 0.7, (p.cta || 'Register').length * W * 0.021 + 90), bh = W * (wide ? 0.06 : 0.085);
    b += `<g transform="translate(${pad} ${wide ? H * 0.74 : H * 0.84})"><rect width="${bw}" height="${bh}" rx="${bh / 2}" fill="#F3EBDD"/><text x="40" y="${bh * 0.64}" ${FB} font-size="${bh * 0.36}" font-weight="600" fill="#7A1F2B">${esc(p.cta || 'Register on PaddleQ')} →</text></g>`;
  }
  b += `<text x="${W - pad}" y="${H * 0.972}" text-anchor="end" ${FB} font-size="${W * 0.02}" fill="#E9CBCF">Out of the kitchen, into the stats.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${b}</svg>`;
}

async function dataUrl(u: string) {
  const blob = await (await fetch(u)).blob();
  return new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
}
/** The same artwork with Fraunces and DM Sans embedded, for downloads. */
export async function promoSvgWithFonts(p: PromoInput): Promise<string> {
  const [f6, d5, d6] = await Promise.all([dataUrl(fraunces600), dataUrl(dmSans500), dataUrl(dmSans600)]);
  const style = `<defs><style>@font-face{font-family:'Fraunces';font-weight:600;src:url(${f6}) format('woff2')}@font-face{font-family:'DM Sans';font-weight:500;src:url(${d5}) format('woff2')}@font-face{font-family:'DM Sans';font-weight:600;src:url(${d6}) format('woff2')}</style></defs>`;
  return promoSvg(p).replace(/^(<svg[^>]*>)/, `$1${style}`);
}
/** PNG at the template's full size. */
export async function promoPng(p: PromoInput): Promise<Blob> {
  const t = PROMO_TEMPLATES.find((x) => x.id === p.template) ?? PROMO_TEMPLATES[0];
  const svg = await promoSvgWithFonts(p);
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await img.decode();
  const c = document.createElement('canvas'); c.width = t.w; c.height = t.h;
  c.getContext('2d')!.drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);
  return new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('Could not make the PNG'))), 'image/png'));
}
export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
