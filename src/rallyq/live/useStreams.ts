import { useEffect, useState } from 'react';
import { demoBackend, isSampleSlug, serverBackend } from '../../club';
import type { PublicCourtStream, PublicTournament } from '../../club/backend';
import { clubMode } from '../../club/config';
import { videoState } from '../../club/liveView';

const EMPTY_STREAMS: PublicCourtStream[] = [];

export function canEmbedStream(video?: PublicCourtStream) {
  const status = videoState(video);
  return !!video && status !== 'Video unavailable' && status !== 'Stream ended';
}

export function useCourtStreams(slug: string) {
  const [result, setResult] = useState<{ slug: string; streams: PublicCourtStream[] }>();

  useEffect(() => {
    if (!slug) return;
    let active = true;
    let loading = false;

    async function refresh() {
      if (loading || document.hidden) return;
      loading = true;
      try {
        const server = serverBackend();
        const demo = isSampleSlug(slug) || clubMode() === 'demo' ? demoBackend() : null;
        const source = demo && (isSampleSlug(slug) || await demo.publicTournament(slug)) ? demo : server;
        const streams = await source?.publicCourtStreams(slug) ?? EMPTY_STREAMS;
        if (active) setResult({ slug, streams });
      } catch {
        // A failed refresh keeps the last successful list for this event.
        if (active) setResult(previous => previous?.slug === slug ? previous : { slug, streams: EMPTY_STREAMS });
      } finally {
        loading = false;
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [slug]);

  return {
    streams: result?.slug === slug ? result.streams : EMPTY_STREAMS,
    loading: !!slug && result?.slug !== slug,
  };
}

export const MAX_SCORE_DELAY = 30;
const SYNC_KEY = 'pq-live-video-sync';

export function useVideoSync() {
  const [settings, update] = useState(() => {
    const defaults = { enabled: true, seconds: 3 };
    try {
      const saved = JSON.parse(localStorage.getItem(SYNC_KEY) ?? 'null');
      if (typeof saved?.enabled === 'boolean' && Number.isInteger(saved.seconds)
        && saved.seconds >= 0 && saved.seconds <= MAX_SCORE_DELAY) return { enabled: saved.enabled, seconds: saved.seconds } as typeof defaults;
    } catch { /* Keep the defaults if storage is unavailable. */ }
    return defaults;
  });
  function setSettings(next: typeof settings) {
    update(next);
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(next)); } catch { /* Use the choice for this visit. */ }
  }
  return { settings, setSettings };
}

interface Snapshot { at: number; data: PublicTournament }

export function useDelayedScores(slug: string, data: PublicTournament | null, seconds: number) {
  const [history, setHistory] = useState<{ slug: string; snapshots: Snapshot[] }>();
  const [, advance] = useState(0);
  useEffect(() => {
    if (!data) return;
    const at = Date.now();
    setHistory(previous => {
      const snapshots = previous?.slug === slug ? previous.snapshots : [];
      if (snapshots.at(-1)?.data === data) return previous;
      // Retain one baseline from before the maximum delay and each snapshot after it.
      const oldest = snapshots.findLastIndex(s => s.at <= at - MAX_SCORE_DELAY * 1000);
      return { slug, snapshots: [...snapshots.slice(Math.max(oldest, 0)), { at, data }] };
    });
  }, [slug, data]);

  const cutoff = Date.now() - seconds * 1000;
  const snapshots = history?.slug === slug ? history.snapshots : [];
  const next = seconds > 0 ? snapshots.find(s => s.at > cutoff) : undefined;
  useEffect(() => {
    if (!next) return;
    const timer = window.setTimeout(() => advance(count => count + 1), Math.max(0, next.at + seconds * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [next, seconds]);

  if (!data || seconds === 0) return data;
  return snapshots.findLast(s => s.at <= cutoff)?.data ?? snapshots[0]?.data ?? data;
}
