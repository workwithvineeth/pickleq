import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** The club server the Club test site uses (publishable key: safe to be public). */
const env = Object.fromEntries(readFileSync(new URL('../../.env.club', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
export const SUPABASE_URL: string = env.VITE_SUPABASE_URL;
export const SUPABASE_KEY: string = env.VITE_SUPABASE_KEY;

export const TEST = {
  slug: 'pqe2etest1',
  club: 'PICKLEQ Test Club (delete me)',
  event: 'E2E Test Round Robin',
  match: { finished: 'e2e00000-0000-4000-8000-000000000501', golden: 'e2e00000-0000-4000-8000-000000000503', court2: 'e2e00000-0000-4000-8000-000000000504', offline: 'e2e00000-0000-4000-8000-000000000505' },
};

export interface Sandbox { slug: string; links: { court1: { token: string; pin: string }; court2: { token: string; pin: string }; lockout: { token: string; pin: string } } }

/** True when running on GitHub with permission to reset the server sandbox. */
export const canUseServer = !!process.env.ACTIONS_ID_TOKEN_REQUEST_URL;

/** Puts the test club back to its starting state. Proves it's the robot with a GitHub identity token. */
export async function resetSandbox(): Promise<Sandbox> {
  const idUrl = `${process.env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=pickleq-robot`;
  const id = await fetch(idUrl, { headers: { authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } }).then((r) => r.json()) as { value: string };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/robot-reset`, { method: 'POST', headers: { 'x-github-oidc': id.value } });
  const body = await res.json() as Sandbox & { error?: string };
  if (!res.ok || body.error) throw new Error(`Sandbox reset failed: ${res.status} ${body.error ?? ''}`);
  return body;
}

/** Calls the club server as an anonymous visitor (no account), like a scorer or a results viewer. */
export async function rpc(name: string, args: Record<string, unknown> = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body };
}

export async function rest(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body };
}

/** A wrong PIN that can't be the real one. */
export const wrongPin = (pin: string) => (pin === '0000' ? '1111' : '0000');

export async function openCourt(page: Page, token: string, pin: string) {
  await page.goto(`#/court/${token}`);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Start scoring' }).click();
  await expect(page.getByRole('heading', { name: /^Court \d$/ })).toBeVisible();
}

/** Taps points: "A" for the left player, "B" for the right. Waits for each tap to register. */
export async function tap(page: Page, nameA: string, nameB: string, points: string) {
  for (const p of points) await page.getByRole('button', { name: `Point to ${p === 'A' ? nameA : nameB}` }).click();
}
