import { builtInClips, type Clip, type ClipShot, type ClipStatus } from '../domain/clips';
import { db, newId, type PickleqDB } from './db';

/** Adds any suggested clips this phone doesn't have yet. Never brings back one you've hidden or changes one you've edited. */
export async function ensureBuiltInClips(d: PickleqDB = db): Promise<void> {
  const have = new Set((await d.clips.toCollection().primaryKeys()) as string[]);
  const missing = builtInClips().filter((c) => !have.has(c.id));
  if (missing.length) await d.clips.bulkAdd(missing).catch(() => {});
}

export const clipsForShot = (shot: ClipShot, d: PickleqDB = db) => d.clips.where('shot').equals(shot).toArray();
export const setClipStatus = (id: string, status: ClipStatus, d: PickleqDB = db) => d.clips.update(id, { status });
export const setClipRange = (id: string, start: number, end: number | undefined, d: PickleqDB = db) => d.clips.update(id, { start, end });

export async function addCustomClip(c: { shot: ClipShot; videoId: string; title: string; start: number; end?: number }, d: PickleqDB = db): Promise<string> {
  const id = newId();
  const clip: Clip = { id, shot: c.shot, videoId: c.videoId, title: c.title, channel: '', start: c.start, end: c.end, status: 'approved', builtIn: false, addedAt: new Date().toISOString() };
  await d.clips.add(clip);
  return id;
}

/** Your own clips are removed; suggested ones are hidden so they don't come back. */
export async function removeClip(c: Clip, d: PickleqDB = db): Promise<void> {
  if (c.builtIn) await setClipStatus(c.id, 'hidden', d);
  else await d.clips.delete(c.id);
}
