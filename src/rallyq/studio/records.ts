import { gameOver } from '../../club/domain/momentum';
import type { OfficialMatch } from '../../club/playerStudio';
import { ralliesOf } from '../arena/rallies';

export const matchKind = (m: OfficialMatch) => m.kind ?? (m.sideA.length === 2 && m.sideB.length === 2 ? 'doubles' : 'singles');
export const matchWon = (m: OfficialMatch) => m.winner === m.mySide;
export const studioMatchesOf = (matches: OfficialMatch[], kind?: 'singles' | 'doubles') =>
  matches.filter(m => !kind || matchKind(m) === kind).sort((a, b) => b.playedOn.localeCompare(a.playedOn));

export function matchEvidence(match: OfficialMatch) {
  const targets = match.format.pointsTo;
  const golden = match.format.golden;
  let bestRun = 0, gamePoints = 0, closed = 0, trailed = false;
  let comeback: { deficit: number; from: string; to: string } | undefined;
  const games = match.games.map(game => ralliesOf(game, matchKind(match) === 'doubles'));
  for (const [index, rallies] of games.entries()) {
    const game = match.games[index];
    const completeRallies = (game.mode ?? match.format.scoring) === 'rally' || rallies.some(r => r.serverTeam !== null);
    let run = 0, mine = 0, theirs = 0, deficit = 0, from = '';
    for (const rally of rallies) {
      const won = rally.winner === match.mySide;
      run = won ? run + 1 : 0;
      if (completeRallies) bestRun = Math.max(bestRun, run);
      const opportunity = targets !== undefined && !gameOver(mine, theirs, targets, golden)
        && gameOver(mine + 1, theirs, targets, golden);
      if (completeRallies && opportunity && (rally.serverTeam === null || rally.serverTeam === match.mySide)) {
        gamePoints++;
        if (won && rally.outcome === 'point') closed++;
      }
      if (rally.outcome === 'point') {
        mine += Number(won);
        theirs += Number(!won);
      }
      if (theirs - mine > deficit) {
        deficit = theirs - mine;
        from = `${mine}–${theirs}`;
      }
    }
    trailed ||= deficit > 0;
    if (mine > theirs && deficit > (comeback?.deficit ?? 0)) comeback = { deficit, from, to: `${mine}–${theirs}` };
  }
  return { bestRun, gamePoints, closed, trailed, comeback, games };
}

export function studioRecord(matches: OfficialMatch[]) {
  let bestRun = 0, gamePoints = 0, closed = 0, finish = '', rank = -1;
  let comeback: ReturnType<typeof matchEvidence>['comeback'];
  const stages = { pool: [0, 'Pool stage'], r32: [1, 'Round of 32'], r16: [2, 'Round of 16'], qf: [3, 'Quarter-final'], sf: [4, 'Semi-final'], final: [5, 'Finalist'] } as const;
  for (const match of matches) {
    const data = matchEvidence(match);
    bestRun = Math.max(bestRun, data.bestRun);
    gamePoints += data.gamePoints;
    closed += data.closed;
    if (data.comeback && data.comeback.deficit > (comeback?.deficit ?? 0)) comeback = data.comeback;
    const stage = match.stage === 'friendly' ? undefined : stages[match.stage];
    if (!stage) continue;
    const champion = match.stage === 'final' && matchWon(match);
    const current = champion ? 6 : stage[0];
    if (current > rank) {
      rank = current;
      finish = champion ? 'Champion' : stage[1];
    }
  }
  const wins = matches.filter(matchWon).length;
  return { bestRun, gamePoints, closed, comeback, finish, wins, played: matches.length, rate: matches.length ? Math.round(wins / matches.length * 100) : undefined };
}
