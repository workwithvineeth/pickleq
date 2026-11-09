import { useEffect, useState } from 'react';
import type { PublicTournament } from '../backend';
import { publicSourcesFor } from '../index';

/** One polling timer; retain the last good score/video tree on refresh errors. */
export function usePublicScores(slug: string) {
  const [state, setState] = useState<{ slug: string; data: PublicTournament | null; error: string | null; loading: boolean }>({ slug, data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true, busy = false;
    let status: PublicTournament['status'] | undefined;
    async function load() {
      if (busy || document.hidden || status === 'done') return;
      busy = true;
      try {
        let data: PublicTournament | null = null, lastError: unknown;
        for (const source of await publicSourcesFor(slug)) {
          try { data = await source.publicTournament(slug); if (data) break; } catch (e) { lastError = e; }
        }
        if (!data && lastError) throw lastError;
        if (alive) { status = data?.status; setState({ slug, data, error: null, loading: false }); }
      } catch (e) {
        if (alive) setState(s => ({ slug, data: s.slug === slug ? s.data : null, error: e instanceof Error ? e.message : 'Scores could not refresh. Trying again shortly.', loading: false }));
      } finally { busy = false; }
    }
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [slug]);
  return state.slug === slug ? state : { data: null, error: null, loading: true };
}
