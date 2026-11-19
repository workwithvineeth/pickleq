// STAGING ONLY (GitLab CI job staging-db): loads every migration, the test accounts, the demo images and the demo data
// into paddleq-staging through its staging-setup function. Needs STAGING_ID_TOKEN (GitLab id_tokens). The test accounts'
// shared password is kept in the staging database itself, never in the repo or CI. Usage: node scripts/staging/apply.mjs seed.sql images-dir
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FN = 'https://xlviuobtfszwfmnwcjjr.supabase.co/functions/v1/staging-setup';
const token = process.env.STAGING_ID_TOKEN;
if (!token) { console.error('STAGING_ID_TOKEN is needed'); process.exit(1); }
const [seedFile, imageDir] = process.argv.slice(2);

async function call(body) {
  const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-oidc': token }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok || out.error) throw new Error(`${body.action} ${body.name ?? body.email ?? body.path ?? ''}: ${out.error ?? r.status}`);
  return out;
}

const dir = 'supabase/migrations';
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  const r = await call({ action: 'sql', name: f, sql: readFileSync(join(dir, f), 'utf8') });
  console.log(r.applied ? `applied ${f}` : `already there ${f}`);
}
for (const email of ['organiser@example.com', 'admin@example.com', 'player@example.com', 'member@example.com']) {
  await call({ action: 'user', email });
  console.log(`account ${email}`);
}
const imgs = join(imageDir, 'staging');
for (const f of readdirSync(imgs)) await call({ action: 'upload', path: `staging/${f}`, base64: readFileSync(join(imgs, f)).toString('base64') });
console.log(`images ${readdirSync(imgs).length}`);
await call({ action: 'sql', name: 'demo-data', always: true, sql: readFileSync(seedFile, 'utf8') });
console.log('demo data loaded');
