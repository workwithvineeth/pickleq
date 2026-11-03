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
export async function resultsPdf(d: TournamentBundle): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF();
  let y = 18;
  const line = (text: string, size = 10) => {
    pdf.setFontSize(size);
    for (const part of pdf.splitTextToSize(text, 174) as string[]) {
      if (y > 278) { pdf.addPage(); y = 18; }
      pdf.text(part, 18, y); y += size * 0.45 + 2;
    }
  };
  line(d.tournament.name, 16);
  line([d.club.name, d.tournament.venue, d.tournament.city, d.tournament.startDate].filter(Boolean).join(' | '));
  line('Stored organiser-entered DUPR details; not synchronised or verified with DUPR.');
  for (const c of resultsChampions(d)) line(`${c.division} champion: ${c.winner} | Final against ${c.opponent}: ${c.score}`, 11);
  for (const r of resultsRows(d).slice(1)) {
    if (y > 210) { pdf.addPage(); y = 18; }
    line(`${r[1]} | ${r[2]} | ${r[2].endsWith('standings') ? `Pool position ${r[3]}` : 'Match'}`, 11);
    line(`${r[4]}\nDUPR: ${r[5]} | ID: ${r[6]}`);
    if (r[7]) line(`${r[7]}\nDUPR: ${r[8]} | ID: ${r[9]}`);
    line(r[2].endsWith('standings') ? `W ${r[10]} | L ${r[11]} | Points ${r[12]} for / ${r[13]} against` : `${r[14]}${r[15] ? ` | Winner: ${r[15]}` : ''}`);
    y += 3;
  }
  pdf.save(`${d.tournament.name.replace(/[^\w-]+/g, '-')}-results.pdf`);
}
