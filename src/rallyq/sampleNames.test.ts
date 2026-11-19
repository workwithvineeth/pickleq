import { expect, it } from 'vitest';

// One denylist for sample screens, template adapters and both prototype sets.
const REAL_NAMES = /\b(?:loki(?:['’]s)?|tpc|narapally|elite\s*picklers|rally33|r33|crosscourts?|pkl\s*zone|(?:the\s+)?pickle\s*yard|pickleball\s+central|the\s+pickle\s+club)\b/i;
it('keeps real clubs out of sample screens and prototype data', () => {
  const samples = Object.entries(import.meta.glob([
    '/src/rallyq/**/*.{ts,tsx,html}', '/docs/**/*.dc.html', '/src/club/domain/sample*.ts',
    '!/src/**/*.test.*', '!/src/rallyq/shell/Shell.tsx',
  ], { query: '?raw', import: 'default', eager: true })) as [string, string][];
  expect(samples.length).toBeGreaterThan(30);
  const violations = samples.flatMap(([file, content]) => {
    let source = content;
    // Only the announced calendar is real. Shell's real host tiles are owned by MR !25.
    if (file.endsWith('/home/values.ts')) {
      const calendar = /export const UPCOMING_EVENTS = \[[\s\S]*?\n\s*\];/;
      expect(source).toMatch(calendar);
      source = source.replace(calendar, '');
      // The pilot's real totals (no player names) are real data too.
      source = source.replace(/export const PILOT=\{[^}]*\};/, '');
    }
    return source.split('\n').flatMap((line, i) => REAL_NAMES.test(line) ? [`${file}:${i + 1}`] : []);
  });
  expect(violations).toEqual([]);
});
