import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PublicTournament } from '../../club/backend';
import { gameOver } from '../../club/domain/momentum';
import { poolLetter } from '../../club/domain/engine';
import { courtMatches, matchView, type PublicMatch } from '../../club/liveView';
import { liveWinEstimate } from '../../club/winBar';
import { usePublicScores } from '../../club/screens/usePublicScores';
import { STAGE_LABEL } from '../../club/types';
import { RallyQMark } from '../Brand';
import { COUNT_STEP_MS, HOLD_MS, countStep, pointLabel, serveOf } from '../tv/motion';
import { useReducedMotion } from '../useReducedMotion';
import './overlay.css';

const WIDTH = 1920;
const HEIGHT = 1080;
const fitToWindow = () => Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);

function overlayOptions() {
  const query = new URLSearchParams(window.location.search);
  const queryStart = window.location.hash.indexOf('?');
  if (queryStart !== -1) {
    new URLSearchParams(window.location.hash.slice(queryStart + 1)).forEach((value, key) => query.set(key, value));
  }
  const scale = Number(query.get('scale')?.trim() || 1);
  return {
    bar: query.get('bar') === 'top' ? 'top' : 'bottom',
    scale: Number.isFinite(scale) ? Math.max(0.75, Math.min(1.25, scale)) : 1,
  };
}

function stageLabel(match: PublicMatch) {
  const label = STAGE_LABEL[match.stage];
  if (match.stage === 'pool' && match.pool) return `${label} ${poolLetter(match.pool)}`;
  if (match.stage !== 'final' && match.bracketPos != null) return `${label} ${match.bracketPos + 1}`;
  return label;
}

function ratingChip(entry: PublicTournament['entries'][number] | undefined) {
  return entry?.duprs?.flatMap(rating =>
    typeof rating === 'number' && Number.isFinite(rating) && rating > 0 ? [rating.toFixed(2)] : [],
  ).join(' · ') ?? '';
}

function meterName(name: string, singles: boolean) {
  const firstPlayer = name.split(' / ')[0].trim().split(/\s+/);
  return singles ? firstPlayer[0] : firstPlayer.at(-1);
}

function WinMeter({ chance, score, nameA, nameB }: { chance: number; score: string; nameA?: string; nameB?: string }) {
  const previous = useRef({ chance, score });
  const [delta, setDelta] = useState(0);
  useLayoutEffect(() => {
    if (previous.current.score !== score) setDelta(chance - previous.current.chance);
    previous.current = { chance, score };
  }, [chance, score]);

  return (
    <div className="overlay-meter">
      <div className="overlay-meter-labels">
        <span className="overlay-meter-a">
          <span className="overlay-ellipsis">{nameA}</span> {chance}%
          {delta !== 0 && <span>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>}
        </span>
        <span>WIN CHANCE · ESTIMATE</span>
        <span className="overlay-meter-b">{100 - chance}% <span className="overlay-ellipsis">{nameB}</span></span>
      </div>
      <div className="overlay-meter-track" aria-hidden="true"><span style={{ width: `${chance}%` }} /></div>
    </div>
  );
}

function ScoreRow({ side, name, rating, points, won, needed, serving, leading }: {
  side: 'A' | 'B'; name: string; rating: string; points: number; won: number; needed: number; serving: boolean; leading: boolean;
}) {
  return (
    <div className="overlay-team" data-side={side} role="group" aria-label={`${name}, ${points} points`}>
      <span className="overlay-rail" aria-hidden="true" />
      <span className="overlay-team-name">
        <span className="overlay-ellipsis">{name}</span>
        {rating && <span className="overlay-dupr" role="img" aria-label={`DUPR ${rating}`}>{rating}</span>}
      </span>
      {serving ? <span className="overlay-serve" role="img" aria-label="Serving" /> : <span />}
      <span className="overlay-games" role="img" aria-label={`${won} of ${needed} games won`}>
        {Array.from({ length: needed }, (_, i) => <i key={i} data-won={i < won} />)}
      </span>
      <span className="overlay-points" data-leading={leading}>{points}</span>
    </div>
  );
}

function ScoreBar({ data, match, view }: { data: PublicTournament; match: PublicMatch; view: ReturnType<typeof matchView> }) {
  const { game, pointsA, pointsB, gamesA, gamesB, format } = view;
  const live = match.status === 'live';
  const reduced = useReducedMotion();
  const [shown, setShown] = useState({ a: pointsA, b: pointsB, game });
  useEffect(() => {
    const next = { a: pointsA, b: pointsB, game };
    if (shown.game === game && shown.a === pointsA && shown.b === pointsB) return;
    if (!live || reduced || shown.game !== game || (shown.a >= pointsA && shown.b >= pointsB)) {
      setShown(next);
      return;
    }
    const timer = window.setTimeout(() => setShown({
      a: countStep(shown.a, pointsA), b: countStep(shown.b, pointsB), game,
    }), COUNT_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [shown, game, pointsA, pointsB, live, reduced]);

  const counting = live && !reduced && shown.game === game;
  const a = counting ? Math.min(shown.a, pointsA) : pointsA;
  const b = counting ? Math.min(shown.b, pointsB) : pointsB;
  const needed = Math.ceil(format.bestOf / 2);
  const over = gameOver(pointsA, pointsB, format.pointsTo, format.golden);
  const serve = live ? serveOf(view.current, view.division?.kind !== 'singles', over) : null;
  const point = live ? pointLabel(pointsA, pointsB, format.pointsTo, !!format.golden, gamesA, gamesB, needed) : '';
  const ratingA = ratingChip(data.entries.find(entry => entry.id === match.entryA));
  const ratingB = ratingChip(data.entries.find(entry => entry.id === match.entryB));
  // Same estimate as the TV board and the live pages (DUPR + score so far), so every screen shows one number.
  const chance = liveWinEstimate(data, match)?.a ?? null;
  const singles = view.division?.kind === 'singles';
  return (
    <div className="overlay-bar">
      <span className="overlay-mark"><RallyQMark size={60} /></span>
      <div className="overlay-teams">
        <ScoreRow side="A" name={view.a} rating={ratingA} points={a} won={gamesA} needed={needed} serving={serve?.side === 'A'} leading={a > b} />
        <ScoreRow side="B" name={view.b} rating={ratingB} points={b} won={gamesB} needed={needed} serving={serve?.side === 'B'} leading={b > a} />
        {chance !== null && <WinMeter chance={chance} score={`${game}:${pointsA}:${pointsB}:${gamesA}:${gamesB}`}
          nameA={meterName(view.a, singles)} nameB={meterName(view.b, singles)} />}
      </div>
      <div className="overlay-match">
        <span className="overlay-stage-label">{stageLabel(match)} · G{game}</span>
        <span className="overlay-call">{serve?.call ?? `${a}-${b}`}</span>
        {point && <span className="overlay-point-chip">{point}</span>}
      </div>
    </div>
  );
}

export function ScoreOverlay({ courtPath }: { courtPath?: string }) {
  const [, slug = '', courtNumber] = /^([^/]+)\/([1-9]\d*)$/.exec(courtPath ?? '') ?? [];
  const court = Number(courtNumber);
  const validCourt = Number.isSafeInteger(court);
  const { data } = usePublicScores(validCourt ? slug : '');
  const { bar, scale } = overlayOptions();
  const [fit, setFit] = useState(fitToWindow);
  useLayoutEffect(() => {
    const html = document.documentElement;
    const resize = () => setFit(fitToWindow());
    html.classList.add('score-overlay-active');
    window.addEventListener('resize', resize);
    return () => {
      html.classList.remove('score-overlay-active');
      window.removeEventListener('resize', resize);
    };
  }, []);

  const onCourt = data && courtMatches(data).find(item => item.court === court)?.match;
  const liveId = onCourt?.status === 'live' ? onCourt.id : undefined;
  const [lastLive, setLastLive] = useState<string>();
  // A public snapshot has no finish time. Hold a result briefly when we saw this match live.
  const finished = !liveId ? data?.matches.find(m => m.id === lastLive && m.status === 'done') : undefined;
  const finishedId = finished?.id;
  useEffect(() => {
    if (liveId) { setLastLive(liveId); return; }
    if (!finishedId) { setLastLive(undefined); return; }
    const timer = window.setTimeout(() => setLastLive(undefined), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [liveId, finishedId]);

  const match = finished ?? (onCourt?.status === 'done' ? undefined : onCourt);
  const view = data && match ? matchView(data, match) : null;
  // Keep panel anchors inside the source when a crew zooms past the stage's fit scale.
  const visibleStage = Math.max(1, scale);
  return (
    <main className="score-overlay" aria-label={validCourt ? `Score overlay, Court ${court}` : 'Score overlay'}>
      <div className="overlay-stage" style={{ width: WIDTH, height: HEIGHT, transform: `scale(${fit * scale})` }}>
        <div className="overlay-panels" style={{ width: WIDTH / visibleStage, height: HEIGHT / visibleStage }}>
          {data && match && view ? (
            <>
              <div className="overlay-heading">
                {liveId && <span className="overlay-live">LIVE</span>}
                <span className="overlay-event overlay-ellipsis">{data.name} · Court {court}</span>
              </div>
              <div className={`overlay-bar-position overlay-bar-${bar}`}>
                {match.status === 'scheduled' ? (
                  <div className="overlay-bar overlay-next">
                    <span className="overlay-mark"><RallyQMark size={42} /></span>
                    <span className="overlay-ellipsis">Next: {view.a} v {view.b}</span>
                    <span className="overlay-stage-label">{stageLabel(match)}</span>
                  </div>
                ) : <ScoreBar key={match.id} data={data} match={match} view={view} />}
              </div>
              <div className="overlay-promo"><span>EVERY COURT LIVE</span><strong>RALLYQ.IN</strong></div>
            </>
          ) : <div className="overlay-empty"><RallyQMark size={42} label="RallyQ" /></div>}
        </div>
      </div>
    </main>
  );
}
