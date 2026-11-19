import type { PublicTournament } from './backend';

/** "4.20", or "Unrated" when the organisers haven't entered one. */
export const duprOf = (r: number | undefined) => (r === undefined || !Number.isFinite(r) ? 'Unrated' : r.toFixed(2));

/** A public entry's players, each with their DUPR when they have one: "Asha Rao 4.20 / Lata Iyer". */
export function teamWithDupr(d: PublicTournament, entryId?: string): string | undefined {
  const e = entryId ? d.entries.find((x) => x.id === entryId) : undefined;
  if (!e) return undefined;
  return e.names.map((n, i) => { const r = e.duprs?.[i]; return r === undefined || !Number.isFinite(r) ? n : `${n} ${duprOf(r)}`; }).join(' / ');
}

/** Just the ratings of rated players, in player order: "DUPR 4.20 · 3.95". Empty when nobody is rated. */
export function duprLineOf(d: PublicTournament, entryId?: string): string {
  const e = entryId ? d.entries.find((x) => x.id === entryId) : undefined;
  const rated = e ? e.names.map((_, i) => e.duprs?.[i]).filter((r): r is number => r !== undefined && Number.isFinite(r)) : [];
  return rated.length ? `DUPR ${rated.map(duprOf).join(' · ')}` : '';
}
