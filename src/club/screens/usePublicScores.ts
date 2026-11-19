import { useEffect, useState } from 'react';
import type { ClubBackend, PublicTournament } from '../backend';
import { publicSourcesFor } from '../index';

/** Full download at least every 6th poll (2 minutes), even if the version says nothing changed. */
const FULL_EVERY = 6;

/**
 * What the hook returns. `updatedAt` is when a poll last succeeded (ms since epoch, null before the first one) and
 * `failures` counts failed polls in a row, so a screen can tell a quiet board from one that stopped updating.
 */
export interface PublicScores { data: PublicTournament | null; error: string | null; loading: boolean; updatedAt: number | null; failures: number }

/** One polling timer; retain the last good score/video tree on refresh errors. */
export function usePublicScores(slug: string): PublicScores {
  const [state, setState] = useState<PublicScores & { slug: string }>({ slug, data: null, error: null, loading: true, updatedAt: null, failures: 0 });
  useEffect(() => {
    if(!slug){setState({slug,data:null,error:null,loading:false,updatedAt:null,failures:0});return;}
    let alive = true, busy = false;
    let status: PublicTournament['status'] | undefined;
    // Ask the source that answered last time for its short version first; download the whole tournament only when it
    // changed (or every FULL_EVERY polls as a safety net). An older server without the version check just gets full fetches.
    let last: { source: ClubBackend; rev: string | null } | null = null, polls = 0;
    // Optional call: test doubles and older sources may not have the version check.
    const revOf = (source: ClubBackend) => (source.publicTournamentRev?.(slug) ?? Promise.resolve(null)).catch(() => null);
    async function unchanged(): Promise<boolean> {
      if (!last?.rev || ++polls % FULL_EVERY === 0) return false;
      return (await revOf(last.source)) === last.rev;
    }
    async function load() {
      if (busy || document.hidden || status === 'done') return;
      busy = true;
      try {
        if (await unchanged()) { if (alive) setState(s => ({ ...s, error: null, updatedAt: Date.now(), failures: 0 })); return; }
        let data: PublicTournament | null = null, lastError: unknown;
        for (const source of await publicSourcesFor(slug)) {
          try {
            // Fetch the version before the data, so a change in between is caught on the next poll, not missed.
            const rev = await revOf(source);
            data = await source.publicTournament(slug);
            if (data) { last = { source, rev }; break; }
          } catch (e) { lastError = e; }
        }
        if (!data && lastError) throw lastError;
        if (alive) { status = data?.status; setState({ slug, data, error: null, loading: false, updatedAt: Date.now(), failures: 0 }); }
      } catch (e) {
        if (alive) setState(s => {
          const same = s.slug === slug;
          return { slug, data: same ? s.data : null, error: e instanceof Error ? e.message : 'Scores could not refresh. Trying again shortly.', loading: false, updatedAt: same ? s.updatedAt : null, failures: same ? s.failures + 1 : 1 };
        });
      } finally { busy = false; }
    }
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [slug]);
  return state.slug === slug ? state : { data: null, error: null, loading: true, updatedAt: null, failures: 0 };
}
