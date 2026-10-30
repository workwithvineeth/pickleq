#!/usr/bin/env node
// Quiet checks: typecheck, lint and unit tests. Prints one line when all is well, or only what failed.
// Usage: npm run check   (exit code 1 on any failure)
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const fails = [];

const tsc = run('npx', ['tsc', '-b']);
if (!tsc.ok) fails.push(['Typecheck', strip(tsc.out).split('\n').filter((l) => /error TS/.test(l)).slice(0, 15)]);

const lint = run('npx', ['oxlint', '--quiet', 'src', 'scripts', 'e2e/tests', 'e2e/season-sim.ts']);
if (!lint.ok) fails.push(['Lint', strip(lint.out).split('\n').filter((l) => /error|×|✖/.test(l)).slice(0, 15)]);

const unit = run('npx', ['vitest', 'run', '--reporter=dot']);
const uout = strip(unit.out);
const count = uout.match(/Tests\s+(?:\d+ failed \| )?(\d+) passed/);
if (!unit.ok) {
  const lines = uout.split('\n').filter((l) => /FAIL|AssertionError|Error:|expected|❯ .*:\d+/.test(l)).map((l) => l.trim());
  fails.push(['Unit tests', [...new Set(lines)].slice(0, 20)]);
}

if (!fails.length) { console.log(`All OK: typecheck, lint, ${count ? count[1] : '?'} unit tests`); process.exit(0); }
for (const [name, lines] of fails) { console.log(`✗ ${name}`); for (const l of lines.length ? lines : ['(no detail found; run it directly)']) console.log(`  ${l}`); }
process.exit(1);
