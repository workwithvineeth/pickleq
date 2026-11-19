import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
const R = process.argv[2]; const only = process.argv.slice(3);
const db = new PGlite();
const rd = (p) => readFileSync(p, 'utf8');
await db.exec(rd(`${R}/scripts/local-db/shim.sql`).replace('create extension pgcrypto schema extensions;',''));
await db.exec(rd(new URL('./s5-pglite-stubs.sql', import.meta.url).pathname));
for (const f of readdirSync(`${R}/supabase/migrations`).sort()) {
  try { await db.exec(rd(`${R}/supabase/migrations/${f}`)); } catch (e) { console.log('MIGRATION FAIL', f, e.message); process.exit(1); }
}
console.log('migrations ok');
await db.exec(rd(`${R}/supabase/tests/ci_seed.sql`));
const tests = only.length ? only : readdirSync(`${R}/supabase/tests`).filter(f => f.endsWith('.sql') && f !== 'ci_seed.sql');
for (const f of tests) {
  try {
    const res = await db.exec(rd(f.startsWith('/')?f:`${R}/supabase/tests/${f}`));
    const rows = res.flatMap(r => r.rows ?? []).map(r => Object.values(r).join(' | '));
    const bad = rows.filter(x => x.includes('FAIL'));
    console.log(bad.length ? '✗' : '✓', f); if (bad.length || only.length) rows.forEach(x => console.log('   ', x));
  } catch (e) { console.log('✗', f, 'ERROR', e.message); }
}
