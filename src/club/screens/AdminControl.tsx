import { useState } from 'react';
import type { AdminMember } from '../backend';
import { eventsBackend } from '../index';
import { ROLE_LABEL, type Role } from '../types';
import { errorText, Status, useLoad } from './common';

const ROLES: Role[] = ['owner', 'admin', 'coach', 'player'];

/** Delete for good: type the exact name to switch the button on. Used for clubs and tournaments (RallyQ admins only). */
export function DeleteForGood({ kind, name, note, onDelete, onDone }: { kind: 'club' | 'tournament'; name: string; note?: string; onDelete: () => Promise<void>; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return <button type="button" className="btn btn-outline pq-danger" onClick={() => setOpen(true)} aria-label={`Delete ${kind}: ${name}`}>Delete {kind}</button>;
  const match = text.trim() === name.trim();
  async function go() {
    setBusy(true); setErr('');
    try { await onDelete(); onDone(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  }
  return (
    <div className="card section pq-danger-box" role="group" aria-label={`Delete ${kind} ${name}`}>
      <b>Delete “{name}” for good?</b>
      <p className="small" style={{ margin: 0 }}>{note ?? `This removes the ${kind} and everything in it. It can’t be undone.`} The deletion is written to the audit log.</p>
      <label>Type the {kind} name to confirm
        <input className="input" style={{ fontSize: 16 }} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="off" placeholder={name} />
      </label>
      {err && <div role="alert" className="msg msg-bad">{err}</div>}
      <div className="meta">
        <button type="button" className="btn btn-primary pq-danger-solid" disabled={busy || !match} onClick={() => void go()}>{busy ? 'Deleting…' : `Yes, delete this ${kind}`}</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setOpen(false); setText(''); setErr(''); }}>Keep it</button>
      </div>
    </div>
  );
}

/** A club's people with their roles: change a role, remove someone, or add by email. RallyQ admins only; every change is audited. */
export function AdminPeople({ clubId }: { clubId: string }) {
  const b = eventsBackend();
  const state = useLoad(() => b.adminClubMembers(clubId), [b, clubId]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('admin');
  async function run(fn: () => Promise<unknown>, ok: string | (() => string)) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: typeof ok === 'string' ? ok : ok() }); state.reload(); return true; } catch (e) { setMsg({ ok: false, text: errorText(e) }); return false; } finally { setBusy(false); }
  }
  const who = (m: AdminMember) => m.name || m.email || 'Someone';
  return (
    <section className="card section" aria-label="Roles">
      <h2 style={{ fontSize: 16 }}>Roles</h2>
      <p className="small muted" style={{ margin: 0 }}>Change what each person can do in this club. A club always keeps at least one owner.</p>
      <Status error={state.error} loading={state.loading && !state.data} />
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {(state.data ?? []).map((m) => (
        <div key={m.userId} className="row pq-admin-trow" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere', flex: '1 1 160px' }}>{who(m)}{m.email && m.name && <span className="small muted" style={{ display: 'block' }}>{m.email}</span>}</span>
          {m.helper ? <span className="pill">Old desk account (no access)</span> : (
            <>
              <select className="input" style={{ fontSize: 16, minHeight: 44, width: 'auto' }} aria-label={`Role for ${who(m)}`} value={m.role} disabled={busy}
                onChange={(e) => { const next = e.target.value as Role; void run(() => b.adminSetMemberRole(clubId, m.userId, next), `${who(m)} is now ${ROLE_LABEL[next]}`); }}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} disabled={busy} aria-label={`Remove ${who(m)}`}
                onClick={() => void run(() => b.adminRemoveClubMember(clubId, m.userId), `${who(m)} was removed`)}>Remove</button>
            </>
          )}
        </div>
      ))}
      <form className="stack" style={{ gap: 8 }} aria-label="Add a person" onSubmit={(e) => {
        e.preventDefault();
        const em = email.trim(); const asRole = role; let outcome = '';
        void run(async () => { outcome = await b.adminAddClubMember(clubId, em, asRole); setEmail(''); },
          () => outcome === 'invited' ? `${em} has no account yet: ${ROLE_LABEL[asRole]} is waiting for their sign-up` : `${em} was added as ${ROLE_LABEL[asRole]}`);
      }}>
        <label>Add by email
          <input className="input" style={{ fontSize: 16 }} type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <label>Role
          <select className="input" style={{ fontSize: 16, minHeight: 44 }} aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy || !email.trim()}>Add person</button>
        <span className="small muted">If they have no account yet, the role waits for them and applies when they sign up.</span>
      </form>
    </section>
  );
}
