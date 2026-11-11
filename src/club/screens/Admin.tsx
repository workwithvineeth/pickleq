import { clubMark, PageHead, PublicShell } from '../../rallyq/shell/Shell';
import { Legacy } from './InboxLegacy';
import { AdminOverviewPreview, BrandClubKits, CircuitPreview, MarketingPerformance } from './AdminGrowth';
import { TestimonialsAdmin } from './Testimonials';
import { useState } from 'react';
import type { Go } from '../../navigation';
import type { AdminTournament, ClubBackend } from '../backend';
import { eventsBackend } from '../index';
import { ROLE_LABEL } from '../types';
import { appLink, DemoNote, errorText, shareLink, Status, useLoad } from './common';
import { deskLink, PinPair } from './Access';
import { BigLogo } from './Poster';
import { resultsDuprLink } from './ResultsDupr';
import { ApprovalQueue } from './Approvals';
import { friendlyDate, friendlyDateTime, friendlyTime } from '../dates';
import { SupportOpenButton } from './Lifecycle';
import { AdminCommandCentre } from './AdminHome';

export type AdminSection = 'overview' | 'approvals' | 'clubs' | 'tournaments' | 'results' | 'testimonials' | 'admins' | 'desk' | 'branding' | 'marketing' | 'circuit' | 'audit';
const SECTIONS: { id: AdminSection; label: string; title: string }[] = [
  { id: 'overview', label: 'Overview', title: 'Overview' },
  { id: 'approvals', label: 'Approvals', title: 'Tournament approvals' },
  { id: 'clubs', label: 'Clubs', title: 'Clubs' },
  { id: 'tournaments', label: 'Events', title: 'Tournaments' },
  { id: 'results', label: 'Results & DUPR', title: 'Tournament results & DUPR' },
  { id: 'testimonials', label: 'Testimonials', title: 'Testimonials' },
  { id: 'admins', label: 'Admins', title: 'RallyQ admins' },
  { id: 'branding', label: 'Branding & Club Kits', title: 'Branding & Club Kits' },
  { id: 'marketing', label: 'Marketing Performance', title: 'Marketing Performance' },
  { id: 'circuit', label: 'Club Circuit', title: 'Club Circuit' },
  { id: 'desk', label: 'Desk access', title: 'Desk access' },
  { id: 'audit', label: 'Audit log', title: 'Audit log' },
];
export const isAdminSection = (s: string | undefined): s is AdminSection => SECTIONS.some((x) => x.id === s);
/** Old links to Admin → Listings open Approvals (board listings are approved with the tournament since 2 Nov 2026). */
export const adminSectionOf = (s: string | undefined): AdminSection | undefined => (s === 'listings' ? 'approvals' : isAdminSection(s) ? s : undefined);

const STATUS: Record<AdminTournament['status'], string> = { draft: 'Not started', live: 'Live', done: 'Finished' };
const day = (iso?: string) => friendlyDate(iso);

type Msg = { ok: boolean; text: string } | null;
/** Runs an admin action with a busy flag and a message; reloads on success. */
function useAction(reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); reload(); return true; } catch (e) { setMsg({ ok: false, text: errorText(e) }); return false; } finally { setBusy(false); }
  }
  const note = msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>;
  return { busy, run, note };
}

/** The RallyQ admin dashboard: numbers, every club and tournament, listings, admins and desk access. */
export function AdminDashboard({ section, go, onBack }: { section: AdminSection; go: Go; onBack: () => void }) {
  const b = eventsBackend();
  const allowed = useLoad(() => b.isPlatformAdmin(), [b]);
  const current = SECTIONS.find((s) => s.id === section)!;
  const growthSection = section === 'branding' || section === 'marketing' || section === 'circuit';
  return (
    <PublicShell go={go} host={{ marks: [], cap: 'Platform admin', name: 'RallyQ' }}>
      <PageHead cap="RallyQ admin" title={<span id="admin-title">{section === 'overview' ? 'Founder command centre' : current.title}</span>} actions={<button type="button" className="btn ghost sm" onClick={onBack}>Back</button>} />
      <Legacy cards style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DemoNote b={b.kind === 'demo' ? b : null} />
      <Status error={allowed.error} loading={allowed.loading && allowed.data === null} />
      {allowed.data === false && (
        <>
          <p className="muted">Only RallyQ admins can see this.</p>
          {b.kind === 'server' && <button type="button" className="btn btn-primary" onClick={() => go('admin-login')}>Admin sign-in</button>}
        </>
      )}
      {allowed.data && (
        <>
          <div className="tabs" role="group" aria-label="Admin sections" style={{ flexWrap: 'wrap' }}>
            {SECTIONS.filter((s) => b.kind === 'server' || (s.id !== 'branding' && s.id !== 'marketing' && s.id !== 'circuit')).map((s) => (
              <button key={s.id} type="button" className={s.id === section ? 'tab on' : 'tab'} aria-pressed={s.id === section} onClick={() => go('admin', s.id, { replace: true })}>{s.label}</button>
            ))}
          </div>
          {section === 'overview' && (b.kind === 'server' ? <OverviewMode go={go} /> : <AdminCommandCentre go={go} />)}
          {section === 'overview' && b.kind === 'server' && (
            <section className="card section" aria-label="Demo club">
              <h2 style={{ fontSize: 16 }}>Demo club</h2>
              <p className="small muted" style={{ margin: 0 }}>Made-up players and tournaments on this phone, for showing RallyQ to a club or practising. Nothing is sent to the server.</p>
              <button type="button" className="btn btn-outline" onClick={() => go('demo')}>Open the demo club</button>
            </section>
          )}
          {section === 'clubs' && <Clubs go={go} />}
          {section === 'tournaments' && <Tournaments go={go} />}
          {section === 'results' && <Tournaments go={go} resultsOnly />}
          {section === 'approvals' && <ApprovalQueue b={b} go={go} />}
          {section === 'testimonials' && <TestimonialsAdmin b={b} />}
          {section === 'admins' && <Admins />}
          {section === 'audit' && <AuditLog />}
          {section === 'desk' && <DeskAccessList />}
          {growthSection && b.kind !== 'server' && <p className="muted">Sign in to Platform Admin on the connected app to open this section.</p>}
          {section === 'branding' && b.kind === 'server' && <BrandClubKits go={go} />}
          {section === 'marketing' && b.kind === 'server' && <MarketingPerformance />}
          {section === 'circuit' && b.kind === 'server' && <CircuitPreview />}
        </>
      )}
      </Legacy>
    </PublicShell>
  );
}


function OverviewMode({ go }: { go: Go }) {
  const [sample, setSample] = useState(false);
  return <>
    <div className="seg seg-wrap" role="group" aria-label="Overview data mode">
      <button type="button" aria-pressed={!sample} onClick={() => setSample(false)}>Real Data</button>
      <button type="button" aria-pressed={sample} onClick={() => setSample(true)}>Demo Preview</button>
    </div>
    {sample ? <AdminOverviewPreview /> : <AdminCommandCentre go={go} />}
  </>;
}


function Clubs({ go }: { go: Go }) {
  const b = eventsBackend();
  const state = useLoad(() => b.adminClubs(), [b]);
  const { busy, run, note } = useAction(state.reload);
  const [q, setQ] = useState('');
  const [tests, setTests] = useState(false);
  const shown = (state.data ?? []).filter((c) => (tests || !c.isTest) && `${c.name} ${c.city ?? ''} ${c.owners.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>Trusted clubs’ tournaments skip approval. You can switch trust off at any time; tournaments already approved stay approved.</p>
      <input className="input" type="search" aria-label="Find a club" placeholder="Club, city or owner email" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="check-row small" style={{ borderTop: 'none' }}><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} /> Show the robot’s test club</label>
      <Status error={state.error} loading={state.loading && !state.data} />
      {note}
      {state.data && shown.length === 0 && <p className="small muted" style={{ margin: 0 }}>No clubs match.</p>}
      <div className="pq-admin-list">{shown.map((c) => (
        <section key={c.id} className="card section" aria-label={c.name}>
          <div className="row" style={{ padding: 0, justifyContent: 'flex-start', gap: 12 }}>
            <BigLogo src={c.logoUrl} club={c.name} size={56} />
            <b style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: 17 }}>{c.name}</b>
            {c.isTest ? <span className="pill">Robot test</span>
              : <span className={`pill${c.trusted ? ' pill-ok' : ''}`}>{c.trusted ? 'Trusted' : 'Needs approval'}</span>}
          </div>
          <div className="small muted">{[c.city, `${c.members} member${c.members === 1 ? '' : 's'}`, `${c.tournaments} tournament${c.tournaments === 1 ? '' : 's'}`, c.lastEvent && `last ${day(c.lastEvent)}`].filter(Boolean).join(' · ')}</div>
          <div className="small" style={{ overflowWrap: 'anywhere' }}>Owner: {c.owners.join(', ') || '–'}</div>
          <div className="meta">
            <button type="button" className="btn btn-outline" onClick={() => go('admin-club', c.id)}>People and events</button>
            {!c.isTest && (
              <button type="button" className="btn btn-outline" role="switch" aria-checked={c.trusted} aria-label={`Trusted club: ${c.name}`} disabled={busy}
                onClick={() => run(() => b.setClubTrusted(c.id, !c.trusted), c.trusted ? `${c.name} is no longer trusted: new tournaments need your approval` : `${c.name} is trusted: its tournaments skip approval`)}>
                {c.trusted ? 'Trusted: on' : 'Trusted: off'}
              </button>
            )}
          </div>
        </section>
      ))}</div>
    </>
  );
}


/** One club, read-only, for support. */
export function AdminClubView({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const b = eventsBackend();
  const state = useLoad(() => b.adminClub(id), [b, id]);
  const c = state.data;
  return (
    <PublicShell go={go} host={c ? { marks: [clubMark(c.name)], cap: 'Club', name: c.name } : { marks: [], cap: 'Platform admin', name: 'RallyQ' }}>
      <PageHead cap="RallyQ admin · club" title={<span id="admin-club-title">{c?.name ?? 'Club'}</span>} actions={<button type="button" className="btn ghost sm" onClick={onBack}>Back</button>} />
      <Legacy cards style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Status error={state.error} loading={state.loading && !c} />
      {c && (
        <>
          <section className="pq-clubhero" aria-label={`${c.name} club`}>
            <BigLogo src={c.logoUrl} club={c.name} />
            <div className="pq-clubhero-name">{c.name}</div>
            <div className="pq-club-meta" style={{ justifyContent: 'center' }}>{[c.city, c.isTest ? 'Robot test club' : c.verified ? 'Verified' : 'Not verified yet'].filter(Boolean).join(' · ')}</div>
          </section>
          <div className="meta">
            <button type="button" className="btn btn-primary" onClick={() => go('club-tournament-new', c.id)}>+ Create Tournament</button>
            <SupportOpenButton b={b} clubId={c.id} reason={`Admin club page: ${c.name}`} go={go} label="Open club as support" />
          </div>
          <section className="card section" aria-label="People">
            <h2 style={{ fontSize: 16 }}>People ({c.people.length})</h2>
            {c.people.map((p, i) => (
              <div key={`${p.name}-${i}`} className="row">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}{p.email && <span className="small muted" style={{ display: 'block' }}>{p.email}</span>}</span>
                <span className="pill">{p.helper ? 'Old desk account (no access)' : ROLE_LABEL[p.role]}</span>
              </div>
            ))}
          </section>
          <section className="card section" aria-label="Tournaments">
            <h2 style={{ fontSize: 16 }}>Tournaments ({c.tournaments.length})</h2>
            {c.tournaments.length === 0 && <p className="small muted" style={{ margin: 0 }}>None yet.</p>}
            {c.tournaments.map((t) => (
              <div key={t.id} className="row pq-admin-trow">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere', flex: 1 }}>{t.name}<span className="small muted" style={{ display: 'block' }}>{day(t.startDate)} · {STATUS[t.status]}</span></span>
                <SupportOpenButton b={b} clubId={c.id} tournamentId={t.id} reason={`Admin club page: ${t.name}`} go={go} label="Open" primary />
              </div>
            ))}
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('admin', 'tournaments')}>Manage in Events</button>
          </section>
        </>
      )}
      </Legacy>
    </PublicShell>
  );
}

function Tournaments({ go, resultsOnly = false }: { go: Go; resultsOnly?: boolean }) {
  const b = eventsBackend();
  const state = useLoad(() => b.adminTournaments(), [b]);
  const { busy, run, note } = useAction(state.reload);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'live' | 'upcoming' | 'done' | 'all'>('all');
  const [tests, setTests] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const shown = (state.data ?? []).filter((t) => (tests || !t.isTest)
    && (!resultsOnly || t.matchesDone > 0 || t.status === 'done')
    && (show === 'all' || (show === 'live' && t.status === 'live') || (show === 'done' && t.status === 'done') || (show === 'upcoming' && t.status !== 'done' && t.startDate > today))
    && `${t.name} ${t.club}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <input className="input" type="search" aria-label="Find a tournament" placeholder="Tournament or club" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="seg" role="group" aria-label="Show">
        {([['all', 'All'], ['live', 'Live'], ['upcoming', 'Coming'], ['done', 'Finished']] as const).map(([v, l]) => (
          <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)}>{l}</button>
        ))}
      </div>
      <label className="check-row small" style={{ borderTop: 'none' }}><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} /> Show the robot’s test club</label>
      <Status error={state.error} loading={state.loading && !state.data} />
      {note}
      {state.data && shown.length === 0 && <p className="small muted" style={{ margin: 0 }}>No tournaments match.</p>}
      <div className="pq-admin-list">{shown.map((t) => {
        const next = t.status === 'done' ? 'live' : 'done';
        return (
          <section key={t.id} className="card section" aria-label={t.name}>
            <div className="row" style={{ padding: 0 }}>
              <b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</b>
              <span className={`pill${t.status === 'live' ? ' pill-warn' : t.status === 'done' ? ' pill-ok' : ''}`}>{STATUS[t.status]}</span>
            </div>
            <div className="small muted">{t.club}{t.isTest ? ' (robot test)' : ''} · {day(t.startDate)}{t.startTime ? ` · ${friendlyTime(t.startTime)}` : ''}</div>
            <div className="small">{t.registrations} entr{t.registrations === 1 ? 'y' : 'ies'} · {t.matchesDone}/{t.matches} matches scored{t.listing !== 'none' ? ` · board: ${t.listingStatus === 'approved' ? 'listed' : t.listingStatus === 'pending' ? 'to review' : t.listingStatus === 'rejected' ? 'rejected' : 'off'}` : ''}</div>
            {t.status !== 'done' && <AdminPins b={b} t={t} />}
            {confirm === t.id
              ? (
                <div className="meta">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => b.adminSetTournamentStatus(t.id, next), next === 'live' ? `${t.name} is live again` : `${t.name} is finished`)) setConfirm(null); }}>
                    {next === 'live' ? 'Yes, reopen it' : 'Yes, mark it finished'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
                </div>
              )
              : (
                <div className="meta">
                  <SupportOpenButton b={b} clubId={t.clubId} tournamentId={t.id} reason={`Admin events: ${t.name}`} go={go} label="Manage tournament" primary />
                  {t.status !== 'draft' && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirm(t.id)}>{t.status === 'done' ? 'Reopen' : 'Mark finished'}</button>}
                  {t.status !== 'done' && t.deskToken && <button type="button" className="btn btn-outline" onClick={() => run(() => shareLink(`${t.name}: desk`, deskLink(t.deskToken as string)), 'Desk link shared or copied: send it to the desk team (with the desk PIN)')}>Share desk link</button>}
                  {t.results && t.slug && <button type="button" className="btn btn-outline" onClick={() => go('results', t.slug)}>Results</button>}
                  <button type="button" className="btn btn-outline" onClick={() => go('club-results-dupr', t.id)}>View Results &amp; DUPR</button>
                  <button type="button" className="btn btn-primary" onClick={() => go('club-results-dupr', t.id)}>Add / edit DUPR</button>
                  <button type="button" className="btn btn-outline" onClick={() => run(() => shareLink(`${t.name}: results and DUPR details`, resultsDuprLink(t.id)), 'Organiser results link shared or copied. The organiser must sign in with access to this club.')}>Share Results with Organiser</button>
                  {t.results && t.slug && <button type="button" className="btn btn-outline" onClick={() => run(() => shareLink(`${t.name}: schedule, scores and results`, appLink(`#/results/${t.slug}`)), 'Public results link shared or copied: send it to the players')}>Share public results</button>}
                  {t.listing !== 'none' && t.listingStatus === 'approved' && t.slug && <button type="button" className="btn btn-outline" onClick={() => go('event', t.slug)}>Event page</button>}
                </div>
              )}
          </section>
        );
      })}</div>
    </>
  );
}

function Admins() {
  const b = eventsBackend();
  const state = useLoad(() => b.platformAdmins(), [b]);
  const { busy, run, note } = useAction(state.reload);
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>Admins see every club and tournament, review listings, and can reopen a finished tournament. There’s always at least one admin.</p>
      <Status error={state.error} loading={state.loading && !state.data} />
      {note}
      {state.data && (
        <section className="card section" aria-label="Admins">
          {state.data.map((a) => (
            <div key={a.email} className="row" style={{ flexWrap: 'wrap' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{a.email}<span className="small muted" style={{ display: 'block' }}>Since {day(a.addedAt)}</span></span>
              {confirm === a.email
                ? (
                  <span className="meta" style={{ marginTop: 0 }}>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => b.removePlatformAdmin(a.email), `${a.email} is no longer an admin`)) setConfirm(null); }}>Yes, remove</button>
                    <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
                  </span>
                )
                : <button type="button" className="btn btn-outline" aria-label={`Remove ${a.email}`} disabled={busy} onClick={() => setConfirm(a.email)}>Remove</button>}
            </div>
          ))}
        </section>
      )}
      <section className="card section" aria-label="Add an admin">
        <input className="input" type="email" aria-label="New admin’s email" placeholder="Their email (they must have signed in once)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className="btn btn-outline" disabled={busy || !email.trim()} onClick={async () => { const e = email.trim(); if (await run(() => b.addPlatformAdmin(e), `${e} is now a RallyQ admin`)) setEmail(''); }}>Add admin</button>
      </section>
    </>
  );
}

/** Both PINs of a tournament, each with New PIN (RallyQ admins can change them for support). */
function AdminPins({ b, t }: { b: ClubBackend; t: AdminTournament }) {
  const [pins, setPins] = useState({ refereePin: t.eventPin ?? '', deskPin: t.deskPin ?? '' });
  if (!pins.refereePin || !pins.deskPin) return <div className="small muted">PINs are made when the tournament is opened.</div>;
  return <PinPair b={b} tournamentId={t.id} access={pins} onChanged={setPins} />;
}

/** Desk access across tournaments that aren't finished: the desk PIN and when the desk link was last used. */
function DeskAccessList() {
  const b = eventsBackend();
  const state = useLoad(() => b.adminTournaments(), [b]);
  const [msg, setMsg] = useState<string | null>(null);
  const open = (state.data ?? []).filter((t) => t.status !== 'done' && !t.isTest)
    .sort((x, y) => Number(x.status !== 'live') - Number(y.status !== 'live') || x.startDate.localeCompare(y.startDate));
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>Each tournament’s desk has its own link and desk PIN (never the referee PIN). It opens only that tournament’s desk, never players’ phone numbers, and stops when the tournament is finished.</p>
      <Status error={state.error} loading={state.loading && !state.data} />
      {msg && <div role="status" className="msg msg-ok">{msg}</div>}
      {state.data && open.length === 0 && <p className="small muted" style={{ margin: 0 }}>No tournaments coming up.</p>}
      {open.map((t) => (
        <section key={t.id} className="card section" aria-label={`${t.name} desk access`}>
          <div className="row" style={{ padding: 0 }}><b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</b><span className={`pill${t.status === 'live' ? ' pill-warn' : ''}`}>{STATUS[t.status]}</span></div>
          <div className="small muted">{t.club} · {day(t.startDate)} · desk link {t.deskUsedAt ? `last used ${friendlyDateTime(t.deskUsedAt)}` : 'not used yet'}</div>
          <AdminPins b={b} t={t} />
          {t.deskToken && <button type="button" className="btn btn-outline" onClick={async () => setMsg(await shareLink(`${t.name}: desk`, deskLink(t.deskToken as string)))}>Share desk link</button>}
        </section>
      ))}
    </>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  support_start: 'Started a support session', support_end: 'Ended a support session', support_open_member: 'Opened a club they belong to',
  tournament_delete: 'Deleted a tournament', tournament_cancel: 'Cancelled a tournament', tournament_archive: 'Archived a tournament', tournament_unarchive: 'Brought a tournament back',
};
/** Every support session and lifecycle action, newest first (RallyQ admins only; server: platform_audit). */
function AuditLog() {
  const b = eventsBackend();
  const state = useLoad(() => b.platformAudit(), [b]);
  return (
    <section className="section" aria-label="Audit log">
      <p className="small muted" style={{ margin: 0 }}>Support sessions (with the reason given) and every delete, cancel and archive. Kept for good.</p>
      <Status error={state.error} loading={state.loading && !state.data} />
      {state.data?.length === 0 && <p className="small muted">Nothing yet.</p>}
      {state.data && state.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table" aria-label="Privileged actions">
            <thead><tr><th>When</th><th>What</th><th>Details</th></tr></thead>
            <tbody>{state.data.map((r, i) => <tr key={i}><td className="small">{friendlyDateTime(r.at)}</td><td><b>{AUDIT_LABEL[r.action] ?? r.action}</b></td><td className="small muted">{r.detail}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
