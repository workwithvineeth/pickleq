import type { TournamentBundle } from './backend';
import { poolLetter, standings } from './domain/engine';
import { STAGE_LABEL, type ClubMatch } from './types';

export function isBronzeMatch(match: Pick<ClubMatch, 'id' | 'stage'>): boolean {
  return match.stage === 'friendly' && (match.id === '9dc404d8-b6b1-44e0-9736-eed346d86784' || match.id === 'e2d45606-456e-4053-b9d5-e5e6d44bebcd');
}

export function scoreText(m: ClubMatch): string {
  if (m.status === 'void') return 'Cancelled';
  if (m.status !== 'done') return m.status === 'live' ? `Live: ${m.games.map((g) => `${g.a}–${g.b}`).join(', ')}` : 'Not played';
  return m.games.length ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : (m.sideB.length ? 'Walkover / no game score recorded' : 'Bye');
}
/** A champion is shown only for one completed final with a recorded winner and both sides present. */
export function resultsChampions(d: TournamentBundle) {
  const names = (ids: string[]) => ids.map((id) => d.players.find((p) => p.id === id)?.name ?? 'Unknown player').join(' / ');
  return d.divisions.flatMap((div) => {
    const finals = d.matches.filter((m) => m.divisionId === div.id && m.stage === 'final' && m.status !== 'void');
    const m = finals[0];
    if (finals.length !== 1 || m.status !== 'done' || !m.winner || !m.sideA.length || !m.sideB.length) return [];
    const score = m.games.length ? m.games.map((g) => m.winner === 'A' ? `${g.a}–${g.b}` : `${g.b}–${g.a}`).join(', ') : scoreText(m);
    return [{ division: div.name, winner: names(m.winner === 'A' ? m.sideA : m.sideB), opponent: names(m.winner === 'A' ? m.sideB : m.sideA), score }];
  });
}
export function resultsRows(d: TournamentBundle): string[][] {
  const rows: string[][] = [['Tournament', 'Division', 'Section', 'Position / match', 'Player / side A', 'DUPR rating / side A', 'DUPR ID / side A', 'Side B', 'DUPR rating / side B', 'DUPR ID / side B', 'W', 'L', 'Points for', 'Points against', 'Games A-B', 'Winner']];
  const players = new Map(d.players.map((p) => [p.id, p]));
  for (const div of d.divisions) {
    const ents = d.entries.filter((e) => e.divisionId === div.id);
    const matches = d.matches.filter((m) => m.divisionId === div.id);
    const names = (ids: string[]) => ids.map((id) => players.get(id)?.name ?? 'Unknown player').join(' / ');
    const ratings = (ids: string[]) => ids.map((id) => { const p = players.get(id); return String((div.kind === 'singles' ? p?.duprSingles : p?.duprDoubles) ?? 'Missing rating'); }).join(' / ');
    const duprIds = (ids: string[]) => ids.map((id) => players.get(id)?.duprId ?? 'Missing ID').join(' / ');
    if (div.shape !== 'ko') for (const pool of [...new Set(ents.map((e) => e.pool ?? 1))].sort((a, b) => a - b)) {
      const group = ents.filter((e) => (e.pool ?? 1) === pool);
      standings(group.map((e) => e.id), matches.filter((m) => m.stage === 'pool' && (m.pool ?? 1) === pool)).forEach((r, i) => {
        for (const pid of group.find((e) => e.id === r.entryId)?.playerIds ?? []) rows.push([d.tournament.name, div.name, `Pool ${poolLetter(pool)} standings`, String(i + 1), names([pid]), ratings([pid]), duprIds([pid]), '', '', '', String(r.wins), String(r.losses), String(r.pointsFor), String(r.pointsAgainst), '', '']);
      });
    }
    for (const m of matches) rows.push([d.tournament.name, div.name, m.stage === 'pool' ? `Pool ${poolLetter(m.pool ?? 1)} match` : isBronzeMatch(m) ? 'Bronze' : STAGE_LABEL[m.stage], m.id,
      names(m.sideA), ratings(m.sideA), duprIds(m.sideA), names(m.sideB), ratings(m.sideB), duprIds(m.sideB), '', '', '', '', scoreText(m), m.winner ? names(m.winner === 'A' ? m.sideA : m.sideB) : '']);
  }
  return rows;
}
export function resultsCsv(d: TournamentBundle): string {
  const cell = (s: string) => `"${(/^[\s]*[=+@-]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  return '\uFEFF' + resultsRows(d).map((r) => r.map(cell).join(',')).join('\r\n');
}
