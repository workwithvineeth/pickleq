import { appVersion, channel } from '../config';
import { db, type PickleqDB } from '../db/db';
import type { Clip } from '../domain/clips';
import type { Tournament } from '../domain/tournaments';
import type { Conversation, UsageRow } from '../db/coach';
import type { DrillCategory, Goal, Match, Player, RatingEntry, TrainingSession } from '../domain/types';
import { BackupError, decryptText, encryptText, parseEnvelope } from './crypto';

/** 1 = matches and players; 2 = adds DUPR rating history; 3 = adds training, drills and goals; 4 = adds pro clips; 5 = adds tournaments; 6 = adds Claude conversations and usage. */
export const SCHEMA = 6;

export interface BackupContents {
  schema: number;
  app: 'PICKLEQ';
  appVersion: string;
  channel: string;
  exportedAt: string;
  matches: Match[];
  players: Player[];
  ratings: RatingEntry[];
  sessions: TrainingSession[];
  drillCategories: DrillCategory[];
  goals: Goal[];
  clips: Clip[];
  tournaments: Tournament[];
  conversations: Conversation[];
  usage: UsageRow[];
}

export async function collect(d: PickleqDB = db, now = new Date()): Promise<BackupContents> {
  return {
    schema: SCHEMA, app: 'PICKLEQ', appVersion, channel, exportedAt: now.toISOString(),
    matches: await d.matches.toArray(),
    players: await d.players.toArray(),
    ratings: await d.ratings.toArray(),
    sessions: await d.sessions.toArray(),
    drillCategories: await d.drillCategories.toArray(),
    goals: await d.goals.toArray(),
    clips: await d.clips.toArray(),
    tournaments: await d.tournaments.toArray(),
    conversations: await d.conversations.toArray(),
    usage: await d.usage.toArray(),
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
  const list = <T,>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : []);
  return { ...c, ratings: list(c.ratings), sessions: list(c.sessions), drillCategories: list(c.drillCategories), goals: list(c.goals), clips: list(c.clips), tournaments: list(c.tournaments), conversations: list(c.conversations), usage: list(c.usage) } as BackupContents;
}

/** Replaces everything on this phone with the backup's contents, in one step that can't half-finish. */
export async function restoreBackup(c: BackupContents, d: PickleqDB = db): Promise<void> {
  await d.transaction('rw', [d.matches, d.players, d.ratings, d.sessions, d.drillCategories, d.goals, d.clips, d.tournaments, d.conversations, d.usage], async () => {
    for (const t of [d.matches, d.players, d.ratings, d.sessions, d.drillCategories, d.goals, d.clips, d.tournaments, d.conversations, d.usage]) await t.clear();
    await d.matches.bulkPut(c.matches);
    await d.players.bulkPut(c.players);
    await d.ratings.bulkPut(c.ratings);
    await d.sessions.bulkPut(c.sessions);
    await d.drillCategories.bulkPut(c.drillCategories);
    await d.goals.bulkPut(c.goals);
    await d.clips.bulkPut(c.clips);
    await d.tournaments.bulkPut(c.tournaments);
    await d.conversations.bulkPut(c.conversations);
    await d.usage.bulkPut(c.usage);
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
