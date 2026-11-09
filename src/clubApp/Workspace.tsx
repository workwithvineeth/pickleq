// The three signed-in workspaces from the Phase 3 prototypes (01 Platform admin, 02 Club / organiser, 03 Player Studio):
// a maroon side menu with grouped sections on laptops, the same items as scrollable tabs on phones, and a top bar with
// where you are. Every item opens a real screen; club items that need a tournament use the one you're working on.
import { useEffect, useState } from 'react';
import type { Go, Route, RouteName } from '../navigation';
import { backend, eventsBackend } from '../club/index';
import type { ClubTournament } from '../club/types';
import { isStaff } from '../club/types';
import { ThemeControls } from '../components/ThemeSwitch';
import { useLiveBadge } from './useLiveBadge';
import { BrandMark, CAPTION } from '../club/screens/Brand';

export type WorkspaceKind = 'admin' | 'club' | 'studio';
interface Item { key: string; label: string; glyph: string; to: [RouteName, string?] | null; hint?: string }
interface Group { label: string; items: Item[] }

const CLUB_ROUTES: RouteName[] = ['club-view', 'club-tournament', 'club-tournament-new', 'club-desk', 'club-scorers', 'club-entries', 'club-inbox', 'club-results-dupr', 'club-dupr', 'club-score', 'club-player'];
const TOURNAMENT_ROUTES: RouteName[] = ['club-tournament', 'club-desk', 'club-scorers', 'club-entries', 'club-inbox', 'club-results-dupr', 'club-dupr'];

export function workspaceOf(route: Route): WorkspaceKind | null {
  if (route.name === 'admin' || route.name === 'admin-club' || route.name === 'admin-listings') return 'admin';
  if (route.name === 'club-player-studio' || route.name === 'club-claim') return 'studio';
  if (CLUB_ROUTES.includes(route.name)) return 'club';
  return null;
}

// The club and tournament you're working on, so "Tournament Desk" or "Entries & UPI" open the right one.
const KEY = 'pq-ws';
interface Ctx { clubId?: string; tournamentId?: string }
const readCtx = (): Ctx => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Ctx; } catch { return {}; } };
const writeCtx = (c: Ctx) => { try { sessionStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode */ } };

/** Picks the tournament a club is busiest with: live first, then the next one coming up, then the latest finished. */
export function focusTournament(ts: ClubTournament[], today = new Date().toISOString().slice(0, 10)): ClubTournament | undefined {
  const open = ts.filter((t) => !t.cancelledAt && !t.archivedAt);
  return open.find((t) => t.status === 'live')
    ?? open.filter((t) => t.status === 'draft' && t.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
    ?? [...open].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

function useClubContext(route: Route, on: boolean) {
  const [ctx, setCtx] = useState<Ctx & { club?: string; tournaments?: ClubTournament[]; staff?: boolean }>(readCtx);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const b = backend();
    if (!b) return;
    const id = (route.id ?? '').split('.')[0];
    (async () => {
      let clubId = ctx.clubId, tournamentId = ctx.tournamentId;
      if (route.name === 'club-view' || route.name === 'club-tournament-new') clubId = id;
      if (TOURNAMENT_ROUTES.includes(route.name) && id) {
        tournamentId = id;
        if (!clubId || !ctx.tournaments?.some((t) => t.id === id)) clubId = (await b.tournamentBundle(id).catch(() => null))?.club.id ?? clubId;
      }
      if (!clubId) return;
      const bundle = await b.clubBundle(clubId).catch(() => null);
      if (!bundle || !live) return;
      if (!tournamentId || !bundle.tournaments.some((t) => t.id === tournamentId)) tournamentId = focusTournament(bundle.tournaments)?.id;
      writeCtx({ clubId, tournamentId });
      setCtx({ clubId, tournamentId, club: bundle.club.name, tournaments: bundle.tournaments, staff: isStaff(bundle.role) });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, route.name, route.id]);
  const pick = (tournamentId: string) => { writeCtx({ clubId: ctx.clubId, tournamentId }); setCtx({ ...ctx, tournamentId }); };
  return { ...ctx, pick };
}

const t = (x?: string): [RouteName, string?] | null => (x ? ['club-tournament', x] : null);

function groups(kind: WorkspaceKind, c: { clubId?: string; tournamentId?: string }): { title: string; area: string; groups: Group[] } {
  if (kind === 'admin') return {
    title: 'Platform Admin', area: 'Platform governance', groups: [
      { label: 'Workspace', items: [{ key: 'overview', label: 'Overview', glyph: '◫', to: ['admin', 'overview'] }] },
      { label: 'Governance', items: [
        { key: 'approvals', label: 'Approvals', glyph: '✓', to: ['admin', 'approvals'] },
        { key: 'clubs', label: 'Clubs', glyph: '♧', to: ['admin', 'clubs'] },
        { key: 'tournaments', label: 'Tournaments', glyph: '◈', to: ['admin', 'tournaments'] },
      ] },
      { label: 'Operations', items: [
        { key: 'desk', label: 'Tournament operations', glyph: '▤', to: ['admin', 'desk'] },
        { key: 'results', label: 'Results & DUPR', glyph: '◷', to: ['admin', 'results'] },
      ] },
      { label: 'Admin only', items: [
        { key: 'circuit', label: 'Club Circuit', glyph: '◇', to: ['admin', 'circuit'] },
        { key: 'marketing', label: 'Platform BI', glyph: '▥', to: ['admin', 'marketing'] },
        { key: 'testimonials', label: 'Testimonials', glyph: '❞', to: ['admin', 'testimonials'] },
        { key: 'branding', label: 'Brand & club kits', glyph: '✦', to: ['admin', 'branding'] },
        { key: 'admins', label: 'Permissions', glyph: '⚙', to: ['admin', 'admins'] },
        { key: 'audit', label: 'Audit log', glyph: '☰', to: ['admin', 'audit'] },
      ] },
    ],
  };
  if (kind === 'studio') return {
    title: 'Player Studio', area: 'Your game', groups: [
      { label: 'My game', items: [
        { key: 'home', label: 'Home', glyph: '⌂', to: ['club-player-studio'] },
        { key: 'matches', label: 'Official matches', glyph: '◷', to: ['club-player-studio', 'matches'] },
        { key: 'stats', label: 'Performance', glyph: '▥', to: ['club-player-studio', 'stats'] },
        { key: 'train', label: 'Reflections & training', glyph: '✎', to: ['club-player-studio', 'train'] },
        { key: 'coach', label: 'Coach', glyph: '◎', to: ['club-player-studio', 'coach'] },
      ] },
      { label: 'Compete', items: [
        { key: 'events', label: 'Discover & enter', glyph: '◈', to: ['events'] },
        { key: 'profile', label: 'Player profile', glyph: '♙', to: ['club-player-studio', 'profile'] },
        { key: 'privacy', label: 'Privacy & identity', glyph: '◌', to: ['club-player-studio', 'profile.privacy'] },
      ] },
    ],
  };
  const club = c.clubId;
  return {
    title: 'Club / Organiser', area: 'Club operations', groups: [
      { label: 'Club', items: [{ key: 'overview', label: 'Overview', glyph: '⌂', to: club ? ['club-view', club] : null }] },
      { label: 'Tournaments', items: [
        { key: 'tournaments', label: 'My tournaments', glyph: '◈', to: club ? ['club-view', `${club}.tournaments`] : null },
        { key: 'create', label: 'Create tournament', glyph: '＋', to: club ? ['club-tournament-new', club] : null },
        { key: 'entries', label: 'Entries & UPI', glyph: '♧', to: c.tournamentId ? ['club-inbox', c.tournamentId] : null, hint: 'Pick a tournament first' },
      ] },
      { label: 'Match day', items: [
        { key: 'draws', label: 'Pools & knockouts', glyph: '▦', to: t(c.tournamentId), hint: 'Pick a tournament first' },
        { key: 'desk', label: 'Tournament Desk', glyph: '▤', to: c.tournamentId ? ['club-desk', c.tournamentId] : null, hint: 'Pick a tournament first' },
        { key: 'scoring', label: 'Referee scoring', glyph: '◎', to: c.tournamentId ? ['club-scorers', c.tournamentId] : null, hint: 'Pick a tournament first' },
        { key: 'results', label: 'Results & DUPR', glyph: '◷', to: c.tournamentId ? ['club-results-dupr', c.tournamentId] : null, hint: 'Pick a tournament first' },
      ] },
      { label: 'People', items: [
        { key: 'members', label: 'Members & roles', glyph: '♙', to: club ? ['club-view', `${club}.members`] : null },
        { key: 'profile', label: 'Club profile', glyph: '✦', to: club ? ['club-view', `${club}.profile`] : null },
        { key: 'guide', label: 'Day-of guide', glyph: '?', to: club ? ['club-view', `${club}.guide`] : null },
      ] },
    ],
  };
}

function activeKey(kind: WorkspaceKind, route: Route): string {
  const id = route.id ?? '';
  if (kind === 'admin') return route.name === 'admin-club' ? 'clubs' : route.name === 'admin-listings' ? 'approvals' : (id || 'overview');
  if (kind === 'studio') {
    if (route.name === 'club-claim') return 'home';
    const s = id.split('.')[0] || 'home';
    if (s === 'profile' && id.includes('privacy')) return 'privacy';
    return s === 'log' || s === 'official' ? 'matches' : s === 'practice' ? 'train' : s;
  }
  switch (route.name) {
    case 'club-view': { const s = id.split('.')[1]; return s === 'players' || s === 'squad' ? 'members' : s ?? 'overview'; }
    case 'club-tournament-new': return 'create';
    case 'club-inbox': case 'club-entries': return 'entries';
    case 'club-desk': return 'desk';
    case 'club-scorers': return 'scoring';
    case 'club-results-dupr': case 'club-dupr': return 'results';
    default: return 'draws';
  }
}

/** Side menu (laptops) and scrollable tabs (phones) for one workspace. */
export function WorkspaceNav({ kind, route, go, admin }: { kind: WorkspaceKind; route: Route; go: Go; admin: boolean }) {
  const c = useClubContext(route, kind === 'club');
  const full = groups(kind, c);
  // Plain club members (not organisers) only get the club's tournaments and people, never organiser tools.
  const g = kind === 'club' && c.staff !== true
    ? { ...full, groups: full.groups.map((grp) => ({ ...grp, items: grp.items.filter((i) => ['overview', 'tournaments', 'members'].includes(i.key)) })).filter((grp) => grp.items.length) }
    : full;
  if (kind === 'admin' && !admin) g.groups = [];
  const active = activeKey(kind, route);
  const current = c.tournaments?.find((x) => x.id === c.tournamentId);
  const live = useLiveBadge(current?.isPublic ? current.publicSlug : undefined, kind === 'club');
  const open = (i: Item) => { if (i.to) go(i.to[0], i.to[1]); };
  return (
    <>
      <nav className="pq-ws-side pq-glass" aria-label={`${g.title} menu`}>
        <div className="pq-ws-brand"><span className="pq-ws-tile"><BrandMark size={34} /></span><span><b>PaddleQ</b><small>{CAPTION.toUpperCase()}</small></span></div>
        <div className="pq-ws-area">{g.area.toUpperCase()}</div>
        {kind === 'club' && c.club && <div className="pq-ws-clubname" title={c.club}>{c.club}</div>}
        {g.groups.map((grp) => (
          <div key={grp.label} className="pq-ws-group" role="group" aria-label={grp.label}>
            <div className="pq-ws-glabel">{grp.label.toUpperCase()}</div>
            {kind === 'club' && c.staff !== false && grp.label === 'Match day' && !!c.tournaments?.length && (
              <label className="pq-ws-pick"><span>Tournament</span>
                <select value={c.tournamentId ?? ''} onChange={(e) => { c.pick(e.target.value); go('club-tournament', e.target.value); }} aria-label="Tournament you're working on">
                  {[...c.tournaments].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            {grp.items.map((i) => (
              <button key={i.key} type="button" className="pq-ws-item" aria-current={active === i.key ? 'page' : undefined} disabled={!i.to} aria-label={i.label} title={!i.to ? i.hint : i.label} onClick={() => open(i)}>
                <span className="pq-ws-glyph" aria-hidden="true">{i.glyph}</span><span className="pq-ws-label">{i.label}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="pq-ws-foot" role="group" aria-label="Switch">
          <div className="pq-ws-glabel">Switch club</div>
          {kind !== 'admin' && admin && <button type="button" className="pq-ws-item" aria-label="Platform admin" title="Platform admin" onClick={() => go('admin', 'overview')}><span className="pq-ws-glyph" aria-hidden="true">◫</span><span className="pq-ws-label">Platform admin</span></button>}
          {kind !== 'club' && <button type="button" className="pq-ws-item" aria-label={admin ? 'All clubs' : 'My clubs'} title={admin ? 'All clubs' : 'My clubs'} onClick={() => go('club')}><span className="pq-ws-glyph" aria-hidden="true">♧</span><span className="pq-ws-label">{admin ? 'All clubs' : 'My clubs'}</span></button>}
          {kind !== 'studio' && <button type="button" className="pq-ws-item" aria-label="Player Studio" title="Player Studio" onClick={() => go('club-player-studio')}><span className="pq-ws-glyph" aria-hidden="true">♙</span><span className="pq-ws-label">Player Studio</span></button>}
          <button type="button" className="pq-ws-item" aria-label="Events board" title="Events board" onClick={() => go('events')}><span className="pq-ws-glyph" aria-hidden="true">◈</span><span className="pq-ws-label">Events board</span></button>
        </div>
      </nav>
      <WorkspaceTop showSkin={kind==='admin'} title={kind === 'club' ? c.club ?? 'Club' : g.title} area={kind === 'club' ? current?.name ?? g.area : g.area} workspace={g.title} identityHeading={kind==='club'&&active==='overview'&&c.staff!==false} live={live} go={go} />
      <nav className="pq-ws-tabs" tabIndex={0} onFocusCapture={(e) => { if (e.target !== e.currentTarget) e.target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }} aria-label={`${g.title} sections`}>
        {g.groups.flatMap((grp) => grp.items).map((i) => (
          <button key={i.key} type="button" aria-current={active === i.key ? 'page' : undefined} disabled={!i.to} aria-label={i.label} onClick={() => open(i)}>{i.key==='create'?'New':i.label}</button>
        ))}
      </nav>
    </>
  );
}

/** Laptop top bar: where you are, and your account with Sign out. */
function WorkspaceTop({ title, area, workspace, identityHeading, live, go, showSkin }: { showSkin:boolean; title: string; area: string; workspace: string; identityHeading:boolean; live: { count: number; slug?: string }; go: Go }) {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { let on = true; eventsBackend().currentUser().then((u) => { if (on) setEmail(u?.email ?? null); }, () => undefined); return () => { on = false; }; }, []);
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:599px)').matches);
  const [accountOpen,setAccountOpen]=useState(false);
  useEffect(()=>{const q=window.matchMedia('(max-width:599px)');const change=()=>setCompact(q.matches);q.addEventListener?.('change',change);return()=>q.removeEventListener?.('change',change);},[]);
  const initials = (email ?? 'PQ').replace(/@.*/, '').split(/[._-]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'PQ';
  async function signOut() { await eventsBackend().signOut().catch(() => undefined); go('club', undefined, { replace: true }); }
  return (
    <header className="pq-ws-top pq-glass" aria-label="Where you are">
      <span className="pq-ws-top-tile" aria-hidden="true"><BrandMark size={22} /></span>
      <div className="pq-ws-identity"><span className="pq-ws-product">PaddleQ · {workspace}</span><strong role={identityHeading?"heading":undefined} aria-level={identityHeading?2:undefined}>{title}</strong><span className="pq-ws-crumb">{area}</span></div>
      <details className="pq-account-menu" open={!compact||accountOpen} onToggle={e=>{if(compact)setAccountOpen(e.currentTarget.open);}} onKeyDown={e=>{if(e.key==="Escape")setAccountOpen(false);}}><summary aria-label="Account menu">{initials}</summary><div className="pq-ws-actions">
        {live.count > 0 && <button type="button" className="pq-shell-live" onClick={() => live.slug ? go('results', live.slug) : go('club-results')}><i className="pq-live-dot" aria-hidden="true" /><span><b className="pq-score">{live.count}</b> {live.count === 1 ? 'court live' : 'courts live'}</span></button>}
        <ThemeControls showSkin={showSkin} />
        {email && <button type="button" className="pq-ws-signout" onClick={() => void signOut()}>Sign out</button>}
        <span className="pq-ws-avatar" aria-hidden="true">{initials}</span>
      </div></details>
    </header>
  );
}
