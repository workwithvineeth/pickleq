import { memo, useId, type KeyboardEvent } from 'react';
import type { PublicCourtStream } from '../../club/backend';
import { videoState } from '../../club/liveView';
import { isYouTubeVideoId } from '../../club/live/youtubeLink';
import type { Go } from '../../navigation';
import { Dna } from '../arena/Dna';
import { LivingQ } from '../arena/LivingQ';
import { currentRun, type Rally } from '../arena/rallies';
import { clubMark, PublicShell } from '../shell/Shell';
import { canEmbedStream, MAX_SCORE_DELAY } from './useStreams';
import './streams.css';

const YouTubeFrame = memo(function YouTubeFrame({ videoId }: { videoId: string }) {
  return <iframe title="YouTube court video"
    src={`https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
    referrerPolicy="strict-origin-when-cross-origin" />;
});

interface WatchScore {
  court: string;
  status: string;
  stage: string;
  a: string;
  b: string;
  sa: number;
  sb: number;
  game: number;
  games: string[];
  rallies?: Rally[];
  serving?: { team: 'A' | 'B'; no: 1 | 2; call: string } | null;
  point?: string;
}

function ScoreCard({ court, score, updated }: { court: number; score?: WatchScore; updated: string }) {
  const rallies = score?.rallies ?? [];
  const run = currentRun(rallies);
  return (
    <section className="stream-card watch-score" aria-label={`Court ${court} scoreboard`}>
      <header className="stream-actions">
        <h2>Court {court} scores</h2>
        {score && <span className="stream-chip" data-live={score.status === 'Live'}>{score.status}</span>}
      </header>
      {score ? <>
        <p className="stream-note">{score.stage} · Game {score.game}</p>
        {(['A', 'B'] as const).map(team => (
          <div key={team} className="watch-team" data-team={team}>
            <div className="watch-team-name">
              {score.serving?.team === team && <span role="img" className="watch-serve" aria-label="Serving" />}
              <b>{team === 'A' ? score.a : score.b}</b>
              {run?.team === team && run.count >= 3 && <small>{run.count} in a row</small>}
            </div>
            <strong className="n" aria-label={`Team ${team} points`}>{team === 'A' ? score.sa : score.sb}</strong>
          </div>
        ))}
        {(score.serving || score.point || score.games.length > 0) && <div className="stream-actions">
          {score.serving && <p className="watch-call">Referee call <b className="n">{score.serving.call}</b></p>}
          {score.point && <span className="stream-chip">{score.point}</span>}
          {score.games.length > 0 && <p className="stream-note">Games {score.games.join(' · ')}</p>}
        </div>}
        {rallies.length > 0 && <div className="watch-rallies">
          <div className="watch-q" role="img" aria-label={`Living Q, ${rallies.length} rallies`}>
            <LivingQ rallies={rallies} confirmed={score.status === 'Final'} />
          </div>
          <div className="watch-dna"><span className="stream-note">Match DNA · this game</span><Dna rallies={rallies} /></div>
        </div>}
      </> : <p>No match scores on this court yet.</p>}
      <p className="stream-note">{updated}</p>
    </section>
  );
}

interface CourtWatchProps {
  go: Go;
  name: string;
  club: string;
  venue?: string;
  streams: PublicCourtStream[];
  court: number;
  chooseCourt: (court: number) => void;
  scores: WatchScore[];
  updated: string;
  venues: { label: string; slug: string }[];
  chooseVenue: (slug: string) => void;
  slug: string;
  settings: { enabled: boolean; seconds: number };
  setSettings: (settings: CourtWatchProps['settings']) => void;
}

export function CourtWatch({ go, name, club, venue, streams, court, chooseCourt, scores, updated, venues, chooseVenue, slug, settings, setSettings }: CourtWatchProps) {
  const ids = useId();
  const byCourt = new Map(scores.map(score => [Number(score.court.slice(6)), score]));
  const courts = [...new Set([court, ...byCourt.keys(), ...streams.map(stream => stream.court)])].sort((a, b) => a - b);
  const score = byCourt.get(court);
  const video = streams.find(stream => stream.court === court);
  const status = videoState(video);
  const validVideo = video && isYouTubeVideoId(video.videoId) ? video : undefined;
  const playVideo = validVideo && canEmbedStream(validVideo);
  const otherStreams = streams.filter(stream => stream.court !== court && isYouTubeVideoId(stream.videoId));
  const panelId = ids + '-panel';

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    const position = courts.indexOf(court);
    const next = {
      ArrowRight: courts[(position + 1) % courts.length],
      ArrowLeft: courts[(position + courts.length - 1) % courts.length],
      Home: courts[0],
      End: courts.at(-1),
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    chooseCourt(next);
    document.getElementById(ids + '-court-' + next)?.focus();
  }

  return (
    <PublicShell go={go} active="live">
      <div className="court-watch">
        <header className="watch-heading">
          <span className="watch-mark" aria-hidden="true">{clubMark(club)}</span>
          <div><h1 className="disp">{name}</h1>{venue && <p className="stream-note">{venue}</p>}</div>
          {venues.length > 1 && <label className="watch-venue">Event
            <select value={slug} onChange={event => chooseVenue(event.target.value)}>
              {venues.map(event => <option key={event.slug} value={event.slug}>{event.label}</option>)}
            </select>
          </label>}
        </header>
        <div className="watch-tabs" role="tablist" aria-label="Courts" onKeyDown={navigateTabs}>
          {courts.map(number => {
            const match = byCourt.get(number);
            return <button key={number} id={ids + '-court-' + number} type="button" role="tab"
              aria-selected={court === number} aria-controls={panelId} tabIndex={court === number ? 0 : -1}
              className={court === number ? 'stream-selected' : undefined} onClick={() => chooseCourt(number)}>
              Court {number}{match && <span className="n">{match.sa}–{match.sb}</span>}
            </button>;
          })}
        </div>
        <div id={panelId} role="tabpanel" aria-labelledby={ids + '-court-' + court} className="watch-layout">
          <section className="watch-video" aria-label={`Court ${court} video`}>
            <div className="watch-stage">
              {playVideo ? <YouTubeFrame key={validVideo.videoId} videoId={validVideo.videoId} /> : <p>{status}</p>}
              {playVideo && <span className="stream-chip" data-live={status === 'LIVE'}>{status}</span>}
            </div>
          </section>
          <ScoreCard court={court} score={score} updated={updated} />
          {(playVideo || validVideo) && <div className="stream-actions watch-controls">
            {playVideo && <>
              <button type="button" role="switch" aria-label="Synced to video" aria-checked={settings.enabled}
                onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}>
                <span className="watch-switch" aria-hidden="true" />
                {settings.enabled ? 'Synced to video' : 'Instant scores'}
              </button>
              <label className="watch-delay">
                <span>Delay {settings.seconds} s</span>
                <input type="range" min="0" max={MAX_SCORE_DELAY} value={settings.seconds}
                  disabled={!settings.enabled} aria-label="Score delay in seconds"
                  onChange={event => setSettings({ ...settings, seconds: Number(event.target.value) })} />
              </label>
            </>}
            {validVideo && <a href={`https://www.youtube.com/watch?v=${validVideo.videoId}`} target="_blank" rel="noopener noreferrer">
              Watch on YouTube ↗
            </a>}
          </div>}
        </div>
        {otherStreams.length > 0 && <section className="watch-others" aria-label="Other courts">
          <h2>Other courts</h2>
          <div className="watch-thumbnails">
            {otherStreams.map(stream => {
              const state = videoState(stream);
              const match = byCourt.get(stream.court);
              return <button key={stream.court} type="button" onClick={() => chooseCourt(stream.court)}>
                <span className="watch-thumb">
                  <img src={`https://i.ytimg.com/vi/${stream.videoId}/mqdefault.jpg`} alt="" loading="lazy" />
                  <span aria-hidden="true">▶</span>
                </span>
                <span className="watch-thumb-text">
                  <b>Court {stream.court}</b>
                  <span className="stream-chip" data-live={state === 'LIVE'}>{state}</span>
                  {match && <small>{match.a} v {match.b}</small>}
                </span>
              </button>;
            })}
          </div>
        </section>}
      </div>
    </PublicShell>
  );
}
