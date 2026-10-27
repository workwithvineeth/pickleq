import { appVersion, channel } from '../config';
import { db, type PickleqDB } from '../db/db';
import type { Match, Player } from '../domain/types';
import { BackupError, decryptText, encryptText, parseEnvelope } from './crypto';

export const SCHEMA = 1;

export interface BackupContents {
  schema: number;
  app: 'PICKLEQ';
  appVersion: string;
  channel: string;
  exportedAt: string;
  matches: Match[];
  players: Player[];
}

export async function collect(d: PickleqDB = db, now = new Date()): Promise<BackupContents> {
  return {
    schema: SCHEMA, app: 'PICKLEQ', appVersion, channel, exportedAt: now.toISOString(),
    matches: await d.matches.toArray(),
    players: await d.players.toArray(),
  };
}

/** The encrypted backup file's text. The Claude API key is never part of it. */
export async function createBackup(password: string, d: PickleqDB = db, iterations?: number): Promise<string> {
  const contents = await collect(d);
  const envelope = await encryptText(JSON.stringify(contents), password, iterations);
  return JSON.stringify(envelope);
}

export async function openBackup(fileText: string, password: string): Promise<BackupContents> {
  const plain = await decryptText(parseEnvelope(fileText), password);
  const c = JSON.parse(plain) as Partial<BackupContents>;
  if (c.app !== 'PICKLEQ' || !Array.isArray(c.matches) || !Array.isArray(c.players)) {
    throw new BackupError('This backup is damaged and can’t be restored.');
  }
  if ((c.schema ?? 0) > SCHEMA) {
    throw new BackupError('This backup is from a newer version of PICKLEQ. Update the app, then try again.');
  }
  return c as BackupContents;
}

/** Replaces everything on this phone with the backup's contents, in one step that can't half-finish. */
export async function restoreBackup(c: BackupContents, d: PickleqDB = db): Promise<void> {
  await d.transaction('rw', d.matches, d.players, async () => {
    await d.matches.clear();
    await d.players.clear();
    await d.matches.bulkPut(c.matches);
    await d.players.bulkPut(c.players);
  });
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const tag = channel === 'preview' ? '-preview' : '';
  return `pickleq${tag}-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.pickleq`;
}

export function checkNewPassword(pw: string, confirm: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw !== confirm) return 'The two passwords don’t match.';
  return null;
}
