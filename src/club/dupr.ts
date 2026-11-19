import { matchResult } from './domain/engine';
import type { ClubMatch, ClubPlayer, ClubTournament, Division } from './types';

/**
 * DUPR match upload: one row per match, 22 columns. Match type, scoring type, event, date, the four players with
 * their DUPR IDs, then up to five games per side.
 * The header wording below must match DUPR's own template (Club › Matches › Add matches › Import via CSV › Download
 * template). Keep it in this one place so it's a one-line change if DUPR renames a column.
 */
export const DUPR_HEADER = [
  'matchType', 'scoreType', 'event', 'date',
  'playerA1', 'playerA1DuprId', 'playerA2', 'playerA2DuprId',
  'playerB1', 'playerB1DuprId', 'playerB2', 'playerB2DuprId',
  'teamAGame1', 'teamBGame1', 'teamAGame2', 'teamBGame2', 'teamAGame3', 'teamBGame3',
  'teamAGame4', 'teamBGame4', 'teamAGame5', 'teamBGame5',
];

export interface DuprCheck {
  /** Finished matches that can go to DUPR. */
  ready: ClubMatch[];
  /** Finished matches held back because a player has no DUPR ID. */
  missingIds: ClubMatch[];
  /** Players without a DUPR ID who played in a finished match. */
  playersMissing: ClubPlayer[];
  /** Matches not finished yet (they're never exported). */
  unfinished: number;
  /** Walkovers and matches without game scores (DUPR needs real scores). */
  noScores: number;
}

export function duprCheck(matches: ClubMatch[], players: Map<string, ClubPlayer>): DuprCheck {
  const out: DuprCheck = { ready: [], missingIds: [], playersMissing: [], unfinished: 0, noScores: 0 };
  const missing = new Set<string>();
  for (const m of matches) {
    // Cancelled matches and knockout byes (no opponent) were never played.
    if (m.status === 'void' || !m.sideB.length || !m.sideA.length) continue;
    if (m.status !== 'done') { out.unfinished++; continue; }
    if (!m.games.length || !matchResult(m).winner) { out.noScores++; continue; }
    const ids = [...m.sideA, ...m.sideB];
    const lacking = ids.filter((id) => !players.get(id)?.duprId);
    if (lacking.length) { out.missingIds.push(m); lacking.forEach((id) => missing.add(id)); } else out.ready.push(m);
  }
  out.playersMissing = [...missing].map((id) => players.get(id)).filter((p): p is ClubPlayer => !!p).sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function cell(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The CSV file for DUPR, from matches that are ready (finished, real scores, every player has a DUPR ID). */
export function duprCsv(t: ClubTournament, divisions: Division[], ready: ClubMatch[], players: Map<string, ClubPlayer>): string {
  const divName = new Map(divisions.map((d) => [d.id, d.name]));
  const rows = ready.map((m) => {
    const doubles = m.sideA.length > 1;
    const p = (id: string | undefined) => (id ? players.get(id) : undefined);
    const [a1, a2] = m.sideA.map(p), [b1, b2] = m.sideB.map(p);
    const games: (number | undefined)[] = [];
    for (let i = 0; i < 5; i++) { const g = m.games[i]; games.push(g?.a, g?.b); }
    const event = [t.name, m.divisionId ? divName.get(m.divisionId) : undefined].filter(Boolean).join(' · ');
    return [
      doubles ? 'D' : 'S', m.format.scoring === 'rally' ? 'RALLY' : 'SIDEOUT', event, m.playedOn ?? t.startDate,
      a1?.name, a1?.duprId, doubles ? a2?.name : '', doubles ? a2?.duprId : '',
      b1?.name, b1?.duprId, doubles ? b2?.name : '', doubles ? b2?.duprId : '',
      ...games,
    ].map(cell).join(',');
  });
  return [DUPR_HEADER.join(','), ...rows].join('\r\n') + '\r\n';
}
