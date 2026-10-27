import { diffMatch } from '../domain/history';
import type { Match, Participant, Player } from '../domain/types';
import { db, newId, type PickleqDB } from './db';

export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type NewMatch = Omit<Match, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'deletedAt'>;

async function rememberPlayers(d: PickleqDB, participants: Participant[], now: number): Promise<Participant[]> {
  const out: Participant[] = [];
  for (const p of participants) {
    const name = p.name.trim();
    if (!name) {
      out.push({ ...p, name: '', playerId: undefined });
      continue;
    }
    const nameKey = name.toLowerCase();
    const existing = await d.players.where('nameKey').equals(nameKey).first();
    const player: Player = {
      id: existing?.id ?? newId(),
      name,
      nameKey,
      lastRating: p.rating ?? existing?.lastRating,
      lastStrength: p.strength ?? existing?.lastStrength,
      lastUsedAt: now,
    };
    await d.players.put(player);
    out.push({ ...p, name, playerId: player.id });
  }
  return out;
}

export async function addMatch(input: NewMatch, d: PickleqDB = db, now = Date.now()): Promise<Match> {
  return d.transaction('rw', d.matches, d.players, async () => {
    const participants = await rememberPlayers(d, input.participants, now);
    const match: Match = { ...input, participants, id: newId(), createdAt: now, updatedAt: now, history: [] };
    await d.matches.add(match);
    return match;
  });
}

/** Saves changes and records exactly what changed in the match's edit history. */
export async function updateMatch(id: string, changes: Partial<NewMatch>, d: PickleqDB = db, now = Date.now()): Promise<Match> {
  return d.transaction('rw', d.matches, d.players, async () => {
    const before = await d.matches.get(id);
    if (!before) throw new Error('Match not found');
    const participants = changes.participants ? await rememberPlayers(d, changes.participants, now) : before.participants;
    const after: Match = { ...before, ...changes, participants, updatedAt: now };
    const diff = diffMatch(before, after);
    if (diff.length) after.history = [...before.history, { at: now, changes: diff }];
    await d.matches.put(after);
    return after;
  });
}

export async function moveToTrash(id: string, d: PickleqDB = db, now = Date.now()): Promise<void> {
  await d.matches.update(id, { deletedAt: now });
}

export async function restoreFromTrash(id: string, d: PickleqDB = db): Promise<void> {
  const m = await d.matches.get(id);
  if (!m) return;
  delete m.deletedAt;
  await d.matches.put(m);
}

/** Removes matches that have been in the Trash longer than 30 days. Returns how many were removed. */
export async function purgeOldTrash(d: PickleqDB = db, now = Date.now()): Promise<number> {
  const old = await d.matches.filter((m) => m.deletedAt !== undefined && now - m.deletedAt > TRASH_DAYS * DAY).primaryKeys();
  await d.matches.bulkDelete(old);
  return old.length;
}

export function daysLeftInTrash(m: Match, now = Date.now()): number {
  if (m.deletedAt === undefined) return TRASH_DAYS;
  return Math.max(0, TRASH_DAYS - Math.floor((now - m.deletedAt) / DAY));
}

/** Active (not deleted) matches, newest first. */
export async function activeMatches(d: PickleqDB = db): Promise<Match[]> {
  const all = await d.matches.toArray();
  return all.filter((m) => m.deletedAt === undefined).sort(byNewest);
}

export async function trashedMatches(d: PickleqDB = db): Promise<Match[]> {
  const all = await d.matches.toArray();
  return all.filter((m) => m.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export function byNewest(a: Match, b: Match): number {
  return a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1;
}
