import { channel } from '../config';
import { DEFAULT_INR_PER_USD } from './cost';

/** The Claude key lives only in this phone's browser storage. It is never in backups, exports or the code. */
const K = `pickleq.${channel}.claudeKey`;
const W = `pickleq.${channel}.claudeWorkspace`;
const R = `pickleq.${channel}.inrPerUsd`;

const get = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const set = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage blocked */ } };

export const loadKey = () => get(K);
export const saveKey = (v: string) => set(K, v.trim());
export const loadWorkspace = () => get(W);
export const saveWorkspace = (v: string) => set(W, v.trim());
export function loadRate(): number { const n = Number(get(R)); return Number.isFinite(n) && n > 0 ? n : DEFAULT_INR_PER_USD; }
export const saveRate = (n: number) => set(R, String(n));

export function checkKey(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Paste your key';
  if (!t.startsWith('sk-ant-')) return 'Claude API keys start with sk-ant-';
  if (/\s/.test(t) || t.length < 30) return 'That doesn’t look like a whole key. Copy it again';
  return null;
}
export function checkWorkspace(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^wrkspc_[A-Za-z0-9]+$/.test(t) ? null : 'Workspace IDs look like wrkspc_01Jw…';
}
export const maskKey = (k: string) => (k.length > 14 ? `${k.slice(0, 10)}…${k.slice(-4)}` : '••••');
