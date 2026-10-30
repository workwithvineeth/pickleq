#!/usr/bin/env node
// Short robot summary from Playwright's results.json: counts, then only the failed tests with their first error line.
// Usage: node summary.mjs [results.json]  (prints Markdown; exit code 1 if anything failed)
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'results.json';
let data;
try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { console.log(`No robot results found (${file}). The robot may not have run.`); process.exit(1); }
const strip = (s) => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '');
const failed = [];
let passed = 0, skipped = 0, flaky = 0;
const walk = (suite, path) => {
  for (const s of suite.suites ?? []) walk(s, [...path, s.title].filter(Boolean));
  for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) {
    const st = t.status; // expected | unexpected | flaky | skipped
    if (st === 'expected') passed++; else if (st === 'skipped') skipped++; else if (st === 'flaky') { flaky++; passed++; }
    else {
      const last = t.results?.[t.results.length - 1];
      const err = strip(last?.error?.message ?? last?.errors?.[0]?.message ?? 'unknown error').split('\n').find((l) => l.trim()) ?? '';
      const shot = last?.attachments?.find((a) => a.name === 'screenshot')?.path;
      failed.push(`- **[${t.projectName}]** ${[...path, spec.title].join(' › ')} (${spec.file}:${spec.line})\n  ${err.trim().slice(0, 300)}${shot ? `\n  screenshot: ${shot.split('/test-results/').pop()}` : ''}`);
    }
  }
};
for (const s of data.suites ?? []) walk(s, []);
console.log(`Robot: ${passed} passed, ${failed.length} failed${flaky ? `, ${flaky} flaky (passed on retry)` : ''}${skipped ? `, ${skipped} skipped` : ''}.`);
if (failed.length) { console.log('\n' + failed.join('\n')); process.exit(1); }
