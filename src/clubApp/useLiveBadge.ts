import { useEffect, useState } from 'react';
import type { PublicTournament } from '../club/backend';
import { eventsBackend } from '../club/index';

/** Count public active courts once per court, never scheduled or private matches. */
export function countLiveCourts(data: PublicTournament | null): number {
  return data?.status === 'live' ? new Set(data.matches.filter(m => m.status === 'live' && m.court).map(m => m.court)).size : 0;
}
interface LiveBadge { count: number; slug?: string }
/** A club chip describes its focused public event; other workspaces use the public live board. */
export function useLiveBadge(scope: string | undefined, clubWorkspace: boolean): LiveBadge {
  const [state, setState] = useState<LiveBadge & { scope?: string }>({ count: 0 });
  useEffect(() => {
    let alive = true, busy = false;
    const b = eventsBackend();
    async function load() {
      if (busy || document.hidden) return;
      if (clubWorkspace && !scope) { setState({ count: 0, scope }); return; }
      busy = true;
      try {
        const slugs = scope ? [scope] : (await b.publicEvents()).filter(e => e.status === 'live' && e.results).map(e => e.slug);
        const unique = [...new Set(slugs)];
        const scores = await Promise.all(unique.map(slug => b.publicTournament(slug)));
        const active = unique.filter((_, i) => countLiveCourts(scores[i]) > 0);
        if (alive) setState({ count: scores.reduce((n, d) => n + countLiveCourts(d), 0), slug: active.length === 1 ? active[0] : undefined, scope });
      } catch { if (alive) setState({ count: 0, scope }); }
      finally { busy = false; }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [scope, clubWorkspace]);
  return clubWorkspace && !scope ? { count: 0 } : state.scope === scope ? state : { count: 0 };
}
