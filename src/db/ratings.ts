import type { RatingEntry, RatingKind } from '../domain/types';
import { db, newId, type PickleqDB } from './db';

export function checkRatingValue(text: string): number | string {
  const n = Number(text.trim());
  if (!text.trim() || !Number.isFinite(n)) return 'Enter your DUPR rating, like 3.82';
  if (n < 1 || n > 8) return 'DUPR ratings are between 1 and 8';
  return Math.round(n * 1000) / 1000;
}

export async function addRating(kind: RatingKind, value: number, date: string, d: PickleqDB = db, now = Date.now()): Promise<RatingEntry> {
  const entry: RatingEntry = { id: newId(), kind, value, date, source: 'dupr-manual', createdAt: now };
  await d.ratings.add(entry);
  return entry;
}

export async function deleteRating(id: string, d: PickleqDB = db): Promise<void> {
  await d.ratings.delete(id);
}

/** Oldest first; same-day entries in the order they were added. */
export function sortRatings(list: RatingEntry[]): RatingEntry[] {
  return [...list].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

export async function ratingHistory(kind: RatingKind, d: PickleqDB = db): Promise<RatingEntry[]> {
  return sortRatings(await d.ratings.where('kind').equals(kind).toArray());
}

/** The rating in force on a date: the latest entry on or before it. */
export function ratingOn(history: RatingEntry[], date: string): number | undefined {
  let v: number | undefined;
  for (const r of history) if (r.date <= date) v = r.value;
  return v;
}
