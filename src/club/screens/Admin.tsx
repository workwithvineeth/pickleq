import { useState } from 'react';
import type { Go } from '../../navigation';
import type { AdminTournament } from '../backend';
import { trend, weekLabel } from '../adminStats';
import { eventsBackend } from '../index';
import { ROLE_LABEL } from '../types';
import { DemoNote, errorText, Header, Status, useLoad } from './common';
import { ListingReviews } from './Events';

export type AdminSection = 'overview' | 'clubs' | 'tournaments' | 'listings' | 'admins' | 'helpers';
const SECTIONS: { id: AdminSection; label: string; title: string }[] = [
  { id: 'overview', label: 'Overview', title: 'Overview' },
  { id: 'clubs', label: 'Clubs', title: 'Clubs' },
  { id: 'tournaments', label: 'Events', title: 'Tournaments' },
  { id: 'listings', label: 'Listings', title: 'Review listings' },
  { id: 'admins', label: 'Admins', title: 'PaddleQ admins' },
  { id: 'helpers', label: 'Helpers', title: 'Desk helpers' },
];
export const isAdminSection = (s: string | undefined): s is AdminSection => SECTIONS.some((x) => x.id === s);

const STATUS: Record<AdminTournament['status'], string> = { draft: 'Not started', live: 'Live', done: 'Finished' };
const day = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

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

/** The PaddleQ admin dashboard: numbers, every club and tournament, listings, admins and helpers. */
export function AdminDashboard({ section, go, onBack }: { section: AdminSection; go: Go; onBack: () => void }) {
  const b = eventsBackend();
  const allowed = useLoad(() => b.isPlatformAdmin(), [b]);
  const current = SECTIONS.find((s) => s.id === section)!;
  return (
    <main className="screen" aria-labelledby="admin-title">
      <Header id="admin-title" title="PaddleQ admin" onBack={onBack} />
      <DemoNote b={b.kind === 'demo' ? b : null} />
      <Status error={allowed.error} loading={allowed.loading && allowed.data === null} />
      {allowed.data === false && <p className="muted">Only PaddleQ admins can see this.</p>}
      {allowed.data && (
        <>
          <div className="seg seg-wrap" role="group" aria-label="Admin sections">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" aria-pressed={s.id === section} onClick={() => go('admin', s.id, { replace: true })}>{s.label}</button>
            ))}
          </div>
          <h2 style={{ fontSize: 20, margin: 0 }}>{current.title}</h2>
          {section === 'overview' && <Overview go={go} />}
          {section === 'clubs' && <Clubs go={go} />}
          {section === 'tournaments' && <Tournaments go={go} />}
          {section === 'listings' && <ListingReviews go={go} />}
          {section === 'admins' && <Admins />}
          {section === 'helpers' && <Helpers />}
        </>
      )}
    </main>
  );
}

function Tile({ label, value, sub, onClick }: { label: string; value: number | string; sub?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="small muted" style={{ display: 'block' }}>{label}</span>
      <span style={{ display: 'block', fontWeight: 600, fontSize: 22 }}>{value}</span>
      {sub && <span className="small muted" style={{ display: 'block' }}>{sub}</span>}
    </>
  );
  return onClick
    ? <button type="button" className="stat-tile" style={{ textAlign: 'left', border: 'none', color: 'inherit' }} aria-label={`${label}: ${value}`} onClick={onClick}>{body}</button>
    : <div className="stat-tile" role="group" aria-label={`${label}: ${value}`}>{body}</div>;
}

function Overview({ go }: { go: Go }) {
  const b = eventsBackend();
  const state = useLoad(() => b.adminOverview(), [b]);
  const d = state.data;
  const max = Math.max(1, ...(d?.weeks.map((w) => w.matches) ?? [0]));
  return (
    <>
      <Status error={state.error} loading={state.loading && !d} />
      {d && (
        <>
          <section className="card section" aria-label="Matches scored this week">
            <div className="small muted">Matches scored this week</div>
            <div style={{ fontWeight: 700, fontSize: 34, lineHeight: 1.1 }}>{d.matchesWeek}</div>
            <div className="small muted">{trend(d.weeks)}</div>
            <ul aria-label="Matches scored per week" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gridTemplateColumns: `repeat(${d.weeks.length}, minmax(0, 1fr))`, gap: 4, alignItems: 'end', height: 96 }}>
              {d.weeks.map((w) => (
                <li key={w.week} aria-label={`Week of ${weekLabel(w.week)}: ${w.matches} matches`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <span aria-hidden="true" style={{ display: 'block', background: 'var(--accent)', borderRadius: 4, height: `${Math.max(2, (w.matches / max) * 80)}px` }} />
                  <span aria-hidden="true" className="small muted" style={{ fontSize: 10, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>{weekLabel(w.week).split(' ')[0]}</span>
                </li>
              ))}
            </ul>
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Tile label="Live now" value={d.live} onClick={() => go('admin', 'tournaments')} />
            <Tile label="Coming up" value={d.upcoming} onClick={() => go('admin', 'tournaments')} />
            <Tile label="Finished" value={d.finished} />
            <Tile label="Listings to review" value={d.toReview} onClick={() => go('admin', 'listings')} />
            <Tile label="Clubs" value={d.clubs} sub={`${d.verifiedClubs} verified`} onClick={() => go('admin', 'clubs')} />
            <Tile label="Entries this week" value={d.entriesWeek} />
            <Tile label="Accounts" value={d.accounts} sub={`${d.accountsWeek} new this week`} />
          </div>
          <p className="small muted" style={{ margin: 0 }}>Weeks start on Monday. The robot’s test club isn’t counted.</p>
        </>
      )}
    </>
  );
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
      <input className="input" type="search" aria-label="Find a club" placeholder="Club, city or owner email" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="check-row small" style={{ borderTop: 'none' }}><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} /> Show the robot’s test club</label>
      <Status error={state.error} loading={state.loading && !state.data} />
      {note}
      {state.data && shown.length === 0 && <p className="small muted" style={{ margin: 0 }}>No clubs match.</p>}
      {shown.map((c) => (
        <section key={c.id} className="card section" aria-label={c.name}>
          <div className="row" style={{ padding: 0 }}>
            <b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.name}</b>
            {c.isTest ? <span className="pill">Robot test</span> : <span className={`pill${c.verified ? ' pill-ok' : ''}`}>{c.verified ? 'Verified' : 'New'}</span>}
          </div>
          <div className="small muted">{[c.city, `${c.members} member${c.members === 1 ? '' : 's'}`, `${c.tournaments} tournament${c.tournaments === 1 ? '' : 's'}`, c.lastEvent && `last ${day(c.lastEvent)}`].filter(Boolean).join(' · ')}</div>
          <div className="small" style={{ overflowWrap: 'anywhere' }}>Owner: {c.owners.join(', ') || '–'}</div>
          <div className="meta">
            <button type="button" className="btn btn-outline" onClick={() => go('admin-club', c.id)}>People and events</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => b.setClubVerified(c.id, !c.verified), c.verified ? `${c.name} is no longer verified` : `${c.name} is verified: its listings go on the board straight away`)}>
              {c.verified ? 'Unverify' : 'Verify'}
            </button>
          </div>
        </section>
      ))}
    </>
  );
}

/** One club, read-only, for support. */
export function AdminClubView({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const b = eventsBackend();
  const state = useLoad(() => b.adminClub(id), [b, id]);
  const c = state.data;
  return (
    <main className="screen" aria-labelledby="admin-club-title">
      <Header id="admin-club-title" title={c?.name ?? 'Club'} onBack={onBack} />
      <Status error={state.error} loading={state.loading && !c} />
      {c && (
        <>
          <div className="small muted">{[c.city, c.isTest ? 'Robot test club' : c.verified ? 'Verified' : 'Not verified yet'].filter(Boolean).join(' · ')}. Read-only: changes are made by the club.</div>
          <section className="card section" aria-label="People">
            <h2 style={{ fontSize: 16 }}>People ({c.people.length})</h2>
            {c.people.map((p, i) => (
              <div key={`${p.name}-${i}`} className="row">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}{p.email && <span className="small muted" style={{ display: 'block' }}>{p.email}</span>}</span>
                <span className="pill">{p.helper ? 'Desk helper' : ROLE_LABEL[p.role]}</span>
              </div>
            ))}
          </section>
          <section className="card section" aria-label="Tournaments">
            <h2 style={{ fontSize: 16 }}>Tournaments ({c.tournaments.length})</h2>
            {c.tournaments.length === 0 && <p className="small muted" style={{ margin: 0 }}>None yet.</p>}
            {c.tournaments.map((t) => (
              <div key={t.id} className="row"><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}<span className="small muted" style={{ display: 'block' }}>{day(t.startDate)}</span></span><span className="pill">{STATUS[t.status]}</span></div>
            ))}
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('admin', 'tournaments')}>Manage in Events</button>
          </section>
        </>
      )}
    </main>
  );
}

function Tournaments({ go }: { go: Go }) {
  const b = eventsBackend();
  const state = useLoad(() => b.adminTournaments(), [b]);
  const { busy, run, note } = useAction(state.reload);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'live' | 'upcoming' | 'done' | 'all'>('all');
  const [tests, setTests] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const shown = (state.data ?? []).filter((t) => (tests || !t.isTest)
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
      {shown.map((t) => {
        const next = t.status === 'done' ? 'live' : 'done';
        return (
          <section key={t.id} className="card section" aria-label={t.name}>
            <div className="row" style={{ padding: 0 }}>
              <b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</b>
              <span className={`pill${t.status === 'live' ? ' pill-warn' : t.status === 'done' ? ' pill-ok' : ''}`}>{STATUS[t.status]}</span>
            </div>
            <div className="small muted">{t.club}{t.isTest ? ' (robot test)' : ''} · {day(t.startDate)}{t.startTime ? ` · ${t.startTime}` : ''}</div>
            <div className="small">{t.registrations} entr{t.registrations === 1 ? 'y' : 'ies'} · {t.matchesDone}/{t.matches} matches scored{t.listing !== 'none' ? ` · board: ${t.listingStatus === 'approved' ? 'listed' : t.listingStatus === 'pending' ? 'to review' : t.listingStatus === 'rejected' ? 'rejected' : 'off'}` : ''}</div>
            <div className="small">Event PIN: <b>{t.eventPin ?? 'not set'}</b>{t.helpers.length ? ` · ${t.helpers.length} desk helper${t.helpers.length === 1 ? '' : 's'}` : ''}</div>
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
                  {t.status !== 'draft' && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirm(t.id)}>{t.status === 'done' ? 'Reopen' : 'Mark finished'}</button>}
                  {t.results && t.slug && <button type="button" className="btn btn-outline" onClick={() => go('results', t.slug)}>Results</button>}
                  {t.listing !== 'none' && t.listingStatus === 'approved' && t.slug && <button type="button" className="btn btn-outline" onClick={() => go('event', t.slug)}>Event page</button>}
                </div>
              )}
          </section>
        );
      })}
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
        <button type="button" className="btn btn-outline" disabled={busy || !email.trim()} onClick={async () => { const e = email.trim(); if (await run(() => b.addPlatformAdmin(e), `${e} is now a PaddleQ admin`)) setEmail(''); }}>Add admin</button>
      </section>
    </>
  );
}

function Helpers() {
  const b = eventsBackend();
  const state = useLoad(() => b.adminTournaments(), [b]);
  const withHelpers = (state.data ?? []).filter((t) => t.helpers.length > 0)
    .sort((x, y) => Number(x.status === 'done') - Number(y.status === 'done') || y.startDate.localeCompare(x.startDate));
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>People who signed in at a tournament’s desk with its helper link and event PIN. They can only help with that tournament.</p>
      <Status error={state.error} loading={state.loading && !state.data} />
      {state.data && withHelpers.length === 0 && <p className="small muted" style={{ margin: 0 }}>No desk helpers yet.</p>}
      {withHelpers.map((t) => (
        <section key={t.id} className="card section" aria-label={`${t.name} helpers`}>
          <div className="row" style={{ padding: 0 }}><b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</b><span className="pill">{STATUS[t.status]}</span></div>
          <div className="small muted">{t.club} · {day(t.startDate)} · Event PIN {t.eventPin ?? 'not set'}</div>
          {t.helpers.map((h, i) => <div key={`${h.name}-${i}`} className="small">• {h.name} <span className="muted">(joined {day(h.addedAt)})</span></div>)}
        </section>
      ))}
    </>
  );
}
