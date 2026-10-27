import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { ClipPlayer, watchUrl } from '../components/ClipPlayer';
import { Field } from '../components/Controls';
import { Icon } from '../components/Icon';
import { addCustomClip, ensureBuiltInClips, removeClip, setClipRange, setClipStatus } from '../db/clips';
import { db } from '../db/db';
import {
  CLIP_SHOTS, checkRange, clipLength, clipShotForInsight, fmtTime, parseLinkStart, parseTime, parseYouTubeId, shotFromSlug, shotSlug, sortClips,
  type Clip, type ClipShot,
} from '../domain/clips';
import { useInsights } from '../hooks/useInsights';
import type { Go } from '../navigation';

const PRIVACY = 'Clips play from YouTube in its privacy-enhanced mode. Nothing loads from YouTube until you tap play. Once a clip plays, YouTube (Google) can see it, as when you watch on youtube.com.';

function useFlagged(): Set<ClipShot> {
  const list = useInsights() ?? [];
  return new Set(list.filter((i) => i.kind === 'watch').map((i) => clipShotForInsight(i.id)).filter((s): s is ClipShot => !!s));
}

export function Clips({ slug, go, onBack }: { slug?: string; go: Go; onBack: () => void }) {
  useEffect(() => { ensureBuiltInClips().catch(() => {}); }, []);
  const shot = shotFromSlug(slug);
  return shot ? <ShotClips shot={shot} onBack={onBack} /> : <ClipIndex go={go} onBack={onBack} />;
}

function ClipIndex({ go, onBack }: { go: Go; onBack: () => void }) {
  const all = useLiveQuery(() => db.clips.toArray(), []) ?? [];
  const flagged = useFlagged();
  const shots = [...CLIP_SHOTS].sort((a, b) => Number(flagged.has(b)) - Number(flagged.has(a)));
  return (
    <main className="screen" aria-labelledby="clips-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="clips-title" className="screen-title" style={{ flex: 1 }}>Pro clips</h1>
      </header>
      <p className="small muted" style={{ margin: 0 }}>Short videos from coaches and pros that show how each shot is hit. Watch a clip, then approve it or hide it.</p>
      <div className="section" style={{ gap: 8 }} role="list">
        {shots.map((s) => {
          const list = all.filter((c) => c.shot === s && c.status !== 'hidden');
          const approved = list.filter((c) => c.status === 'approved').length;
          return (
            <div key={s} role="listitem"><button type="button" className="match-row" onClick={() => go('clips', shotSlug(s))}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500, display: 'block' }}>{s}</span>
                <span className="small muted">{list.length} {list.length === 1 ? 'clip' : 'clips'}{approved ? ` · ${approved} approved` : ''}</span>
                {flagged.has(s) && <span className="meta"><span className="pill pill-warn">In your Coach insights</span></span>}
              </span>
              <Icon name="chevron" size={18} />
            </button></div>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{PRIVACY}</p>
    </main>
  );
}

function rangeText(c: Clip): string {
  const len = clipLength(c);
  if (c.start === 0 && c.end === undefined) return len !== undefined ? `Whole video · ${fmtTime(len)}` : 'Whole video';
  return `${fmtTime(c.start)}–${c.end !== undefined ? fmtTime(c.end) : 'end'}${len !== undefined ? ` · ${fmtTime(len)} clip` : ''}`;
}

function ShotClips({ shot, onBack }: { shot: ClipShot; onBack: () => void }) {
  const raw = useLiveQuery(() => db.clips.where('shot').equals(shot).toArray(), [shot]);
  const [active, setActive] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const list = sortClips(raw ?? []);
  const visible = list.filter((c) => c.status !== 'hidden');
  const hidden = list.filter((c) => c.status === 'hidden');

  return (
    <main className="screen" aria-labelledby="shot-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="shot-title" className="screen-title" style={{ flex: 1 }}>{shot}</h1>
      </header>
      <p className="small muted" style={{ margin: 0 }}>Clips need an internet connection. Use 0.5× to see the paddle and body slowly.</p>

      {raw !== undefined && visible.length === 0 && <p className="small muted">No clips here yet. Add one below.</p>}
      {visible.map((c) => <ClipCard key={c.id} clip={c} active={active === c.id} onPlay={() => setActive(c.id)} />)}

      {hidden.length > 0 && (
        <section className="card section" aria-label="Hidden clips">
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? 'Hide' : 'Show'} hidden clips ({hidden.length})
          </button>
          {showHidden && hidden.map((c) => (
            <div key={c.id} className="kv" style={{ alignItems: 'center' }}>
              <span>{c.title}</span>
              <button type="button" className="link-btn" onClick={() => setClipStatus(c.id, 'new')}>Show again</button>
            </div>
          ))}
        </section>
      )}

      <AddClip shot={shot} />
      <p className="small muted" style={{ margin: 0 }}>{PRIVACY}</p>
    </main>
  );
}

function ClipCard({ clip, active, onPlay }: { clip: Clip; active: boolean; onPlay: () => void }) {
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function markStart(t: number) {
    const end = clip.end !== undefined && clip.end > t ? clip.end : undefined;
    await setClipRange(clip.id, t, end);
    setMsg({ ok: true, text: `Start set to ${fmtTime(t)}${clip.end !== undefined && end === undefined ? '. The old end was before it, so the clip now plays to the end' : ''}` });
  }
  async function markEnd(t: number) {
    if (t <= clip.start) return setMsg({ ok: false, text: `The end has to be after the start (${fmtTime(clip.start)})` });
    await setClipRange(clip.id, clip.start, t);
    setMsg({ ok: true, text: `End set to ${fmtTime(t)}` });
  }

  return (
    <section className="card section" style={{ gap: 10 }} aria-label={clip.title}>
      {active ? <ClipPlayer clip={clip} onMarkStart={markStart} onMarkEnd={markEnd} /> : (
        <button type="button" className="clip-play" onClick={onPlay} aria-label={`Play ${clip.title}`}>
          <span className="play-dot"><Icon name="play" size={24} strokeWidth={2.2} /></span>
          Play {clip.start ? `from ${fmtTime(clip.start)}` : ''}
        </button>
      )}
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      <div>
        <div style={{ fontWeight: 500, lineHeight: 1.35 }}>{clip.title}</div>
        <div className="small muted">{clip.channel ? `${clip.channel} · ` : ''}{rangeText(clip)}</div>
        <div className="meta">
          {clip.status === 'new' && <span className="pill pill-warn">Not reviewed yet</span>}
          {clip.status === 'approved' && <span className="pill pill-ok">{clip.builtIn ? 'Approved by you' : 'Your clip'}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {clip.status === 'new' && <button type="button" className="link-btn" onClick={() => setClipStatus(clip.id, 'approved')}>Approve</button>}
        <button type="button" className="link-btn" onClick={() => { setEditing(!editing); setMsg(null); }}>{editing ? 'Close' : 'Edit times'}</button>
        <a className="link-btn" href={watchUrl(clip)} target="_blank" rel="noopener noreferrer">Open in YouTube</a>
        <button type="button" className="link-btn" onClick={() => removeClip(clip)}>{clip.builtIn ? 'Hide' : 'Remove'}</button>
      </div>
      {editing && <EditTimes clip={clip} onDone={(text) => { setEditing(false); setMsg({ ok: true, text }); }} />}
    </section>
  );
}

function EditTimes({ clip, onDone }: { clip: Clip; onDone: (msg: string) => void }) {
  const [start, setStart] = useState(fmtTime(clip.start));
  const [end, setEnd] = useState(clip.end !== undefined ? fmtTime(clip.end) : '');
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const s = parseTime(start) ?? 0, e = parseTime(end);
    const err = checkRange(s, e, clip.duration);
    if (err) return setError(err);
    await setClipRange(clip.id, s, e ?? undefined);
    onDone(`Clip set to ${fmtTime(s)}–${e !== null ? fmtTime(e) : 'end'}`);
  }
  return (
    <div className="section" style={{ gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
        <Field label="Start"><input className="input" aria-label="Clip start" inputMode="numeric" placeholder="0:00" value={start} onChange={(e) => { setStart(e.target.value); setError(null); }} /></Field>
        <Field label="End (empty = to the end)"><input className="input" aria-label="Clip end" inputMode="numeric" placeholder="1:30" value={end} onChange={(e) => { setEnd(e.target.value); setError(null); }} /></Field>
      </div>
      {error && <div role="status" className="msg msg-bad">{error}</div>}
      <button type="button" className="btn btn-outline" onClick={save}>Save times</button>
    </div>
  );
}

function AddClip({ shot }: { shot: ClipShot }) {
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function add() {
    const id = parseYouTubeId(link);
    if (!id) return setError('Paste a YouTube link, like youtube.com/watch?v=… or youtu.be/…');
    const s = start.trim() ? parseTime(start) : parseLinkStart(link);
    const e = parseTime(end);
    const err = checkRange(s, e);
    if (err) return setError(err);
    await addCustomClip({ shot, videoId: id, title: title.trim() || 'YouTube video', start: s ?? 0, end: e ?? undefined });
    setLink(''); setTitle(''); setStart(''); setEnd(''); setError(null);
    setDone('Clip added');
  }
  return (
    <section className="card section" aria-label="Add your own clip">
      <h2 style={{ fontSize: 18 }}>Add your own clip</h2>
      <Field label="YouTube link"><input className="input" aria-label="YouTube link" placeholder="https://youtu.be/…" value={link} onChange={(e) => { setLink(e.target.value); setError(null); setDone(null); }} /></Field>
      <Field label="Name (optional)"><input className="input" aria-label="Clip name" placeholder="Coach’s backhand demo" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
        <Field label="Start (optional)"><input className="input" aria-label="New clip start" inputMode="numeric" placeholder="0:00" value={start} onChange={(e) => { setStart(e.target.value); setError(null); }} /></Field>
        <Field label="End (optional)"><input className="input" aria-label="New clip end" inputMode="numeric" placeholder="1:30" value={end} onChange={(e) => { setEnd(e.target.value); setError(null); }} /></Field>
      </div>
      {error && <div role="status" className="msg msg-bad">{error}</div>}
      {done && <div role="status" className="msg msg-ok">{done}</div>}
      <button type="button" className="btn btn-primary" onClick={add}>Add clip</button>
    </section>
  );
}
