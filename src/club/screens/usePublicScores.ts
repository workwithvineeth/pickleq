import { useEffect, useState } from 'react';
import type { ClubBackend, PublicTournament } from '../backend';
import { publicSourcesFor } from '../index';
import { applyLiveMessage, LIVE_SCORE_POLL_MS, type LiveScoreMessage, type LiveScoreStream } from '../live/scoreStream';

/** Keep the revision check, with a full download at least every sixth poll. */
const FULL_EVERY = 6;
const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000];
/**
 * A message for a match this page doesn't know yet (a knockout was just drawn, a late entry's matches were added) needs
 * the full tournament. Spread those downloads over a few seconds so thousands of viewers don't all ask at once.
 * A known match's message is applied as it is: the trigger sends the same public fields public_tournament returns,
 * so a full download per point would only cost bandwidth (the 60 s version check still catches anything missed).
 */
const CONFIRM_MS = 1500;
const CONFIRM_SPREAD_MS = 3000;

/** `updatedAt` is the last successful read or score message. `failures` counts failed refreshes in a row. */
export interface PublicScores { data: PublicTournament | null; error: string | null; loading: boolean; updatedAt: number | null; failures: number; live: boolean }

const empty = (slug: string) => ({ slug, data: null, error: null, loading: !!slug, updatedAt: null, failures: 0, live: false });

export function usePublicScores(slug: string): PublicScores {
  const [state, setState] = useState<PublicScores & { slug: string }>(() => empty(slug));
  useEffect(() => {
    if (!slug) { setState(empty(slug)); return; }
    let alive = true, busy = false, fullPending = false, live = false;
    let snapshot: PublicTournament | null = null;
    let last: { source: ClubBackend; rev: string | null } | null = null, polls = 0;
    let stream: LiveScoreStream | undefined, disconnect: (() => void) | undefined;
    let poll: number | undefined, confirm: number | undefined, retry: number | undefined;
    let attempt = 0, generation = 0;
    const receivedAt = new Map<string, number>();
    const duringFetch = new Map<string, LiveScoreMessage>();

    function pollAgain() {
      window.clearInterval(poll);
      poll = window.setInterval(() => void load(), live ? LIVE_SCORE_POLL_MS : 20_000);
    }

    function setLive(value: boolean) {
      if (live === value) return;
      live = value;
      setState(s => ({ ...s, live: value }));
      pollAgain();
    }

    function closeStream() {
      generation++;
      window.clearTimeout(retry);
      disconnect?.();
      disconnect = undefined;
    }

    function onMessage(m: LiveScoreMessage) {
      if (!snapshot || m.at < (receivedAt.get(m.id) ?? 0) || m.at < (duringFetch.get(m.id)?.at ?? 0)) return;
      const next = applyLiveMessage(snapshot, m);
      if (busy) duringFetch.set(m.id, m);
      if (next === snapshot) {
        // Unknown match: fetch the whole tournament once, a little later, instead of guessing its place in the draw.
        if (confirm === undefined) confirm = window.setTimeout(() => { confirm = undefined; void load(true); }, CONFIRM_MS + Math.floor(Math.random() * CONFIRM_SPREAD_MS));
        return;
      }
      receivedAt.set(m.id, m.at);
      snapshot = next;
      setState(s => ({ ...s, data: next, error: null, updatedAt: Date.now(), failures: 0 }));
    }

    function connect() {
      closeStream();
      if (!stream) return;
      const connection = generation;
      const unsubscribe = stream.subscribe(slug, m => {
        if (alive && connection === generation) onMessage(m);
      }, status => {
        if (!alive || connection !== generation) return;
        if (status === 'live' && !live) {
          attempt = 0;
          setLive(true);
          // The first snapshot and any reconnect may have missed writes before the channel joined.
          void load(true);
        } else if (status === 'down') {
          setLive(false);
          closeStream();
          retry = window.setTimeout(() => {
            if (document.hidden) return;
            connect();
            if (!live) void load(true);
          }, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
        }
      });
      if (connection === generation) disconnect = unsubscribe;
      else unsubscribe();
    }

    const revOf = (source: ClubBackend) => (source.publicTournamentRev?.(slug) ?? Promise.resolve(null)).catch(() => null);

    async function load(full = false) {
      if (!alive || document.hidden) return;
      if (busy) { fullPending ||= full; return; }
      busy = true;
      try {
        if (!full && last?.rev && ++polls % FULL_EVERY !== 0 && (await revOf(last.source)) === last.rev) {
          if (alive) setState(s => ({ ...s, error: null, updatedAt: Date.now(), failures: 0 }));
          return;
        }
        if (!alive) return;
        let data: PublicTournament | null = null, lastError: unknown;
        let found: typeof last = null;
        for (const source of await publicSourcesFor(slug)) {
          if (!alive) return;
          try {
            // Read the revision first so a write between these reads is caught on the next poll.
            const rev = await revOf(source);
            if (!alive) return;
            duringFetch.clear();
            data = await source.publicTournament(slug);
            if (data) { found = { source, rev }; break; }
          } catch (e) { lastError = e; }
        }
        if (!alive) return;
        if (!data && lastError) throw lastError;
        const changedSource = found?.source !== last?.source;
        last = found;
        if (changedSource) receivedAt.clear();
        else if (data && data.status !== 'done') {
          // An older response fetched while a message arrived should not take the score backwards.
          for (const m of duringFetch.values()) {
            const next = applyLiveMessage(data, m);
            if (next !== data) receivedAt.set(m.id, m.at);
            data = next;
          }
        }
        snapshot = data;
        const done = data?.status === 'done';
        setState({ slug, data, error: null, loading: false, updatedAt: Date.now(), failures: 0, live: live && !done });
        if (done) stop();
        else if (changedSource) {
          setLive(false);
          attempt = 0;
          window.clearTimeout(confirm); confirm = undefined;
          stream = found?.source.liveScores?.();
          connect();
        }
      } catch (e) {
        if (alive) setState(s => ({ slug, data: snapshot, error: e instanceof Error ? e.message : 'Scores could not refresh. Trying again shortly.',
          loading: false, updatedAt: s.slug === slug ? s.updatedAt : null, failures: s.slug === slug ? s.failures + 1 : 1, live }));
      } finally {
        busy = false;
        duringFetch.clear();
        if (fullPending) { fullPending = false; void load(true); }
      }
    }

    function resume() {
      if (document.hidden) return;
      if (stream) {
        setLive(false);
        connect();
        if (live) return;
      }
      void load(!!stream);
    }

    function stop() {
      alive = false;
      closeStream();
      window.clearTimeout(confirm); confirm = undefined;
      window.clearInterval(poll);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    }

    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    pollAgain();
    void load();
    return stop;
  }, [slug]);
  return state.slug === slug ? state : empty(slug);
}
