import { useState } from 'react';
import type { ClubBackend, TournamentAccess } from '../backend';
import { pinProblem } from '../pins';
import { appLink, errorText, shareLink, useLoad } from './common';

/** The desk link for a desk token. */
export const deskLink = (token: string) => appLink(`#/desk/${token}`);

type Which = 'referee' | 'desk';

/**
 * The tournament's two ways in, for organisers and RallyQ admins: the referee PIN (court links only) and the desk link + desk PIN
 * (this tournament's desk only, never the referee PIN). Each PIN can be typed or made new.
 */
export function AccessCards({ b, tournamentId, name, finished }: { b: ClubBackend; tournamentId: string; name: string; finished?: boolean }) {
  const [tick, setTick] = useState(0);
  const access = useLoad(() => b.tournamentAccess(tournamentId), [b, tournamentId, tick]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Which | null>(null);
  const [typed, setTyped] = useState('');
  const [confirmLink, setConfirmLink] = useState(false);
  const [shown, setShown] = useState<Record<Which, boolean>>({ referee: false, desk: false });
  const a = access.data;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setEditing(null); setTyped(''); setConfirmLink(false); setTick((x) => x + 1); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  function saveTyped(which: Which) {
    if (!a) return;
    const bad = pinProblem(typed, which === 'desk' ? a.refereePin : a.deskPin, which);
    if (bad) return setMsg({ ok: false, text: bad });
    void run(() => (which === 'desk' ? b.setDeskPin(tournamentId, typed) : b.setEventPin(tournamentId, typed)),
      which === 'desk' ? 'Desk PIN saved. Tell your desk team.' : 'Referee PIN saved on every court link. Tell your referees.');
  }
  const typeBox = (which: Which) => editing === which && (
    <div className="row" style={{ flexWrap: 'wrap', gap: 8, width: '100%' }}>
      <input className="inp" style={{ maxWidth: 200 }} inputMode="numeric" autoComplete="off" maxLength={6} aria-label={which === 'desk' ? 'Your desk PIN' : 'Your referee PIN'}
        placeholder="4 to 6 digits" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter') saveTyped(which); }} />
      <button type="button" className="btn alt sm" disabled={busy} onClick={() => saveTyped(which)}>Save</button>
      <button type="button" className="btn ghost sm" onClick={() => { setEditing(null); setTyped(''); }}>Cancel</button>
    </div>
  );
  const pin = (which: Which, label: string, value?: string) => {
    const open = shown[which];
    return <>
      <span className="grow" style={{ flex: '1 1 220px' }}><span className="cap" style={{ display: 'block' }}>{which === 'referee' ? 'Referee PIN · same for every court' : 'Desk PIN · this tournament’s desk only'}</span>
        {value && (open ? <span className="n" style={{ fontSize: 34, letterSpacing: '.1em' }} aria-label={`${label} ${value}`}>{value}</span> : <span className="n" style={{ fontSize: 34, letterSpacing: '.1em' }} aria-label={`${label} hidden`}>{'•'.repeat(value.length)}</span>)}</span>
      {value && <button type="button" className="tlink" aria-label={`${open ? 'Hide' : 'Show'} ${which} PIN`} onClick={() => setShown((x) => ({ ...x, [which]: !open }))}>{open ? 'Hide' : 'Show'}</button>}
    </>;
  };

  return (
    <>
      {access.error && <div role="alert" className="note">Not loaded: {access.error}</div>}
      {finished && <div className="note">This tournament is finished, so the referee links and the desk link don’t work. Reopen it to use them again.</div>}
      <section className="card" aria-label="Referee PIN" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {pin('referee', 'Referee PIN', a?.refereePin)}
        {editing !== 'referee' && <>
          <button type="button" className="btn ghost sm" disabled={busy || !a} onClick={() => run(() => b.setEventPin(tournamentId), 'New referee PIN on every court link. Tell your referees.')}>New PIN</button>
          <button type="button" className="tlink mut" disabled={busy || !a} onClick={() => { setEditing('referee'); setTyped(''); setMsg(null); }}>Set my own</button>
        </>}
        {typeBox('referee')}
        <p className="mut" style={{ margin: 0, fontSize: 13, flexBasis: '100%' }}>Referees type it on their court link. It opens only that court’s matches, never the desk. Only organisers see the PIN; change it after each event.</p>
      </section>
      <section className="card" aria-label="Desk access" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {pin('desk', 'Desk PIN', a?.deskPin)}
        {editing !== 'desk' && <>
          <button type="button" className="btn ghost sm" disabled={!a} onClick={async () => a && setMsg({ ok: true, text: await shareLink(`${name}: desk`, deskLink(a.deskToken)) })}>Share desk link</button>
          <button type="button" className="btn ghost sm" disabled={busy || !a} onClick={() => run(() => b.setDeskPin(tournamentId), 'New desk PIN. Tell your desk team.')}>New PIN</button>
          <button type="button" className="tlink mut" disabled={busy || !a} onClick={() => { setEditing('desk'); setTyped(''); setMsg(null); }}>Set my own</button>
        </>}
        {typeBox('desk')}
        <p className="mut" style={{ margin: 0, fontSize: 13, flexBasis: '100%' }}>For your desk team only: the desk link and this desk PIN open this tournament’s desk (courts, scores, walkovers, late entries). No players’ phone numbers, no other tournaments, no club settings. It stops when you mark the tournament finished.</p>
        {!confirmLink
          ? <button type="button" className="tlink mut" disabled={busy || !a} onClick={() => setConfirmLink(true)}>Lost the desk phone? Make a new desk link…</button>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexBasis: '100%' }}>
              <p style={{ margin: 0, fontSize: 14 }}>The old desk link stops working at once. Share the new one with your desk team.</p>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn alt sm" disabled={busy} onClick={() => run(() => b.newDeskLink(tournamentId), 'New desk link made. The old one no longer works.')}>Make a new desk link</button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirmLink(false)}>Cancel</button>
              </div>
            </div>
          )}
      </section>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'note' : 'warn'}>{msg.text}</div>}
    </>
  );
}

/** Both PINs in one line with New PIN for each (Next tournament card, Admin → Events). */
export function PinPair({ b, tournamentId, access, onChanged, light }: { b: ClubBackend; tournamentId: string; access: Pick<TournamentAccess, 'refereePin' | 'deskPin'>; onChanged: (a: Pick<TournamentAccess, 'refereePin' | 'deskPin'>) => void; light?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function fresh(which: Which) {
    setBusy(true); setErr(null);
    try {
      if (which === 'desk') onChanged({ ...access, deskPin: await b.setDeskPin(tournamentId) });
      else onChanged({ ...access, refereePin: await b.setEventPin(tournamentId) });
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  const row = (which: Which, label: string, pin: string) => (
    <div className="pq-pin-row">
      <span>{label}</span>
      <b aria-label={`${label} ${pin}`}>{pin}</b>
      <button type="button" className={light ? 'pq-pin-new pq-pin-new-light' : 'pq-pin-new'} disabled={busy} aria-label={`New ${label.toLowerCase()}`} onClick={() => void fresh(which)}>New PIN</button>
    </div>
  );
  return (
    <div className={light ? 'pq-pins pq-pins-light' : 'pq-pins'}>
      {row('referee', 'Referee PIN', access.refereePin)}
      {row('desk', 'Desk PIN', access.deskPin)}
      {err && <div role="alert" className="small">{err}</div>}
    </div>
  );
}
