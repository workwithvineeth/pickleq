import { channel } from '../config';

const KEY = `pickleq-${channel}-last-backup`;
export const REMIND_AFTER_DAYS = 7;
const DAY = 86_400_000;

export function lastBackupAt(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function markBackedUp(at = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    /* ignore */
  }
}

export function daysSince(at: number | null, now = Date.now()): number | null {
  return at === null ? null : Math.floor((now - at) / DAY);
}

/** Remind weekly once there is something worth backing up. */
export function backupDue(matchCount: number, last: number | null, now = Date.now()): boolean {
  if (matchCount === 0) return false;
  const d = daysSince(last, now);
  return d === null || d >= REMIND_AFTER_DAYS;
}

export type StorageProtection = 'protected' | 'not-protected' | 'unsupported';

/** Asks the browser not to clear PICKLEQ's data when the phone runs low on space. */
export async function requestPersistentStorage(): Promise<StorageProtection> {
  const s = navigator.storage;
  if (!s?.persist || !s.persisted) return 'unsupported';
  try {
    if (await s.persisted()) return 'protected';
    return (await s.persist()) ? 'protected' : 'not-protected';
  } catch {
    return 'not-protected';
  }
}

export async function storageProtection(): Promise<StorageProtection> {
  const s = navigator.storage;
  if (!s?.persisted) return 'unsupported';
  try {
    return (await s.persisted()) ? 'protected' : 'not-protected';
  } catch {
    return 'not-protected';
  }
}
