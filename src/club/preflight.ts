import { clockText, estimateDay, type EventPlanInput } from './estimate';
import type { ClubMatch, ClubTournament, Division, Entry } from './types';

/** One line of the organiser's "Ready for the day?" check. */
export interface PreflightItem { key: 'entries' | 'draw' | 'links' | 'pins' | 'finish'; ok: boolean; text: string; fix?: 'inbox' | 'entries' | 'links' }

export interface PreflightInput {
  t: ClubTournament;
  divisions: Division[];
  entries: Entry[];
  matches: ClubMatch[];
  /** Courts that have a working referee link (0 = an any-court link). */
  linkCourts: number[];
  /** Both the referee PIN and the desk PIN exist. */
  pins: boolean;
  /** Before the draw of a "they register" tournament: accepted entries per event. */
  accepted?: Record<string, number>;
  /** Finish later than this (minutes after midnight) is a warning. Default 10 pm. */
  latest?: number;
}

/**
 * Entries ✓, draw ✓, referee links ✓, PINs ✓, finish time ✓ — would have caught a tournament with no entries, no draw, or a
 * format that runs past midnight. Pure, so the screen and the tests share it.
 */
export function preflight(x: PreflightInput): PreflightItem[] {
  const { t } = x;
  const active = (divId: string) => x.entries.filter((e) => e.divisionId === divId && e.status !== 'withdrawn').length;
  const drawn = x.matches.some((m) => m.status !== 'void');
  const count = (d: Division) => (drawn || t.entryMode !== 'registration' ? active(d.id) : x.accepted?.[d.id] ?? 0);
  const out: PreflightItem[] = [];

  const short = x.divisions.filter((d) => count(d) < 2);
  const total = x.divisions.reduce((s, d) => s + count(d), 0);
  out.push(x.divisions.length === 0
    ? { key: 'entries', ok: false, text: 'No events yet', fix: 'entries' }
    : short.length === 0
      ? { key: 'entries', ok: true, text: `Entries: ${x.divisions.map((d) => `${count(d)} in ${d.name}`).join(', ')}` }
      : { key: 'entries', ok: false, text: total === 0 ? 'No entries yet' : `Not enough entries in ${short.map((d) => d.name).join(', ')}`, fix: t.entryMode === 'registration' && !t.drawnAt ? 'inbox' : 'entries' });

  const undrawn = x.divisions.filter((d) => count(d) >= 2 && !x.matches.some((m) => m.divisionId === d.id && m.status !== 'void'));
  const real = x.matches.filter((m) => m.status !== 'void').length;
  out.push(drawn && undrawn.length === 0
    ? { key: 'draw', ok: true, text: `Draw made: ${real} match${real === 1 ? '' : 'es'} on the schedule` }
    : { key: 'draw', ok: false, text: drawn ? `No draw yet for ${undrawn.map((d) => d.name).join(', ')}` : 'No draw yet', fix: t.entryMode === 'registration' ? 'inbox' : 'entries' });

  const courts = Array.from({ length: t.courts }, (_, i) => i + 1);
  const anyCourt = x.linkCourts.includes(0);
  const have = courts.filter((c) => x.linkCourts.includes(c)).length;
  out.push(anyCourt || have === t.courts
    ? { key: 'links', ok: true, text: anyCourt && have < t.courts ? 'Referee links: an any-court link is ready' : `Referee links for all ${t.courts} court${t.courts === 1 ? '' : 's'}` }
    : { key: 'links', ok: false, text: have === 0 ? 'No referee links yet' : `Referee links for ${have} of ${t.courts} courts`, fix: 'links' });

  out.push(x.pins
    ? { key: 'pins', ok: true, text: 'Referee PIN and desk PIN are set (tell them by voice, separately)' }
    : { key: 'pins', ok: false, text: 'PINs not set yet', fix: 'links' });

  const events: EventPlanInput[] = x.divisions.map((d) => ({
    name: d.name, entries: count(d), shape: d.shape === 'ko' ? 'ko' : d.advance > 0 ? 'pools-ko' : 'rr', pools: d.pools, advance: d.advance, extra: d.extra ?? 0,
  }));
  if (events.some((e) => e.entries >= 2)) {
    const est = estimateDay(events, t.courts, t.slotMinutes, t.startTime);
    const latest = x.latest ?? 22 * 60;
    const late = est.endMinutes > latest;
    out.push({ key: 'finish', ok: !late, text: `${est.matches} matches; the last one ends about ${clockText(est.endMinutes)}${late ? '. Choose a faster format (pools with knockouts) before the draw.' : ''}` });
  } else {
    out.push({ key: 'finish', ok: false, text: 'Finish time: shown once there are entries' });
  }
  return out;
}
