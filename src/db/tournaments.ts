import { STARTER_CHECKLIST, type ChecklistItem, type Tournament, type TournamentEvent } from '../domain/tournaments';
import { db, newId, type PickleqDB } from './db';
import { TRASH_DAYS } from './matches';

const DAY = 86_400_000;

export type TournamentDraft = Pick<Tournament, 'name' | 'startDate' | 'endDate' | 'venue'> & { events: Omit<TournamentEvent, 'id' | 'teams' | 'otherResults' | 'schedule'>[] };

export function starterChecklist(): ChecklistItem[] {
  return STARTER_CHECKLIST.map((text) => ({ id: newId(), text, done: false }));
}

export async function addTournament(draft: TournamentDraft, d: PickleqDB = db, now = Date.now()): Promise<Tournament> {
  const t: Tournament = {
    id: newId(), name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate, venue: draft.venue?.trim() || undefined,
    events: draft.events.map((e) => ({ ...e, name: e.name.trim(), partnerName: e.partnerName?.trim() || undefined, id: newId(), teams: [], otherResults: [], schedule: [] })),
    checklist: starterChecklist(), createdAt: now, updatedAt: now,
  };
  await d.tournaments.add(t);
  return t;
}

/** Applies a change to a tournament in one step. */
export async function changeTournament(id: string, fn: (t: Tournament) => Tournament | void, d: PickleqDB = db, now = Date.now()): Promise<Tournament> {
  return d.transaction('rw', d.tournaments, async () => {
    const t = await d.tournaments.get(id);
    if (!t) throw new Error('Tournament not found');
    const copy: Tournament = structuredClone(t);
    const next = fn(copy) ?? copy;
    next.updatedAt = now;
    await d.tournaments.put(next);
    return next;
  });
}

export const changeEvent = (tid: string, eid: string, fn: (e: TournamentEvent) => void, d: PickleqDB = db) =>
  changeTournament(tid, (t) => { const e = t.events.find((x) => x.id === eid); if (e) fn(e); }, d);

export async function activeTournaments(d: PickleqDB = db): Promise<Tournament[]> {
  return (await d.tournaments.toArray()).filter((t) => t.deletedAt === undefined).sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export async function trashedTournaments(d: PickleqDB = db): Promise<Tournament[]> {
  return (await d.tournaments.toArray()).filter((t) => t.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** Matches stay in your history; they just lose the tournament badge while it's in the Trash. */
export const trashTournament = (id: string, d: PickleqDB = db, now = Date.now()) => d.tournaments.update(id, { deletedAt: now });
export async function restoreTournament(id: string, d: PickleqDB = db) {
  const t = await d.tournaments.get(id);
  if (t) { delete t.deletedAt; await d.tournaments.put(t); }
}

export async function purgeOldTournaments(d: PickleqDB = db, now = Date.now()): Promise<number> {
  const old = await d.tournaments.filter((t) => t.deletedAt !== undefined && now - t.deletedAt > TRASH_DAYS * DAY).primaryKeys();
  if (!old.length) return 0;
  await d.transaction('rw', d.tournaments, d.matches, async () => {
    await d.tournaments.bulkDelete(old);
    const gone = new Set(old);
    const linked = await d.matches.filter((m) => !!m.tournament && gone.has(m.tournament.tournamentId)).toArray();
    for (const m of linked) { delete m.tournament; await d.matches.put(m); }
  });
  return old.length;
}
