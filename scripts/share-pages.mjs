// Writes a small page per event for link previews in WhatsApp and other chat apps, plus a 404 page that
// forwards any event link that isn't built yet. Each page carries the event's title, date and venue, then opens it in the app.
// Usage: node scripts/share-pages.mjs <built site folder> <site address>   (run after `npm run build:club`)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

let site = 'https://workwithvineeth.github.io/pqclub/';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const day = (iso) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const time = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

/** The page: preview tags for chat apps, then straight on to the app (a link for anyone without JavaScript). */
export function page({ title, description, url, target, image }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PICKLEQ">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1080">
<meta property="og:image:height" content="1350">
<meta name="twitter:card" content="summary_large_image">` : `<meta property="og:image" content="${esc(`${site}icons/club-512.png`)}">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta name="twitter:card" content="summary">`}
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<style>body{font-family:system-ui,sans-serif;background:#F3EBDD;color:#2a2420;margin:0;padding:32px 20px}a{color:#2F5D62}</style>
</head>
<body>
<p><a href="${esc(target)}">Open ${esc(title)} in PICKLEQ</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
}

export function describe(e) {
  const where = [e.venue, e.city].filter(Boolean).join(', ');
  const divs = (e.divisions ?? []).map((d) => d.name).join(', ');
  const state = e.status === 'live' ? 'Live now' : e.registration_open ? 'Entries open' : e.listing === 'listed' ? 'Contact the organiser to enter' : '';
  return [`${day(e.start_date)} · ${time(String(e.start_time).slice(0, 5))}`, where, divs, state].filter(Boolean).join(' · ');
}

async function main() {
  const [outDir, siteArg] = process.argv.slice(2);
  if (!outDir || !siteArg) { console.error('usage: share-pages.mjs <dist dir> <site url>'); process.exit(1); }
  site = siteArg.endsWith('/') ? siteArg : `${siteArg}/`;
  const env = Object.fromEntries(readFileSync(new URL('../.env.club', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  // A server problem must never stop the app deploying: build the fallback page and carry on.
  let events = [];
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/share_events`, {
      method: 'POST', headers: { apikey: env.VITE_SUPABASE_KEY, authorization: `Bearer ${env.VITE_SUPABASE_KEY}`, 'content-type': 'application/json' }, body: '{}',
    });
    if (res.ok) events = await res.json();
    else console.warn(`share-pages: club server answered ${res.status}; only the fallback page was built`);
  } catch (e) {
    console.warn(`share-pages: club server not reachable (${e.message}); only the fallback page was built`);
  }
  for (const e of events) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(e.slug)) continue;
    const dir = join(outDir, 'e', e.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), page({ title: `${e.name} · ${e.club}`, description: describe(e), url: `${site}e/${e.slug}/`, target: `${site}#/event/${e.slug}`,
      // The poster is the preview picture when there is one (only server posters; demo ones never reach here).
      image: typeof e.poster_url === 'string' && /^https:\/\//.test(e.poster_url) ? e.poster_url : undefined }));
  }
  // Any other missing address: forward event links (/e/<slug>/) to the app; everything else to the app's home.
  const fallback = page({ title: 'PICKLEQ events', description: 'Pickleball tournaments: enter, follow live scores and results.', url: site, target: site })
    .replace(`<script>location.replace(${JSON.stringify(site)});</script>`, `<script>
var m = location.pathname.match(/\\/e\\/([A-Za-z0-9_-]{1,40})\\/?$/);
location.replace(${JSON.stringify(site)} + (m ? '#/event/' + m[1] : ''));
</script>`);
  writeFileSync(join(outDir, '404.html'), fallback);
  console.log(`share-pages: ${events.length} event page(s) and 404.html written`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) await main();
