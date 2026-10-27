import { STARTER_DRILLS, type DrillCategory, type Goal, type TrainingSession } from '../domain/types';
import { db, newId, type PickleqDB } from './db';

export type NewSession = Omit<TrainingSession, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export function checkSession(s: Pick<NewSession, 'type' | 'minutes' | 'drills'>): string | null {
  if (s.type !== 'rest' && (!Number.isFinite(s.minutes) || s.minutes <= 0)) return 'Enter how long you trained';
  if (s.minutes > 600) return 'That’s over 10 hours. Check the duration';
  for (const d of s.drills) {
    if (!d.category.trim()) return 'Choose a drill for each row';
    if (!Number.isInteger(d.attempts) || d.attempts <= 0) return `${d.category}: enter how many attempts`;
    if (!Number.isInteger(d.made) || d.made < 0) return `${d.category}: enter how many you made`;
    if (d.made > d.attempts) return `${d.category}: made can’t be more than attempts`;
  }
  return null;
}

export async function addSession(input: NewSession, d: PickleqDB = db, now = Date.now()): Promise<TrainingSession> {
  const s: TrainingSession = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await d.sessions.add(s);
  return s;
}

export async function updateSession(id: string, changes: Partial<NewSession>, d: PickleqDB = db, now = Date.now()): Promise<void> {
  await d.sessions.update(id, { ...changes, updatedAt: now });
}

export async function trashSession(id: string, d: PickleqDB = db, now = Date.now()): Promise<void> {
  await d.sessions.update(id, { deletedAt: now });
}

export async function restoreSession(id: string, d: PickleqDB = db): Promise<void> {
  const s = await d.sessions.get(id);
  if (!s) return;
  delete s.deletedAt;
  await d.sessions.put(s);
}

export async function activeSessions(d: PickleqDB = db): Promise<TrainingSession[]> {
  const all = await d.sessions.toArray();
  return all.filter((s) => s.deletedAt === undefined).sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export async function trashedSessions(d: PickleqDB = db): Promise<TrainingSession[]> {
  const all = await d.sessions.toArray();
  return all.filter((s) => s.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export async function purgeOldSessions(d: PickleqDB = db, now = Date.now()): Promise<number> {
  const old = await d.sessions.filter((s) => s.deletedAt !== undefined && now - s.deletedAt > 30 * 86_400_000).primaryKeys();
  await d.sessions.bulkDelete(old);
  return old.length;
}

/** Starter drills first, then your own in the order you added them. */
export async function drillNames(d: PickleqDB = db): Promise<string[]> {
  const custom = (await d.drillCategories.orderBy('nameKey').toArray()).sort((a, b) => a.createdAt - b.createdAt).map((c) => c.name);
  return [...STARTER_DRILLS, ...custom.filter((c) => !STARTER_DRILLS.some((s) => s.toLowerCase() === c.toLowerCase()))];
}

export async function addDrillCategory(name: string, d: PickleqDB = db, now = Date.now()): Promise<string | null> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Enter a name';
  if (clean.length > 40) return 'Keep it under 40 characters';
  const key = clean.toLowerCase();
  if (STARTER_DRILLS.some((s) => s.toLowerCase() === key) || (await d.drillCategories.where('nameKey').equals(key).count())) return 'That drill already exists';
  const c: DrillCategory = { id: newId(), name: clean, nameKey: key, createdAt: now };
  await d.drillCategories.add(c);
  return null;
}

export async function addGoal(g: Omit<Goal, 'id' | 'createdAt'>, d: PickleqDB = db, now = Date.now()): Promise<Goal> {
  const goal: Goal = { ...g, id: newId(), createdAt: now };
  await d.goals.add(goal);
  return goal;
}

export async function updateGoal(id: string, changes: Partial<Goal>, d: PickleqDB = db): Promise<void> {
  await d.goals.update(id, changes);
}

export async function deleteGoal(id: string, d: PickleqDB = db): Promise<void> {
  await d.goals.delete(id);
}
