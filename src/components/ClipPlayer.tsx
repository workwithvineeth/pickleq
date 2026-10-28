import { useEffect, useRef, useState } from 'react';
import { clipTick, fmtTime, type Clip, type ClipLoopState } from '../domain/clips';
import { Segmented } from './Controls';

/* Minimal shape of the YouTube IFrame Player API that we use. */
interface YTPlayer {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getPlayerState(): number; setPlaybackRate(r: number): void; destroy(): void;
  loadVideoById(o: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
}
interface YTNamespace { Player: new (el: HTMLElement, opts: unknown) => YTPlayer }
declare global { interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void } }

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads YouTube's player script the first time you press play — never before. */
export function loadYouTubeApi(timeoutMs = 12_000): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); if (window.YT) resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { apiPromise = null; reject(new Error('YouTube didn’t load')); };
      document.head.appendChild(s);
      setTimeout(() => { if (!window.YT?.Player) { apiPromise = null; reject(new Error('YouTube took too long')); } }, timeoutMs);
    });
  }
  return apiPromise;
}

export const watchUrl = (c: Pick<Clip, 'videoId' | 'start'>) => `https://www.youtube.com/watch?v=${c.videoId}${c.start ? `&t=${c.start}s` : ''}`;

type Phase = 'loading' | 'ready' | 'error' | 'offline';
const RATES = [{ value: '0.5', label: '0.5×' }, { value: '0.75', label: '0.75×' }, { value: '1', label: '1×' }];

export function ClipPlayer({ clip, onMarkStart, onMarkEnd }: {
  clip: Clip; onMarkStart: (t: number) => void; onMarkEnd: (t: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [phase, setPhase] = useState<Phase>(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'loading'));
  const [rate, setRate] = useState('1');
  const [loop, setLoop] = useState(true);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const range = useRef({ start: clip.start, end: clip.end });
  range.current = { start: clip.start, end: clip.end };

  useEffect(() => {
    if (phase === 'offline') return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const loopState: ClipLoopState = { reachedStart: false, lastSeek: 0 };
    let prevNow = -1;
    const playSection = () => {
      const { start, end } = range.current;
      try { player.current?.loadVideoById({ videoId: clip.videoId, startSeconds: start, ...(end !== undefined ? { endSeconds: end } : {}) }); }
      catch { player.current?.seekTo(start, true); player.current?.playVideo(); }
    };
    loadYouTubeApi().then((YT) => {
      if (cancelled || !host.current) return;
      const el = document.createElement('div');
      host.current.appendChild(el);
      player.current = new YT.Player(el, {
        host: 'https://www.youtube-nocookie.com',
        videoId: clip.videoId,
        width: '100%', height: '100%',
        // No 'start' here: YouTube often ignores it but still echoes it as the first position, which hides the real one.
        playerVars: { playsinline: 1, rel: 0, autoplay: 1, origin: window.location.origin },
        events: {
          // Loading with startSeconds/endSeconds is YouTube's reliable way to play a section (the start parameter often isn't).
          onReady: () => { if (!cancelled) { setPhase('ready'); playSection(); } },
          onError: () => { if (!cancelled) setPhase('error'); },
        },
      });
      // Keep playback inside the clip (see clipTick for why this is done by polling).
      timer = setInterval(() => {
        const p = player.current; const { start, end } = range.current;
        if (!p) return;
        let now = 0, playing = false;
        try { now = p.getCurrentTime(); playing = p.getPlayerState() === 1; } catch { return; }
        // In the embedded player the state can stay "unstarted" while the video plays, so moving time counts too.
        if (now > prevNow + 0.05) playing = true;
        prevNow = now;
        const action = clipTick(loopState, { now, playing, start, end, loop: loopRef.current, at: Date.now() });
        if (action === 'seek-start') playSection();
        else if (action === 'pause') p.pauseVideo();
      }, 250);
    }).catch(() => { if (!cancelled) setPhase('error'); });
    return () => { cancelled = true; if (timer) clearInterval(timer); try { player.current?.destroy(); } catch { /* already gone */ } player.current = null; };
  }, [clip.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = () => { try { return Math.round(player.current?.getCurrentTime() ?? 0); } catch { return 0; } };

  if (phase === 'offline') return <div className="notice notice-warn">You’re offline. Pro clips need an internet connection.</div>;

  return (
    <div className="section" style={{ gap: 10 }}>
      <div className="clip-frame" ref={host} aria-label={`Video: ${clip.title}`}>
        {phase === 'loading' && <span className="small muted" style={{ position: 'absolute' }}>Loading from YouTube…</span>}
      </div>
      {phase === 'error' && (
        <div className="notice notice-warn">This video can’t play inside the app right now. <a href={watchUrl(clip)} target="_blank" rel="noopener noreferrer">Open it in YouTube</a></div>
      )}
      {phase === 'ready' && (
        <>
          <Segmented label="Playback speed" value={rate} options={RATES} onChange={(r) => { setRate(r); player.current?.setPlaybackRate(Number(r)); }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="chip" onClick={() => { player.current?.seekTo(clip.start, true); player.current?.playVideo(); }}>Replay from {fmtTime(clip.start)}</button>
            {clip.end !== undefined && <button type="button" className="chip" aria-pressed={loop} onClick={() => setLoop(!loop)}>Loop {loop ? 'on' : 'off'}</button>}
            <button type="button" className="chip" onClick={() => onMarkStart(now())}>Mark start here</button>
            <button type="button" className="chip" onClick={() => onMarkEnd(now())}>Mark end here</button>
          </div>
        </>
      )}
    </div>
  );
}
