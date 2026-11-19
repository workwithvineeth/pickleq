import type { Go } from '../../navigation';
import type { PublicTournament } from '../../club/backend';
import { eventsBackend } from '../../club/index';
import { useLoad } from '../../club/screens/common';
import { myTournamentItems, upcomingEntries } from './myTournamentItems';

const today = () => new Date().toLocaleDateString('en-CA');

/**
 * Player Studio's "My tournaments" card: upcoming entries with their status and payment, the next match once the draw
 * is out, and the way to Events and Live scores. It never blocks the Studio: if anything fails it just says so.
 */
export function MyTournaments({ go }: { go: Go }) {
  const b = eventsBackend();
  const state = useLoad(async () => {
    const entries = await b.myEntries();
    const soon = upcomingEntries(entries, today()).filter((x) => x.drawn).slice(0, 3);
    const events: Record<string, PublicTournament | null> = {};
    await Promise.all(soon.map(async (x) => { events[x.slug] = await b.publicTournament(x.slug).catch(() => null); }));
    return myTournamentItems(entries, today(), events);
  }, [b]);
  const items = state.data ?? [];
  const link = (to: Parameters<Go>[0], id?: string) => ({ href: `#/${to}${id ? `/${encodeURIComponent(id)}` : ''}`, onClick: (e: { preventDefault: () => void }) => { e.preventDefault(); go(to, id); } });
  return (
    <section aria-labelledby="my-tournaments-title" style={{ background: '#0D2218', borderRadius: 28, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h2 id="my-tournaments-title" className="disp" style={{ fontSize: 28, margin: 0 }}>My tournaments</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <a className="btn sm" {...link('events')}>Find a tournament</a>
          <a className="btn ghost sm" {...link('live')}>Live scores</a>
        </div>
      </div>
      {state.loading && !state.data && <span className="mut" style={{ fontSize: 14 }}>Loading your entries…</span>}
      {state.error && <span className="mut" style={{ fontSize: 14 }}>Couldn’t load your entries just now. They’re in My entries.</span>}
      {state.data && items.length === 0 && <span className="mut" style={{ fontSize: 14 }}>No upcoming tournaments. Find one in Events and enter from your phone.</span>}
      {items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.slice(0, 3).map((x) => (
            <li key={x.id}>
              <a {...link('event', x.slug)} aria-label={`${x.title}: ${x.status.text}`} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 56, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,.05)', color: 'inherit', textDecoration: 'none' }}>
                <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <b style={{ display: 'block', overflowWrap: 'anywhere' }}>{x.title}</b>
                  <span className="mut" style={{ display: 'block', fontSize: 13 }}>{x.when}</span>
                  {x.next && <span style={{ display: 'block', fontSize: 13, marginTop: 4, color: '#D9F24A' }}>{x.next}</span>}
                  {x.pay && <span className="mut" style={{ display: 'block', fontSize: 13, marginTop: 2 }}>{x.pay}</span>}
                </span>
                <span className={`${x.status.cls} wrapok`}>{x.status.text}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {state.data && <a className="tlink" {...link('my-entries')} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' }}>All my entries →</a>}
    </section>
  );
}
