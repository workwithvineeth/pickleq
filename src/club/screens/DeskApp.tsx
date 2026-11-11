import { useMemo, useState } from 'react';
import type { Go, RouteName } from '../../navigation';
import type { ClubBackend } from '../backend';
import { deskBackend, deskLabelOf, openDesk } from '../desk';
import { deskPinKey } from '../pins';
import { ClubLogo } from './Poster';
import { DeskCtx, type DeskSession } from './deskContext';
import { Entries } from './Organiser';
import { RallyDesk } from '../../rallyq/desk/RallyDesk';
import { DeskFrame, Seg } from './DeskFrame';
import { ScoreMatch } from './Score';
import { DivisionBody, type View } from './Tournament';
import { names, useLoad, errorText } from './common';

const readPin = (token: string) => { try { return localStorage.getItem(deskPinKey(token)); } catch { return null; } };
const writePin = (token: string, pin: string | null) => {
  try { if (pin) localStorage.setItem(deskPinKey(token), pin); else localStorage.removeItem(deskPinKey(token)); } catch { /* private mode */ }
};

/**
 * A tournament's desk link: #/desk/<token>, plus ~entries, ~standings or ~score~<match> for the pages inside it.
 * The desk PIN (never the referee PIN) opens this one tournament's desk: courts, scores, walkovers, late entries and withdrawals.
 * No account, no phone numbers, no other tournaments. The PIN is remembered on this phone until "Leave the desk".
 */
export function DeskApp({ id, go }: { id: string; go: Go }) {
  const [token, view = '', matchId = ''] = id.split('~');
  const [pin, setPin] = useState<string | null>(() => readPin(token));
  const [src, setSrc] = useState<ClubBackend | null>(null);
  const [opened, setOpened] = useState<{ tournamentId: string } | null>(null);
  // Check a remembered PIN once (it may have been changed by the organiser).
  const check = useLoad(async () => {
    if (!pin) return null;
    const r = await openDesk(token, pin);
    setSrc(r.src);
    setOpened({ tournamentId: r.bundle.tournament.id });
    return r.bundle.tournament.id;
  }, [token, pin]);
  const leave = () => { writePin(token, null); setPin(null); setSrc(null); setOpened(null); go('desk', token, { replace: true }); };
  const session = useMemo<DeskSession | null>(() => (src && pin ? { b: deskBackend(src, token, pin), token, leave } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [src, pin, token]);

  if (!pin || (check.error && !opened)) {
    return <DeskSignIn token={token} problem={pin ? check.error : null} onOpened={(p, s, tid) => { writePin(token, p); setSrc(s); setOpened({ tournamentId: tid }); setPin(p); }} />;
  }
  if (!session || !opened) return <DeskFrame><h1 className="disp">Desk</h1>{check.error ? <div role="alert" className="warn">{check.error}</div> : <p className="mut" role="status">Opening the desk…</p>}</DeskFrame>;

  const home = () => go('desk', token);
  // The desk screens ask for organiser pages by name; inside a desk link they map to the desk's own pages.
  const deskGo: Go = (name: RouteName, target?: string, opts?) => {
    if (name === 'club-score' && target) return go('desk', `${token}~score~${target}`, opts);
    if (name === 'club-entries') return go('desk', `${token}~entries`, opts);
    if (name === 'club-tournament') return go('desk', `${token}~standings`, opts);
    return home();
  };
  const tid = opened.tournamentId;
  return (
    <DeskCtx.Provider value={session}>
      {view === 'entries' ? <Entries key="entries" id={tid} go={deskGo} onBack={home} />
        : view === 'standings' ? <DeskStandings key="standings" id={tid} onBack={home} />
          : view === 'score' && matchId ? <ScoreMatch key={matchId} matchId={matchId} go={deskGo} onBack={home} />
            : <RallyDesk key="desk" id={tid} go={deskGo} onBack={() => go('events')} />}
    </DeskCtx.Provider>
  );
}

function DeskSignIn({ token, problem, onOpened }: { token: string; problem: string | null; onOpened: (pin: string, src: ClubBackend, tournamentId: string) => void }) {
  const label = useLoad(() => deskLabelOf(token), [token]);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(problem);
  async function open() {
    if (!/^\d{4,6}$/.test(pin)) return setMsg('Type the desk PIN (4 to 6 digits)');
    setBusy(true); setMsg(null);
    try { const r = await openDesk(token, pin); onOpened(pin, r.src, r.bundle.tournament.id); }
    catch (e) { setMsg(errorText(e)); setPin(''); } finally { setBusy(false); }
  }
  const club = label.data?.club;
  return (
    <DeskFrame clubName={club}>
      <div className="pg-h"><span className="cap">Desk sign-in</span><h1 className="disp">{club ? `${club} Desk` : 'Tournament desk'}</h1></div>
      <section className="card" aria-label="Desk sign-in" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
        <div className="row" style={{ gap: 12 }}>
          <ClubLogo src={label.data?.logoUrl} club={club ?? 'Club'} size={48} />
          <div>
            {label.data?.tournament && <b style={{ display: 'block' }}>{label.data.tournament}</b>}
            <span className="mut" style={{ fontSize: 13 }}>{club ? `Run by ${club} on RallyQ` : 'On RallyQ'}</span>
          </div>
        </div>
        {!label.loading && !label.data && <div role="alert" className="warn">This desk link isn’t valid. Ask the organiser for the desk link again.</div>}
        <p className="mut" style={{ margin: 0, fontSize: 14 }}>For the desk team. Type the desk PIN the organiser gave you (not the referee PIN). You’ll get this tournament’s desk: courts, scores, walkovers and late entries. Players’ phone numbers stay private.</p>
        <div className="fld">
          <label htmlFor="desk-pin">Desk PIN</label>
          <input id="desk-pin" className="inp n" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} style={{ fontSize: 24, letterSpacing: '.2em', maxWidth: 240 }}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') void open(); }} />
        </div>
        {msg && <div role="alert" className="warn">{msg}</div>}
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={open}>{busy ? 'Opening…' : 'Open the desk'}</button>
      </section>
    </DeskFrame>
  );
}

/** Pools and knockouts for the desk (the organiser's tournament page without its organiser buttons). */
function DeskStandings({ id, onBack }: { id: string; onBack: () => void }) {
  const [view, setView] = useState<View>('pools');
  const [div, setDiv] = useState<string | null>(null);
  return (
    <DeskCtx.Consumer>
      {(desk) => <StandingsBody b={desk?.b ?? null} id={id} view={view} setView={setView} div={div} setDiv={setDiv} onBack={onBack} />}
    </DeskCtx.Consumer>
  );
}

function StandingsBody({ b, id, view, setView, div, setDiv, onBack }: { b: ClubBackend | null; id: string; view: View; setView: (v: View) => void; div: string | null; setDiv: (v: string) => void; onBack: () => void }) {
  const state = useLoad(async () => { if (!b) throw new Error('Open the desk first'); return b.tournamentBundle(id); }, [b, id]);
  const d = state.data;
  const pmap = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  const head = <div className="between"><div className="pg-h"><span className="cap">{d?.tournament.name ?? 'Desk'}</span><h1 className="disp">Standings and draw</h1></div><button type="button" className="btn ghost sm" onClick={onBack}>Back to the desk</button></div>;
  if (!d) return <DeskFrame>{head}{state.error ? <div role="alert" className="warn">{state.error}</div> : <p className="mut" role="status">Loading…</p>}</DeskFrame>;
  const division = d.divisions.find((x) => x.id === div) ?? d.divisions[0];
  return (
    <DeskFrame clubName={d.club.name}>
      {head}
      {d.divisions.length > 1 && <Seg label="Event" value={division?.id ?? ''} options={d.divisions.map((x) => ({ value: x.id, label: x.name }))} onChange={setDiv} />}
      <Seg label="Tournament view" value={view} options={[{ value: 'schedule', label: 'Schedule' }, { value: 'pools', label: 'Pools' }, { value: 'knockouts', label: 'Knockouts' }]} onChange={setView} />
      {division
        ? <DivisionBody d={d} divisionId={division.id} view={view} label={(e) => (e ? `${names(e.playerIds, pmap)}${e.status === 'withdrawn' ? ' (withdrawn)' : ''}` : 'To be decided')} />
        : <p className="mut" style={{ margin: 0 }}>This tournament has no events yet.</p>}
    </DeskFrame>
  );
}

/** Desk links shared before 31 Oct 2026 (#/helper/<results slug>) no longer open anything. */
export function OldDeskLink({ go }: { go: Go }) {
  return (
    <DeskFrame>
      <h1 className="disp">Tournament desk</h1>
      <section className="card" aria-label="The desk has a new link" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
        <p style={{ margin: 0 }}>The desk now has its own link and its own desk PIN.</p>
        <p className="mut" style={{ margin: 0, fontSize: 14 }}>Ask the organiser to send you the desk link from Referees &amp; results → Desk access → Share desk link, and the desk PIN.</p>
        <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => go('events')}>Go to Events</button>
      </section>
    </DeskFrame>
  );
}
