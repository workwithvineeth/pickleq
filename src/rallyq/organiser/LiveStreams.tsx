import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ClubBackend, CourtStream, TournamentBundle } from '../../club/backend';
import { parseYouTubeLink } from '../../club/live/youtubeLink';
import { videoState } from '../../club/liveView';
import { copyLink, errorText, useLoad } from '../../club/screens/common';
import { useClubBackend } from '../../club/screens/deskContext';
import type { Go } from '../../navigation';
import { OrgShell, PageHead } from '../shell/Shell';
import '../live/streams.css';

type Show = () => Promise<boolean>;

function ConsentDialog({ cancel, confirm }: { cancel: () => void; confirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog ref={dialog} className="stream-consent" aria-labelledby={title} aria-describedby={description}
      onCancel={event => { event.preventDefault(); cancel(); }}>
      <h2 id={title}>Before you show the stream</h2>
      <p id={description}>Players and spectators must know they are being filmed. Put up the filming notice at the venue before you show streams to fans.</p>
      <div className="stream-actions">
        <button type="button" onClick={cancel}>Cancel</button>
        <button type="button" className="stream-selected" onClick={confirm}>I've told them — show it</button>
      </div>
    </dialog>
  );
}

function StreamCard({ b, tournament, court, initial, requestShow }: {
  b: ClubBackend; tournament: TournamentBundle['tournament']; court: number; initial?: CourtStream; requestShow: (show: Show) => void;
}) {
  const label = `Court ${court}`;
  const title = useId();
  const field = useId();
  const fieldMessage = useId();
  const checkerNote = useId();
  const [stream, setStream] = useState(initial);
  const [input, setInput] = useState(initial ? `https://youtu.be/${initial.videoId}` : '');
  const [invalid, setInvalid] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = videoState(stream);
  const status = state === 'LIVE' ? 'Live' : state === 'Starting soon' ? state : stream ? 'Stream linked' : 'No link';

  async function update(write: () => Promise<CourtStream>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      setStream(await write());
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = parseYouTubeLink(input);
    if (!parsed.ok) { setInvalid(parsed.reason); return; }
    setInvalid('');
    void update(() => b.setCourtStream(tournament.id, court, parsed.videoId), 'Link saved');
  }

  function toggle() {
    if (stream?.visible) {
      void update(() => b.setCourtStreamVisible(tournament.id, court, false), 'Stream hidden');
    } else {
      requestShow(() => update(() => b.setCourtStreamVisible(tournament.id, court, true), 'Stream shown'));
    }
  }

  async function copyOverlay() {
    const hash = `#/overlay/${encodeURIComponent(tournament.publicSlug)}/${court}`;
    const result = await copyLink(new URL(import.meta.env.BASE_URL, window.location.origin).href + hash);
    setCopied(result.ok);
    setMessage(result.ok ? 'Overlay link copied' : result.text);
  }

  return (
    <section className="stream-card" aria-labelledby={title}>
      <header className="stream-actions">
        <h2 id={title}>{label}</h2>
        <span className="stream-chip" data-live={state === 'LIVE'}>{status}</span>
      </header>
      <form className="stream-form" onSubmit={save}>
        <label htmlFor={field}>YouTube link for {label}</label>
        <div className="stream-form-field">
          <input id={field} value={input} placeholder="https://youtube.com/live/…" inputMode="url"
            autoCapitalize="none" spellCheck={false} disabled={busy}
            aria-invalid={!!invalid} aria-describedby={invalid ? fieldMessage : undefined}
            onChange={event => { setInput(event.target.value); setInvalid(''); }} />
          <button type="submit" disabled={busy}>Save</button>
        </div>
        {invalid && <p id={fieldMessage} role="alert">{invalid}</p>}
      </form>
      <div className="stream-actions">
        <button type="button" className={stream?.visible ? 'stream-selected' : undefined}
          aria-pressed={!!stream?.visible} disabled={!stream || busy} onClick={toggle}>
          {stream?.visible ? 'Showing to fans' : 'Show to fans'}
        </button>
        <button type="button" disabled aria-describedby={checkerNote}>Check now</button>
        <button type="button" disabled={!tournament.publicSlug} onClick={() => void copyOverlay()}>
          {copied ? 'Copied' : 'Copy overlay link'}
        </button>
      </div>
      <p className="stream-note" id={checkerNote}>Automatic YouTube status checks are unavailable.</p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function StreamSettings({ b, bundle, streams }: { b: ClubBackend; bundle: TournamentBundle; streams: CourtStream[] }) {
  const { tournament, matches } = bundle;
  const count = Math.min(64, Math.max(1, tournament.courts, ...matches.map(match => match.court ?? 0), ...streams.map(stream => stream.court)));
  const consentKey = `pq-filming-notice:${tournament.id}`;
  const [consented, setConsented] = useState(() => {
    if (streams.some(stream => stream.visible)) return true;
    try { return localStorage.getItem(consentKey) === '1'; } catch { return false; }
  });
  const [pending, setPending] = useState<{ show: Show } | null>(null);

  async function confirm() {
    if (!pending) return;
    const { show } = pending;
    setPending(null);
    if (await show()) {
      setConsented(true);
      try { localStorage.setItem(consentKey, '1'); } catch { /* Keep the confirmation for this visit. */ }
    }
  }

  return (
    <div className="stream-settings">
      <p>Paste each court’s YouTube live link. Fans can watch alongside the scores on RallyQ. Use the overlay link as a Browser Source in OBS.</p>
      <div className="stream-grid">
        {Array.from({ length: count }, (_, index) => {
          const court = index + 1;
          return <StreamCard key={court} b={b} tournament={tournament} court={court}
            initial={streams.find(stream => stream.court === court)}
            requestShow={show => { if (consented) void show(); else setPending({ show }); }} />;
        })}
      </div>
      <p className="stream-note">Hiding removes it from RallyQ only. The stream keeps running on YouTube.</p>
      {pending && <ConsentDialog cancel={() => setPending(null)} confirm={() => void confirm()} />}
    </div>
  );
}

export function LiveStreams({ id, go }: { id: string; go: Go }) {
  const b = useClubBackend();
  const state = useLoad(async () => {
    if (!b) throw new Error('Sign in to manage live streams');
    const streams = await b.courtStreams(id);
    return { streams, bundle: await b.resultsBundle(id) };
  }, [b, id]);
  const data = state.data;
  const t = data?.bundle.tournament;
  return (
    <OrgShell go={go} active="streams" clubName={data?.bundle.club.name} clubId={t?.clubId}
      tournament={t && { id: t.id, name: t.name, slug: t.publicSlug }}>
      <PageHead cap={t && `Organiser · ${t.name}`} title="Live streams" />
      {b && data && <StreamSettings b={b} bundle={data.bundle} streams={data.streams} />}
      {state.loading && <p role="status">Loading live streams…</p>}
      {state.error && <div role="alert"><p>{state.error}</p><button className="btn" onClick={state.reload}>Try again</button></div>}
    </OrgShell>
  );
}
