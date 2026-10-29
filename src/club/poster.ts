/** Posters: shrinking a photo on the phone before upload, and drawing the demo's made-up posters. */

export const POSTER_MAX_WIDTH = 1080;
export const POSTER_MAX_BYTES = 900_000;

/**
 * Shrinks a picture to at most 1080 px wide as a JPEG, lowering quality until it's under ~0.9 MB.
 * Phone photos are often 3–8 MB; the club server refuses anything over 2 MB.
 */
export async function shrinkImage(file: Blob, maxWidth = POSTER_MAX_WIDTH, maxBytes = POSTER_MAX_BYTES): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type)) throw new Error('Choose a photo or picture (JPEG, PNG or WebP)');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('That picture can’t be opened here. Try a JPEG or PNG.'); }
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This phone can’t prepare the picture');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const q of [0.85, 0.75, 0.65, 0.55]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error('That picture is too detailed to send. Try a smaller one.');
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface PosterDesign { title: string; date: string; place: string; tag: string; bg: string; ink: string; accent: string; motif: 'ball' | 'paddles' | 'court' | 'sun' | 'trophy' | 'stars' }

function motif(m: PosterDesign['motif'], c: string): string {
  switch (m) {
    case 'ball': return `<g fill="none" stroke="${c}" stroke-width="10"><circle cx="540" cy="560" r="230"/></g><g fill="${c}">${[[470, 470], [610, 470], [540, 560], [450, 640], [630, 640], [540, 710]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26"/>`).join('')}</g>`;
    case 'paddles': return `<g fill="${c}"><rect x="330" y="300" width="220" height="300" rx="100" transform="rotate(-20 440 450)"/><rect x="530" y="300" width="220" height="300" rx="100" transform="rotate(20 640 450)"/><rect x="388" y="600" width="44" height="190" rx="18" transform="rotate(-20 410 690)"/><rect x="648" y="600" width="44" height="190" rx="18" transform="rotate(20 670 690)"/></g>`;
    case 'court': return `<g fill="none" stroke="${c}" stroke-width="10"><rect x="250" y="300" width="580" height="520"/><line x1="250" y1="560" x2="830" y2="560"/><line x1="250" y1="470" x2="830" y2="470"/><line x1="250" y1="650" x2="830" y2="650"/><line x1="540" y1="300" x2="540" y2="470"/><line x1="540" y1="650" x2="540" y2="820"/></g>`;
    case 'sun': return `<g fill="${c}"><circle cx="540" cy="560" r="170"/>${Array.from({ length: 12 }, (_, i) => `<rect x="530" y="300" width="20" height="70" rx="10" transform="rotate(${i * 30} 540 560)"/>`).join('')}</g>`;
    case 'trophy': return `<g fill="${c}"><path d="M400 320h280v120a140 140 0 0 1-280 0z"/><rect x="510" y="570" width="60" height="120"/><rect x="430" y="690" width="220" height="50" rx="12"/><path d="M400 340h-70a70 70 0 0 0 70 110zM680 340h70a70 70 0 0 1-70 110z" fill="none" stroke="${c}" stroke-width="22"/></g>`;
    case 'stars': return `<g fill="${c}">${[[430, 420, 90], [650, 480, 120], [500, 690, 70]].map(([x, y, r]) => `<path d="M${x} ${y - r}L${x + r * 0.29} ${y - r * 0.4}L${x + r} ${y - r * 0.3}L${x + r * 0.47} ${y + r * 0.15}L${x + r * 0.62} ${y + r * 0.9}L${x} ${y + r * 0.5}L${x - r * 0.62} ${y + r * 0.9}L${x - r * 0.47} ${y + r * 0.15}L${x - r} ${y - r * 0.3}L${x - r * 0.29} ${y - r * 0.4}Z"/>`).join('')}</g>`;
  }
}

/** A made-up poster for the demo, as an SVG picture (portrait 4:5). */
export function samplePoster(d: PosterDesign): string {
  const words = d.title.split(' ');
  const lines: string[] = [];
  for (const w of words) { const last = lines[lines.length - 1]; if (last && (last + ' ' + w).length <= 16) lines[lines.length - 1] = `${last} ${w}`; else lines.push(w); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
<rect width="1080" height="1350" fill="${d.bg}"/>
<rect x="40" y="40" width="1000" height="1270" rx="36" fill="none" stroke="${d.accent}" stroke-width="6" opacity="0.6"/>
<text x="540" y="180" text-anchor="middle" font-family="Georgia, serif" font-size="46" letter-spacing="10" fill="${d.accent}">${esc(d.tag.toUpperCase())}</text>
${motif(d.motif, d.accent)}
${lines.map((l, i) => `<text x="540" y="${980 + i * 96 - (lines.length - 1) * 48}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="92" fill="${d.ink}">${esc(l)}</text>`).join('\n')}
<text x="540" y="1170" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="${d.ink}">${esc(d.date)}</text>
<text x="540" y="1232" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="${d.ink}" opacity="0.8">${esc(d.place)}</text>
<text x="540" y="1290" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="${d.accent}">Sample poster · made-up event</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
