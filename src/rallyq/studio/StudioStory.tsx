import { useState } from 'react';
import type { OfficialMatch } from '../../club/playerStudio';
import { Dna } from '../arena/Dna';
import type { GoalInput } from '../private/backend';
import { matchEvidence, matchWon, studioMatchesOf, studioRecord } from './records';

export function LatestEvent({ matches, onLog, onGoal, onMatch, goalExists, showLog }: {
  matches: OfficialMatch[];
  onLog: () => void;
  showLog: boolean;
  onGoal: (goal: GoalInput) => Promise<void>;
  onMatch: (id: string) => void;
  goalExists: (title: string) => boolean;
}) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const last = studioMatchesOf(matches)[0];
  if (!last) return null;
  const event = matches.filter(m => m.tournamentId === last.tournamentId);
  const record = studioRecord(event);
  const evidence = event.map(match => ({ match, ...matchEvidence(match) }));
  const best = [...evidence].sort((a, b) => Number(matchWon(b.match)) - Number(matchWon(a.match)) || b.bestRun - a.bestRun)[0];
  const leak = [...evidence].sort((a, b) => (b.gamePoints - b.closed) - (a.gamePoints - a.closed))[0];
  const missed = leak.gamePoints - leak.closed;
  const closest = event.flatMap(match => match.games.map(game => ({
    match, conceded: match.mySide === 'A' ? game.b : game.a, margin: Math.abs(game.a - game.b),
  }))).filter(game => game.conceded > 0).sort((a, b) => a.margin - b.margin)[0];
  const comebackWins = evidence.filter(({ match, trailed }) => {
    const first = match.games[0];
    const lostFirst = match.games.length > 1 && (match.mySide === 'A' ? first.a < first.b : first.b < first.a);
    return matchWon(match) && (trailed || lostFirst);
  }).length;
  const label = comebackWins >= 2 ? 'Comeback specialist'
    : record.gamePoints > 0 && record.closed / record.gamePoints >= .75 ? 'Closer'
      : evidence.some(m => m.games[0]?.[0]?.winner === m.match.mySide) ? 'Fast starter' : '';
  const leakId = missed > 0 ? leak.match.id : closest?.match.id;
  const wins = matches.filter(matchWon).length;
  const target = (Math.floor(wins / 10) + 1) * 10;
  const title = `${target} official wins`;
  async function save() {
    setBusy(true);
    try {
      await onGoal({ title, target, progress: wins });
      setStatus('Goal added.');
    } catch {
      setStatus('Could not save the goal. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return <section className="card studio-story" aria-label="Your latest event">
    <h2>Your latest event</h2>
    <p>{last.tournament}</p>
    <div className="studio-story-grid">
      <div><h3>How did I play?</h3><p>{record.wins} {record.wins===1?'win':'wins'} · {record.played - record.wins} {record.played - record.wins===1?'loss':'losses'}{record.finish && ` · ${record.finish}`}</p>
        {label && <strong>{label}</strong>}
        {best.games.some(g => g.length) && <div className="studio-dna" role="group" aria-label="Best match DNA"><Dna rallies={best.games.find(g => g.length)!.slice(-30)} /></div>}
      </div>
      <div><h3>What should I improve?</h3>
        {missed > 0 ? <p>{missed} game {missed === 1 ? 'point missed' : 'points missed'}.</p>
          : closest ? <p>You conceded {closest.conceded} {closest.conceded === 1 ? 'point' : 'points'} in your closest game.</p>
            : <p>No missed game points recorded at this event.</p>}
        {leakId && <a className="btn sm studio-action" href="#studio-match-overview" onClick={event => {
          event.preventDefault();
          onMatch(leakId);
        }}>Review match</a>}
      </div>
      <div><h3>What’s next?</h3><p>{title} · {wins}/{target}</p>
        <progress value={wins} max={target} aria-label={title} />
        <button className="btn sm studio-action" type="button" disabled={busy || goalExists(title) || status === 'Goal added.'} onClick={() => void save()}>{goalExists(title) || status === 'Goal added.' ? 'Goal added' : 'Make it my goal'}</button>
        {status && <p role="status">{status}</p>}
      </div>
    </div>
    {showLog && <button className="btn studio-action" type="button" onClick={onLog}>Log a session</button>}
  </section>;
}
