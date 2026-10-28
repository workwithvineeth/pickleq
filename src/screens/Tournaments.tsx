import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Chips, Field, Segmented } from '../components/Controls';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { shortDate } from '../components/MatchRow';
import { db, newId } from '../db/db';
import { activeMatches } from '../db/matches';
import { activeTournaments, addTournament, changeEvent, changeTournament, trashTournament } from '../db/tournaments';
import { formatLabel, scoreLine } from '../domain/scoring';
import {
  checkOtherResult, checkTournament, encodeLink, eventMatches, fmtSlotTime, KO_ROUNDS, ME, nextSlot, PLACEMENTS, placementLabel, slotLabel, standings,
  tournamentSummary, when, whenLabel, type KoRound, type Stage, type Structure, type Tournament, type TournamentEvent,
} from '../domain/tournaments';
import { DEFAULT_FORMAT, type BestOf, type Format, type Match, type MatchType, type PointsTo } from '../domain/types';
import type { Go } from '../navigation';

export const isoToday = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
export const dateRange = (t: Pick<Tournament, 'startDate' | 'endDate'>) => t.startDate === t.endDate ? shortDate(t.startDate) : `${shortDate(t.startDate)} – ${shortDate(t.endDate)}`;
const typeOptions: { value: MatchType; label: string }[] = [{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }, { value: 'mixed', label: 'Mixed' }];
const structureOptions: { value: Structure; label: string }[] = [{ value: 'round-robin', label: 'Round robin' }, { value: 'pools-knockout', label: 'Pools, then knockout' }];
const structureLabel = (s: Structure) => structureOptions.find((o) => o.value === s)!.label;
const typeLabel = (t: MatchType) => typeOptions.find((o) => o.value === t)!.label;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Back({ onBack }: { onBack: () => void }) {
  return <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>;
}

// ---------------- list ----------------
export function TournamentList({ go, onBack }: { go: Go; onBack: () => void }) {
  const list = useLiveQuery(() => activeTournaments(), []);
  const today = isoToday();
  const upcoming = (list ?? []).filter((t) => when(t, today).kind !== 'past').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = (list ?? []).filter((t) => when(t, today).kind === 'past');
  const row = (t: Tournament) => {
    const placements = t.events.map((e) => placementLabel(e.placement)).filter(Boolean);
    return (
      <button key={t.id} type="button" className="match-row" onClick={() => go('tournament', t.id)}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 500 }}>{t.name}</span>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{whenLabel(when(t, today))}</span>
          </span>
          <span className="small muted" style={{ display: 'block' }}>{dateRange(t)}{t.venue ? ` · ${t.venue}` : ''} · {t.events.length} {t.events.length === 1 ? 'event' : 'events'}</span>
          {placements.length > 0 && <span className="meta">{placements.map((p, i) => <span key={i} className="pill pill-ok">{p}</span>)}</span>}
        </span>
      </button>
    );
  };
  return (
    <main className="screen" aria-labelledby="tl-title">
      <header className="header">
        <Back onBack={onBack} />
        <h1 id="tl-title" className="screen-title" style={{ flex: 1 }}>Tournaments</h1>
        <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} onClick={() => go('tournament-new')}>New</button>
      </header>
      {list && list.length === 0 && (
        <EmptyState icon="stats" title="Plan your first tournament" action={<button type="button" className="btn btn-primary" onClick={() => go('tournament-new')}>Add a tournament</button>}>
          Add the events you’re playing, your schedule and checklist. Matches you log there build your pool table and summary.
        </EmptyState>
      )}
      {upcoming.length > 0 && <section className="section" aria-label="Upcoming"><h2 style={{ fontSize: 18 }}>Upcoming</h2>{upcoming.map(row)}</section>}
      {past.length > 0 && <section className="section" aria-label="Past"><h2 style={{ fontSize: 18 }}>Past</h2>{past.map(row)}</section>}
    </main>
  );
}

// ---------------- create / edit ----------------
interface EventDraft { id?: string; name: string; type: MatchType; structure: Structure; partnerName: string; format: Format }
const blankEvent = (): EventDraft => ({ name: '', type: 'doubles', structure: 'pools-knockout', partnerName: '', format: { ...DEFAULT_FORMAT } });

export function TournamentForm({ id, go, onClose }: { id?: string; go: Go; onClose: () => void }) {
  const existing = useLiveQuery(async () => (id ? (await db.tournaments.get(id)) ?? null : null), [id]);
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [venue, setVenue] = useState('');
  const [events, setEvents] = useState<EventDraft[]>([blankEvent()]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !existing || loaded) return;
    setName(existing.name); setStart(existing.startDate); setEnd(existing.endDate); setVenue(existing.venue ?? '');
    setEvents(existing.events.map((e) => ({ id: e.id, name: e.name, type: e.type, structure: e.structure, partnerName: e.partnerName ?? '', format: e.format })));
    setLoaded(true);
  }, [id, existing, loaded]);

  const setEv = (i: number, patch: Partial<EventDraft>) => { setError(null); setEvents((all) => all.map((e, j) => (j === i ? { ...e, ...patch } : e))); };

  async function removeEvent(i: number) {
    const e = events[i];
    if (e.id && id) {
      const linked = eventMatches(await activeMatches(), { id }, e.id);
      if (linked.length) return setError(`${e.name || 'This event'} has ${linked.length} logged ${linked.length === 1 ? 'match' : 'matches'}. Delete those matches first.`);
    }
    setEvents((all) => all.filter((_, j) => j !== i));
  }

  async function save() {
    const err = checkTournament({ name, startDate: start, endDate: end, events });
    if (err) return setError(err);
    const clean = (e: EventDraft) => ({ name: e.name.trim(), type: e.type, structure: e.structure, format: e.format, partnerName: e.type === 'singles' ? undefined : e.partnerName.trim() || undefined });
    if (!id) {
      const t = await addTournament({ name, startDate: start, endDate: end, venue, events: events.map(clean) });
      go('tournament', t.id, { replace: true });
      return;
    }
    await changeTournament(id, (t) => {
      t.name = name.trim(); t.startDate = start; t.endDate = end; t.venue = venue.trim() || undefined;
      t.events = events.map((d) => {
        const old = d.id ? t.events.find((e) => e.id === d.id) : undefined;
        return old ? { ...old, ...clean(d) } : { ...clean(d), id: newId(), teams: [], otherResults: [], schedule: [] };
      });
    });
    onClose();
  }

  if (id && existing === null) return <main className="screen"><p>Tournament not found.</p></main>;
  if (!loaded) return <main className="screen"><p className="muted">Loading…</p></main>;

  return (
    <main className="screen" aria-labelledby="tf-title">
      <header className="header">
        <h1 id="tf-title" className="screen-title">{id ? 'Edit tournament' : 'New tournament'}</h1>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
      </header>
      <Field label="Name"><input className="input" aria-label="Tournament name" placeholder="Bengaluru Open" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} /></Field>
      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
        <Field label="Starts"><input className="input" type="date" aria-label="Start date" value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); setError(null); }} /></Field>
        <Field label="Ends"><input className="input" type="date" aria-label="End date" value={end} min={start || undefined} onChange={(e) => { setEnd(e.target.value); setError(null); }} /></Field>
      </div>
      <Field label="Venue (optional)"><input className="input" aria-label="Venue" placeholder="Padukone Sports Centre" value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>

      <h2 style={{ fontSize: 18 }}>Events you’re playing</h2>
      {events.map((e, i) => (
        <section key={e.id ?? `new-${i}`} className="card section" aria-label={`Event ${i + 1}`}>
          <div className="header">
            <span className="label">Event {i + 1}</span>
            {events.length > 1 && <button type="button" className="link-btn" onClick={() => removeEvent(i)}>Remove event</button>}
          </div>
          <input className="input" aria-label={`Event ${i + 1} name`} placeholder="Men’s doubles 4.0" value={e.name} onChange={(x) => setEv(i, { name: x.target.value })} />
          <Segmented label={`Event ${i + 1} type`} value={e.type} options={typeOptions} onChange={(type) => setEv(i, { type })} />
          {e.type !== 'singles' && <input className="input" aria-label={`Event ${i + 1} partner`} placeholder="Partner’s name (optional)" value={e.partnerName} onChange={(x) => setEv(i, { partnerName: x.target.value })} />}
          <Chips label={`Event ${i + 1} structure`} value={e.structure} options={structureOptions} onChange={(structure) => setEv(i, { structure })} />
          <Chips small label={`Event ${i + 1} points`} value={e.format.pointsTo} options={[11, 15, 21].map((v) => ({ value: v as PointsTo, label: `To ${v}` }))} onChange={(v) => setEv(i, { format: { ...e.format, pointsTo: v } })} />
          <Chips small label={`Event ${i + 1} games`} value={e.format.bestOf} options={[{ value: 1 as BestOf, label: '1 game' }, { value: 3 as BestOf, label: 'Best of 3' }]} onChange={(v) => setEv(i, { format: { ...e.format, bestOf: v } })} />
          <Chips small label={`Event ${i + 1} scoring`} value={e.format.scoring} options={[{ value: 'sideout' as const, label: 'Side-out' }, { value: 'rally' as const, label: 'Rally' }]} onChange={(v) => setEv(i, { format: { ...e.format, scoring: v } })} />
          <span className="small muted">Knockout matches often use a different format. You can change it when you log each match.</span>
        </section>
      ))}
      <button type="button" className="btn btn-outline" onClick={() => setEvents((all) => [...all, blankEvent()])}>Add another event</button>
      {error && <div role="status" className="msg msg-bad">{error}</div>}
      <button type="button" className="btn btn-primary" onClick={save}>{id ? 'Save changes' : 'Save tournament'}</button>
    </main>
  );
}

// ---------------- view ----------------
export function TournamentView({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const t = useLiveQuery(async () => (await db.tournaments.get(id)) ?? null, [id]);
  const matches = useLiveQuery(() => activeMatches(), []) ?? [];
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (t === undefined) return <main className="screen"><p className="muted">Loading…</p></main>;
  if (t === null || t.deletedAt !== undefined) return <main className="screen"><header className="header"><Back onBack={onBack} /></header><p>This tournament isn’t here. It may be in the Trash.</p></main>;

  const today = isoToday();
  const w = when(t, today);
  const mine = eventMatches(matches, t);
  const next = nextSlot(t, matches);
  const sum = tournamentSummary(t, matches);

  return (
    <main className="screen" aria-labelledby="tv-title">
      <header className="header">
        <Back onBack={onBack} />
        <h1 id="tv-title" className="screen-title" style={{ flex: 1, fontSize: 24 }}>{t.name}</h1>
        <button type="button" className="link-btn" onClick={() => go('tournament-edit', t.id)}>Edit</button>
      </header>
      <div className="meta" style={{ marginTop: -6 }}>
        <span className={`pill ${w.kind === 'past' ? '' : 'pill-warn'}`}>{whenLabel(w)}</span>
        <span className="pill">{dateRange(t)}</span>
        {t.venue && <span className="pill">{t.venue}</span>}
      </div>

      {next && w.kind !== 'past' && (
        <section className="card section" aria-label="Next match" style={{ gap: 6 }}>
          <span className="small muted">Next on your schedule</span>
          <span style={{ fontWeight: 500 }}>{fmtSlotTime(next.slot.at)} · {slotLabel(next.slot, next.event)}</span>
          <span className="small muted">{next.event.name}</span>
          <button type="button" className="btn btn-primary" onClick={() => go('log', encodeLink({ tournamentId: t.id, eventId: next.event.id, stage: next.slot.stage, round: next.slot.round, teamId: next.slot.teamId, slotId: next.slot.id }))}>Log this result</button>
        </section>
      )}

      <Checklist t={t} collapsed={w.kind === 'past'} />

      {t.events.map((ev) => <EventCard key={ev.id} t={t} ev={ev} past={w.kind === 'past'} matches={eventMatches(matches, t, ev.id)} go={go} />)}

      {mine.length > 0 && (
        <section className="card section" aria-label="Tournament summary">
          <h2 style={{ fontSize: 18 }}>Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            <div className="stat-tile"><div className="small muted">Record</div><div style={{ fontWeight: 600, fontSize: 20 }}>{sum.wins}–{sum.losses}</div></div>
            <div className="stat-tile"><div className="small muted">Points</div><div style={{ fontWeight: 600, fontSize: 20 }}>{sum.pointsFor}–{sum.pointsAgainst} <span className="small muted">{sum.pointsFor - sum.pointsAgainst >= 0 ? '+' : ''}{sum.pointsFor - sum.pointsAgainst}</span></div></div>
          </div>
          {sum.events.map((e) => (
            <div key={e.eventId} className="kv">
              <span>{e.name}</span>
              <span>{e.wins}–{e.losses}{e.placement ? ` · ${placementLabel(e.placement)}` : e.bestKo ? ` · reached ${e.bestKo.toLowerCase()}` : ''}</span>
            </div>
          ))}
          <div className="small muted">
            {plural(sum.events.reduce((n, e) => n + e.close, 0), 'close game')} (3 points or fewer) · {plural(sum.events.reduce((n, e) => n + e.cameBack, 0), 'comeback')} · {plural(sum.events.reduce((n, e) => n + e.lostLead, 0), 'lost lead')}
          </div>
          <Notes t={t} />
        </section>
      )}

      {confirmDelete ? (
        <div className="card section">
          <span>Move {t.name} to the Trash? Its matches stay in your history.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={async () => { await trashTournament(t.id); onBack(); }}>Move to Trash</button>
            <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        </div>
      ) : <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmDelete(true)}>Delete tournament</button>}
    </main>
  );
}

function Notes({ t }: { t: Tournament }) {
  const [text, setText] = useState(t.notes ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <Field label="Your reflections">
      <textarea className="input" aria-label="Tournament reflections" rows={3} style={{ padding: 10, minHeight: 80 }} placeholder="What worked, what to change next time" value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        onBlur={async () => { if (text !== (t.notes ?? '')) { await changeTournament(t.id, (x) => { x.notes = text.trim() || undefined; }); setSaved(true); } }} />
      {saved && <span role="status" className="msg msg-ok">Saved</span>}
    </Field>
  );
}

function Checklist({ t, collapsed }: { t: Tournament; collapsed: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  const [text, setText] = useState('');
  const done = t.checklist.filter((c) => c.done).length;
  const set = (fn: (t: Tournament) => void) => changeTournament(t.id, fn);
  return (
    <section className="card section" aria-label="Checklist">
      <div className="header">
        <h2 style={{ fontSize: 18 }}>Checklist</h2>
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{done} of {t.checklist.length} ready · {open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <>
          {t.checklist.map((c) => (
            <div key={c.id} className="check-row">
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minHeight: 40 }}>
                <input type="checkbox" checked={c.done} onChange={() => set((x) => { const i = x.checklist.find((y) => y.id === c.id); if (i) i.done = !i.done; })} />
                <span style={{ textDecoration: c.done ? 'line-through' : undefined, color: c.done ? 'var(--muted)' : undefined }}>{c.text}</span>
              </label>
              <button type="button" className="icon-btn" style={{ width: 36, height: 36, background: 'transparent' }} aria-label={`Remove ${c.text}`} onClick={() => set((x) => { x.checklist = x.checklist.filter((y) => y.id !== c.id); })}><Icon name="close" size={16} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" aria-label="New checklist item" placeholder="Add an item" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} onClick={async () => { if (!text.trim()) return; await set((x) => { x.checklist.push({ id: newId(), text: text.trim(), done: false }); }); setText(''); }}>Add</button>
          </div>
        </>
      )}
    </section>
  );
}

function EventCard({ t, ev, matches, past, go }: { t: Tournament; ev: TournamentEvent; matches: Match[]; past: boolean; go: Go }) {
  const [logging, setLogging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingResult, setAddingResult] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const table = standings(ev, matches, ev.partnerName ? `You & ${ev.partnerName}` : 'You');
  const pool = matches.filter((m) => m.tournament?.stage === 'pool');
  const ko = matches.filter((m) => m.tournament?.stage === 'knockout').sort((a, b) => KO_ROUNDS.indexOf(a.tournament!.round ?? 'Round of 32') - KO_ROUNDS.indexOf(b.tournament!.round ?? 'Round of 32'));
  const wins = matches.filter((m) => m.won).length;
  const bySlot = new Map(matches.filter((m) => m.tournament?.slotId).map((m) => [m.tournament!.slotId!, m]));
  const slots = [...ev.schedule].sort((a, b) => a.at.localeCompare(b.at));
  const used = new Set([...matches.map((m) => m.tournament?.teamId), ...ev.otherResults.flatMap((r) => [r.teamA, r.teamB]), ...ev.schedule.map((s) => s.teamId)]);
  const change = (fn: (e: TournamentEvent) => void) => changeEvent(t.id, ev.id, fn);

  async function addTeam() {
    const n = teamName.trim();
    if (!n) return;
    if (ev.teams.some((x) => x.name.toLowerCase() === n.toLowerCase())) return setMsg(`${n} is already in your pool`);
    await change((e) => { e.teams.push({ id: newId(), name: n }); });
    setTeamName(''); setMsg(null);
  }

  return (
    <section className="card section" aria-label={ev.name}>
      <div>
        <h2 style={{ fontSize: 18 }}>{ev.name}</h2>
        <div className="small muted">{typeLabel(ev.type)}{ev.partnerName ? ` with ${ev.partnerName}` : ''} · {structureLabel(ev.structure)} · {formatLabel(ev.format)}</div>
        {matches.length > 0 && <div className="meta"><span className="pill">{wins}–{matches.length - wins}</span>{ev.placement && <span className="pill pill-ok">{placementLabel(ev.placement)}</span>}</div>}
      </div>

      {logging ? <LogChooser t={t} ev={ev} go={go} onCancel={() => setLogging(false)} /> : (
        <button type="button" className="btn btn-outline" onClick={() => setLogging(true)}>Log a match in this event</button>
      )}

      <div className="section" style={{ gap: 6 }}>
        <div className="header"><span className="label">Schedule</span><button type="button" className="link-btn" onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add a time'}</button></div>
        {slots.length === 0 && !adding && !past && <span className="small muted">Add your match times so the next one shows on Home.</span>}
        {slots.map((s) => {
          const m = bySlot.get(s.id);
          return (
            <div key={s.id} className="kv" style={{ alignItems: 'center' }}>
              <span><span style={{ display: 'block' }}>{slotLabel(s, ev)}</span><span className="small muted">{fmtSlotTime(s.at)}</span></span>
              {m ? (
                <button type="button" className="link-btn" onClick={() => go('match', m.id)}>{m.won ? 'Won' : 'Lost'} {scoreLine(m)}</button>
              ) : (
                <span style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="link-btn" onClick={() => go('log', encodeLink({ tournamentId: t.id, eventId: ev.id, stage: s.stage, round: s.round, teamId: s.teamId, slotId: s.id }))}>Log result</button>
                  <button type="button" className="link-btn" aria-label={`Remove ${slotLabel(s, ev)} at ${fmtSlotTime(s.at)}`} onClick={() => change((e) => { e.schedule = e.schedule.filter((x) => x.id !== s.id); })}>Remove</button>
                </span>
              )}
            </div>
          );
        })}
        {adding && <SlotForm t={t} ev={ev} onDone={() => setAdding(false)} />}
      </div>

      <div className="section" style={{ gap: 6 }}>
        <span className="label">{ev.structure === 'round-robin' ? 'Round robin' : 'Your pool'}</span>
        {ev.teams.length === 0 && <span className="small muted">Add the other teams in your pool to see a table. Optional.</span>}
        {ev.teams.length > 0 && (
          <div className="chips">
            {ev.teams.map((x) => (
              <span key={x.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {x.name}
                {!used.has(x.id) && <button type="button" className="link-btn" style={{ minHeight: 24, padding: 0 }} aria-label={`Remove ${x.name}`} onClick={() => change((e) => { e.teams = e.teams.filter((y) => y.id !== x.id); })}>×</button>}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" aria-label={`Add a team to ${ev.name}`} placeholder={ev.type === 'singles' ? 'Player name' : 'Team, e.g. Arjun / Ravi'} value={teamName} onChange={(e) => { setTeamName(e.target.value); setMsg(null); }} />
          <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} onClick={addTeam}>Add</button>
        </div>
        {msg && <span role="status" className="msg msg-bad">{msg}</span>}

        {ev.teams.length > 0 && (
          <>
            <table className="table" aria-label={`${ev.name} pool table`}>
              <thead><tr><th>#</th><th style={{ textAlign: 'left' }}>Team</th><th>W–L</th><th>+/−</th></tr></thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.teamId} style={r.teamId === ME ? { fontWeight: 600, color: 'var(--accent)' } : undefined}>
                    <td>{r.rank}</td><td style={{ textAlign: 'left' }}>{r.name}</td><td>{r.won}–{r.lost}</td><td>{r.diff > 0 ? '+' : ''}{r.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="small muted">{table.complete ? 'All pool matches entered. Ranked by wins, then results between tied teams, then point difference.' : `Partial table · ${table.entered} of ${table.total} pool matches entered. Your own matches count automatically.`}</span>
            {ev.otherResults.map((r) => {
              const nm = (id: string) => ev.teams.find((x) => x.id === id)?.name ?? '?';
              return (
                <div key={r.id} className="kv" style={{ alignItems: 'center' }}>
                  <span className="small">{nm(r.teamA)} {r.games.map((g) => `${g.a}–${g.b}`).join(', ')} {nm(r.teamB)}</span>
                  <button type="button" className="link-btn" aria-label={`Remove result ${nm(r.teamA)} vs ${nm(r.teamB)}`} onClick={() => change((e) => { e.otherResults = e.otherResults.filter((x) => x.id !== r.id); })}>Remove</button>
                </div>
              );
            })}
            {ev.teams.length >= 2 && (addingResult ? <OtherResultForm t={t} ev={ev} onDone={() => setAddingResult(false)} /> : (
              <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAddingResult(true)}>Add a result between other teams</button>
            ))}
          </>
        )}
        {!table.complete && (
          <Field label="Your final pool position (if you know it)">
            <Chips small label={`${ev.name} pool position`} value={ev.poolPosition} options={Array.from({ length: Math.max(6, ev.teams.length + 1) }, (_, i) => ({ value: i + 1, label: `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'}` }))}
              onChange={(v) => change((e) => { e.poolPosition = e.poolPosition === v ? undefined : v; })} />
          </Field>
        )}
        {pool.length > 0 && <span className="small muted">{pool.length} pool {pool.length === 1 ? 'match' : 'matches'} logged</span>}
      </div>

      {ev.structure === 'pools-knockout' && ko.length > 0 && (
        <div className="section" style={{ gap: 6 }}>
          <span className="label">Knockout</span>
          {ko.map((m) => (
            <button key={m.id} type="button" className="kv" style={{ background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'inherit', width: '100%', textAlign: 'left' }} onClick={() => go('match', m.id)}>
              <span>{m.tournament?.round ?? 'Knockout'}</span><span>{m.won ? 'Won' : 'Lost'} {scoreLine(m)}</span>
            </button>
          ))}
        </div>
      )}

      <Field label="Final placement">
        <Chips small label={`${ev.name} placement`} value={ev.placement} options={PLACEMENTS.filter((p) => ev.structure === 'pools-knockout' || !['qf', 'r16'].includes(p.value)).map((p) => ({ value: p.value, label: p.label }))}
          onChange={(v) => change((e) => { e.placement = e.placement === v ? undefined : v; })} />
      </Field>
    </section>
  );
}

function LogChooser({ t, ev, go, onCancel }: { t: Tournament; ev: TournamentEvent; go: Go; onCancel: () => void }) {
  const [stage, setStage] = useState<Stage>('pool');
  const [round, setRound] = useState<KoRound>('Quarterfinal');
  const [team, setTeam] = useState<string>('');
  return (
    <div className="card section" style={{ background: 'var(--card-2)', padding: 12 }}>
      {ev.structure === 'pools-knockout' && <Segmented label="Stage" value={stage} options={[{ value: 'pool' as Stage, label: 'Pool' }, { value: 'knockout' as Stage, label: 'Knockout' }]} onChange={setStage} />}
      {stage === 'knockout' && <Chips small label="Round" value={round} options={KO_ROUNDS.map((r) => ({ value: r, label: r }))} onChange={setRound} />}
      {stage === 'pool' && ev.teams.length > 0 && (
        <Field label="Against">
          <Chips small label="Pool opponent" value={team} options={[...ev.teams.map((x) => ({ value: x.id, label: x.name })), { value: '', label: 'Not listed' }]} onChange={setTeam} />
        </Field>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => go('log', encodeLink({ tournamentId: t.id, eventId: ev.id, stage, round: stage === 'knockout' ? round : undefined, teamId: stage === 'pool' && team ? team : undefined }))}>Log the score</button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SlotForm({ t, ev, onDone }: { t: Tournament; ev: TournamentEvent; onDone: () => void }) {
  const [at, setAt] = useState(`${t.startDate}T09:00`);
  const [stage, setStage] = useState<Stage>('pool');
  const [round, setRound] = useState<KoRound>('Quarterfinal');
  const [team, setTeam] = useState('');
  const [court, setCourt] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) return setError('Pick a day and time');
    await changeEvent(t.id, ev.id, (e) => { e.schedule.push({ id: newId(), at, stage, round: stage === 'knockout' ? round : undefined, teamId: stage === 'pool' && team ? team : undefined, court: court.trim() || undefined }); });
    onDone();
  }
  return (
    <div className="card section" style={{ background: 'var(--card-2)', padding: 12 }}>
      <Field label="Day and time"><input className="input" type="datetime-local" aria-label="Match time" value={at} onChange={(e) => { setAt(e.target.value); setError(null); }} /></Field>
      {ev.structure === 'pools-knockout' && <Segmented label="Scheduled stage" value={stage} options={[{ value: 'pool' as Stage, label: 'Pool' }, { value: 'knockout' as Stage, label: 'Knockout' }]} onChange={setStage} />}
      {stage === 'knockout' && <Chips small label="Scheduled round" value={round} options={KO_ROUNDS.map((r) => ({ value: r, label: r }))} onChange={setRound} />}
      {stage === 'pool' && ev.teams.length > 0 && <Chips small label="Scheduled opponent" value={team} options={[...ev.teams.map((x) => ({ value: x.id, label: x.name })), { value: '', label: 'Not known yet' }]} onChange={setTeam} />}
      <Field label="Court (optional)"><input className="input" aria-label="Court" placeholder="3" value={court} onChange={(e) => setCourt(e.target.value)} /></Field>
      {error && <div role="status" className="msg msg-bad">{error}</div>}
      <button type="button" className="btn btn-primary" onClick={save}>Add to schedule</button>
    </div>
  );
}

function OtherResultForm({ t, ev, onDone }: { t: Tournament; ev: TournamentEvent; onDone: () => void }) {
  const [a, setA] = useState(ev.teams[0]?.id ?? '');
  const [b, setB] = useState(ev.teams[1]?.id ?? '');
  const rows = ev.format.bestOf === 3 ? 3 : 1;
  const [scores, setScores] = useState<{ a: string; b: string }[]>(Array.from({ length: rows }, () => ({ a: '', b: '' })));
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => (s.trim() === '' ? null : /^\d+$/.test(s.trim()) ? parseInt(s, 10) : NaN);
  async function save() {
    const games = scores.map((g) => ({ a: num(g.a), b: num(g.b) }));
    if (games.some((g) => Number.isNaN(g.a) || Number.isNaN(g.b))) return setError('Scores must be whole numbers');
    const err = checkOtherResult(ev.format, a, b, games);
    if (err) return setError(err);
    const filled = games.filter((g) => g.a !== null || g.b !== null) as { a: number; b: number }[];
    await changeEvent(t.id, ev.id, (e) => { e.otherResults.push({ id: newId(), teamA: a, teamB: b, games: filled }); });
    onDone();
  }
  const sel = (label: string, v: string, set: (s: string) => void) => (
    <select className="input" aria-label={label} value={v} onChange={(e) => { set(e.target.value); setError(null); }}>
      {ev.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );
  return (
    <div className="card section" style={{ background: 'var(--card-2)', padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
        {sel('First team', a, setA)}{sel('Second team', b, setB)}
        {scores.map((g, i) => (
          [<input key={`a${i}`} className="input" inputMode="numeric" aria-label={`Game ${i + 1} first team score`} placeholder={rows > 1 ? `Game ${i + 1}` : 'Score'} value={g.a} onChange={(e) => { setScores((s) => s.map((x, j) => (j === i ? { ...x, a: e.target.value } : x))); setError(null); }} />,
           <input key={`b${i}`} className="input" inputMode="numeric" aria-label={`Game ${i + 1} second team score`} placeholder={rows > 1 ? `Game ${i + 1}` : 'Score'} value={g.b} onChange={(e) => { setScores((s) => s.map((x, j) => (j === i ? { ...x, b: e.target.value } : x))); setError(null); }} />]
        ))}
      </div>
      {error && <div role="status" className="msg msg-bad">{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={save}>Save result</button>
        <button type="button" className="btn btn-outline" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Home card for the tournament happening now or coming up next. */
export function NextTournamentCard({ go }: { go: Go }) {
  const list = useLiveQuery(() => activeTournaments(), []) ?? [];
  const matches = useLiveQuery(() => activeMatches(), []) ?? [];
  const today = isoToday();
  const t = list.filter((x) => when(x, today).kind !== 'past').sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (!t) return null;
  const next = nextSlot(t, matches);
  const done = t.checklist.filter((c) => c.done).length;
  return (
    <button type="button" className="rating-card" onClick={() => go('tournament', t.id)} aria-label={`Next tournament: ${t.name}, ${whenLabel(when(t, today))}. Open`}>
      <span className="header" style={{ width: '100%' }}>
        <span className="small muted">Next tournament</span>
        <span className="small" style={{ fontWeight: 600, color: 'var(--accent)' }}>{whenLabel(when(t, today))}</span>
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, textAlign: 'left' }}>{t.name}</span>
      <span className="small muted" style={{ textAlign: 'left' }}>{dateRange(t)} · {t.events.map((e) => e.name).join(', ')}</span>
      {next && <span className="small" style={{ textAlign: 'left' }}>Next: {fmtSlotTime(next.slot.at)} · {slotLabel(next.slot, next.event)}</span>}
      {t.checklist.length > 0 && (
        <span style={{ width: '100%' }}>
          <span className="small muted">Checklist {done} of {t.checklist.length}</span>
          <span style={{ height: 6, background: 'var(--chart-grid)', borderRadius: 3, width: '100%', display: 'block', marginTop: 4 }}><span style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--chart-1)', width: `${(done / t.checklist.length) * 100}%` }} /></span>
        </span>
      )}
    </button>
  );
}

/** One line on a match screen that links back to its tournament. */
export function TournamentBadge({ match, go }: { match: Match; go: Go }) {
  const link = match.tournament;
  const t = useLiveQuery(async () => (link ? (await db.tournaments.get(link.tournamentId)) ?? null : null), [link?.tournamentId]);
  if (!link || !t || t.deletedAt !== undefined) return null;
  const ev = t.events.find((e) => e.id === link.eventId);
  const team = link.teamId ? ev?.teams.find((x) => x.id === link.teamId)?.name : undefined;
  const what = link.stage === 'knockout' ? (link.round ?? 'Knockout') : `Pool${team ? ` vs ${team}` : ''}`;
  return (
    <button type="button" className="banner-btn" style={{ background: 'var(--card)', color: 'var(--text)' }} onClick={() => go('tournament', t.id)}>
      <span>{t.name} · {ev?.name ?? 'Event'} · {what}</span><span>›</span>
    </button>
  );
}
