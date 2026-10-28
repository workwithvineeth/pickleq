import { channel } from '../config';

/**
 * Optional app lock. The PIN itself is never stored: only a salted PBKDF2-SHA-256 hash.
 * It hides the app from someone holding your unlocked phone; it does not encrypt the data.
 */
const KEY = `pickleq.${channel}.pin`;
const FAILS = `pickleq.${channel}.pinFails`;
const AFTER = `pickleq.${channel}.lockAfter`;
export const ITERATIONS = 150_000;

export interface PinRecord { salt: string; hash: string; iterations: number }
export interface FailState { count: number; until: number }

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export function checkNewPin(pin: string, confirm: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'Use 4 to 6 digits';
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Pick something less easy to guess than repeated or running digits';
  if (pin !== confirm) return 'The two PINs don’t match';
  return null;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return b64(new Uint8Array(bits));
}

export const pinEnabled = () => read<PinRecord>(KEY) !== null;

export async function setPin(pin: string, iterations = ITERATIONS): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  write(KEY, { salt: b64(salt), hash: await derive(pin, salt, iterations), iterations } satisfies PinRecord);
  write(FAILS, null);
}

export function removePin(): void { write(KEY, null); write(FAILS, null); }

/** Wrong guesses make you wait longer: 5 free tries, then 30 s, 1 min, 2 min… up to 15 min. */
export function waitAfter(fails: number): number {
  if (fails < 5) return 0;
  return Math.min(15 * 60_000, 30_000 * 2 ** (fails - 5));
}

export function failState(): FailState { return read<FailState>(FAILS) ?? { count: 0, until: 0 }; }

export type PinResult = { ok: true } | { ok: false; waitMs: number; fails: number };

export async function tryPin(pin: string, now = Date.now()): Promise<PinResult> {
  const rec = read<PinRecord>(KEY);
  if (!rec) return { ok: true };
  const f = failState();
  if (f.until > now) return { ok: false, waitMs: f.until - now, fails: f.count };
  const hash = await derive(pin, unb64(rec.salt), rec.iterations);
  if (hash === rec.hash) { write(FAILS, null); return { ok: true }; }
  const count = f.count + 1;
  const wait = waitAfter(count);
  write(FAILS, { count, until: wait ? now + wait : 0 });
  return { ok: false, waitMs: wait, fails: count };
}

export type LockAfter = 0 | 60_000 | 300_000;
export const LOCK_AFTER: { value: LockAfter; label: string }[] = [
  { value: 0, label: 'Right away' }, { value: 60_000, label: 'After 1 minute' }, { value: 300_000, label: 'After 5 minutes' },
];
export function lockAfter(): LockAfter { const v = read<number>(AFTER); return (v === 0 || v === 60_000 || v === 300_000) ? v : 60_000; }
export const setLockAfter = (v: LockAfter) => write(AFTER, v);

/** Every storage key this app version owns in the browser (for the forgot-PIN erase). */
export function ownKeys(): string[] {
  const out: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(`pickleq.${channel}.`) || k.startsWith(`pickleq-${channel}-`)) out.push(k); } } catch { /* blocked */ }
  return out;
}
