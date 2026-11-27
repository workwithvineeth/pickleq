import { useState } from 'react';
import { usePublicScores } from '../../club/screens/usePublicScores';
import { STAGE_LABEL } from '../../club/types';
import { canEmbedStream, useCourtStreams } from '../live/useStreams';
import type { PublicRallyPlayer } from '../private/backend';
import { studioMatchesOf, studioRecord, matchWon, matchKind } from './records';
import './athleteCover.css';

export const courtCover = import.meta.env.BASE_URL + 'rallyq/photos/desktop/club-night.jpg';
const rating = (n?: number) => n === undefined ? 'Unrated' : n.toFixed(2);

function LivePlayerMatch({ slug, matchIds }: NonNullable<PublicRallyPlayer['liveEvents']>[number]) {
  const { data } = usePublicScores(slug);
  const { streams } = useCourtStreams(slug);
  const match = data?.matches.find(m => m.status === 'live' && matchIds.includes(m.id));
  if (!data || !match) return null;
  const names = (id?: string) => data.entries.find(e => e.id === id)?.names.join(' / ');
  const stream = streams.find(s => s.court === match.court && canEmbedStream(s));
  return <div className="athlete-live" role="group" aria-label="Live match">
    <strong>Live · Court {match.court} · {[data.divisions.find(d => d.id === match.divisionId)?.name, STAGE_LABEL[match.stage]].filter(Boolean).join(' / ')}</strong>
    <span>{names(match.entryA)} vs {names(match.entryB)}</span>
    <span aria-live="polite">{match.games.map(g => `${g.a}–${g.b}`).join(' · ') || '0–0'}</span>
    {stream && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(stream.videoId)}`} target="_blank" rel="noreferrer">Watch</a>}
  </div>;
}

export function AthleteCover({ player }: { player: PublicRallyPlayer }) {
  const record = studioRecord(player.official);
  const tiles = [
    ['Best run', record.bestRun ? `${record.bestRun} rallies` : '—'],
    ['Biggest comeback', record.comeback ? `${record.comeback.from} → ${record.comeback.to}` : '—'],
    ['Game points won', record.gamePoints ? `${record.closed} of ${record.gamePoints}` : '—'],
    ['Best finish', record.finish === 'Champion' ? 'Champion · ' + player.official.find(m => m.stage === 'final' && matchWon(m))?.tournament : record.finish || '—'],
  ];
  return <section className="athlete-cover" aria-label="Athlete cover">
    <img className="athlete-photo" src={player.photoUrl || courtCover} onError={e=>{if(player.photoUrl && e.currentTarget.getAttribute('src')!==courtCover)e.currentTarget.src=courtCover;}} alt="" />
    <h1>{player.name}</h1>
    <p>{[player.club, player.city].filter(Boolean).join(' · ')}</p>
    <div className="athlete-chips">
      <span>DUPR doubles · <b>{rating(player.duprDoubles)}</b></span>
      <span>DUPR singles · <b>{rating(player.duprSingles)}</b></span>
      <span>✓ Referee-scored</span>
    </div>
    {player.liveEvents?.map(event => <LivePlayerMatch key={event.slug} {...event} />)}
    <dl className="athlete-tiles">
      {tiles.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </section>;
}

export function PlayerRecord({ player }: { player: PublicRallyPlayer }) {
  const [kind, setKind] = useState<'doubles' | 'singles'>(() => player.official.length && player.official.every(m => matchKind(m) === 'singles') ? 'singles' : 'doubles');
  const matches = studioMatchesOf(player.official, kind);
  const record = studioRecord(matches);
  const form = matches.slice(0, 10).reverse();
  return <section className="card athlete-record" aria-label="Record">
    <h2>Record</h2>
    <div className="athlete-chips" role="group" aria-label="Match format">
      {(['doubles', 'singles'] as const).map(format => <button type="button" key={format} aria-pressed={format === kind} onClick={() => setKind(format)}>{format === 'doubles' ? 'Doubles' : 'Singles'}</button>)}
    </div>
    <dl className="athlete-tiles">
      <div><dt>Matches</dt><dd>{record.played}</dd></div>
      <div><dt>Win rate</dt><dd>{record.rate === undefined ? '—' : `${record.rate}%`}</dd></div>
      <div><dt>Best run</dt><dd>{record.bestRun || '—'}</dd></div>
      <div><dt>DUPR</dt><dd>{rating(kind === 'doubles' ? player.duprDoubles : player.duprSingles)}</dd></div>
    </dl>
    <div className="athlete-chips"><strong>Last {form.length}</strong>{form.map(m => <span className={matchWon(m) ? 'athlete-win' : ''} key={m.id} aria-label={matchWon(m) ? 'Win' : 'Loss'}>{matchWon(m) ? 'W' : 'L'}</span>)}</div>
  </section>;
}
