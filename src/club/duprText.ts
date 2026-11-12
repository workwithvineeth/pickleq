import type { PublicTournament } from './backend';

/** "4.20", or "Unrated" when the organisers haven't entered one. */
export const duprOf = (r: number | undefined) => (r === undefined || !Number.isFinite(r) ? 'Unrated' : r.toFixed(2));

/** A public entry's players with their DUPR: "Asha Rao 4.20 / Lata Iyer Unrated". */
export function teamWithDupr(d: PublicTournament, entryId?: string): string | undefined {
  const e = entryId ? d.entries.find((x) => x.id === entryId) : undefined;
  if (!e) return undefined;
  return e.names.map((n, i) => `${n} ${duprOf(e.duprs?.[i])}`).join(' / ');
}

/** Just the ratings, in player order: "DUPR 4.20 · Unrated". */
export function duprLineOf(d: PublicTournament, entryId?: string): string {
  const e = entryId ? d.entries.find((x) => x.id === entryId) : undefined;
  return e ? `DUPR ${e.names.map((_, i) => duprOf(e.duprs?.[i])).join(' · ')}` : '';
}
