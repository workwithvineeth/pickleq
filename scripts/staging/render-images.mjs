// STAGING ONLY: renders the seed's SVG posters and logos (JSON list from seed.ts) to PNG files in an output folder.
// Usage: node scripts/staging/render-images.mjs images.json outdir   (needs @resvg/resvg-js, installed by the CI job only)
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const [list, out] = process.argv.slice(2);
for (const { path, svg } of JSON.parse(readFileSync(list, 'utf8'))) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? 0) >= 1000 ? 1080 : 256 },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans', serifFamily: 'DejaVu Serif', sansSerifFamily: 'DejaVu Sans' },
    background: 'rgba(0,0,0,0)',
  }).render().asPng();
  const file = join(out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
}
console.log('rendered', JSON.parse(readFileSync(list, 'utf8')).length);
