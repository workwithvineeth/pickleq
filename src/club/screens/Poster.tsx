import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClubBackend } from '../backend';
import { shrinkImage } from '../poster';
import type { ClubTournament } from '../types';
import { errorText } from './common';

/** A tournament poster, portrait 4:5, cropped to fit. */
export function PosterImage({ src, name, size = 'full' }: { src?: string; name: string; size?: 'full' | 'thumb' }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  const thumb = size === 'thumb';
  return (
    <img
      src={src}
      alt={`Poster for ${name}`}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      style={{
        display: 'block', width: thumb ? 64 : '100%', maxWidth: thumb ? 64 : 420, aspectRatio: '4 / 5', objectFit: 'cover',
        borderRadius: thumb ? 10 : 16, border: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0, alignSelf: thumb ? 'flex-start' : 'center',
      }}
    />
  );
}

/** Choose a picture for the poster: shrinks it on the phone first, then either hands it back (new tournament) or uploads it. */
export function PosterPicker({ b, t, onChanged, onPicked, current }: {
  b?: ClubBackend; t?: ClubTournament; current?: string;
  /** Uploaded to an existing tournament. */
  onChanged?: (url: string) => void;
  /** For a tournament not created yet: the shrunk picture and a preview. */
  onPicked?: (blob: Blob, preview: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<string | undefined>(current);
  useEffect(() => setPreview(current), [current]);
  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const blob = await shrinkImage(file);
      const local = URL.createObjectURL(blob);
      if (onPicked) { onPicked(blob, local); setPreview(local); setMsg({ ok: true, text: 'Poster ready. It’s added when you create the tournament.' }); }
      else if (b && t) { const url = await b.setPoster(t, blob); setPreview(url); onChanged?.(url); setMsg({ ok: true, text: 'Poster saved' }); URL.revokeObjectURL(local); }
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  return (
    <div className="section" aria-label="Poster">
      {preview && <PosterImage src={preview} name={t?.name ?? 'this tournament'} />}
      <input ref={input} type="file" accept="image/*" aria-label="Poster picture" style={{ display: 'none' }} onChange={(e) => void choose(e.target.files?.[0])} />
      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Preparing the poster…' : preview ? 'Change poster' : 'Add a poster'}</button>
      <p className="small muted" style={{ margin: 0 }}>A portrait picture works best (4:5, like an Instagram post). It’s shown on the events board and the tournament page, and in WhatsApp previews.</p>
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
    </div>
  );
}

/** The club's logo, small and square, kept whole (not cropped). */
export function ClubLogo({ src, club, size = 64 }: { src?: string; club: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return <img src={src} alt={`${club} logo`} className="club-logo" width={size} height={size} style={{ width: size, height: size }} onError={() => setBroken(true)} />;
}

/** Choose or change the club's logo (coaches and admins). Shrunk on the phone to 512 px first. */
export function LogoPicker({ b, clubId, club, current, onChanged }: { b: ClubBackend; clubId: string; club: string; current?: string; onChanged?: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [url, setUrl] = useState(current);
  useEffect(() => setUrl(current), [current]);
  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const blob = await shrinkImage(file, 512, 400_000);
      const u = await b.setClubLogo(clubId, blob);
      setUrl(u); onChanged?.(u); setMsg({ ok: true, text: 'Logo saved. It shows on your club, event and results pages.' });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <section className="card section" aria-label="Club logo">
      <div className="row" style={{ justifyContent: 'flex-start', gap: 12 }}>
        <ClubLogo src={url} club={club} />
        <h2 style={{ fontSize: 18 }}>Club logo</h2>
      </div>
      <input ref={input} type="file" accept="image/*" aria-label="Logo picture" style={{ display: 'none' }} onChange={(e) => void choose(e.target.files?.[0])} />
      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Saving the logo…' : url ? 'Change logo' : 'Add a logo'}</button>
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
    </section>
  );
}

const initialsOf = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w) && !/^(the|pq|demo)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'PQ';

/** The club's logo, big and centred, or its initials while it has none. */
export function BigLogo({ src, club, size = 104 }: { src?: string; club: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return src && !broken
    ? <img src={src} alt={`${club} logo`} className="pq-biglogo" width={size} height={size} style={{ width: size, height: size }} onError={() => setBroken(true)} />
    : <span className="pq-biglogo pq-biglogo-empty" role="img" aria-label={`${club}: no logo yet`} style={{ width: size, height: size, fontSize: size * 0.34 }}>{initialsOf(club)}</span>;
}

/** Top of a club's page: the logo in the middle, the name, where, and for its staff a button to add or change the logo. */
export function ClubHero({ b, clubId, club, city, logoUrl, badge, canEdit, onChanged }: {
  b: ClubBackend | null; clubId: string; club: string; city?: string; logoUrl?: string; badge?: ReactNode; canEdit: boolean; onChanged?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function choose(file: File | undefined) {
    if (!file || !b) return;
    setBusy(true); setMsg(null);
    try {
      await b.setClubLogo(clubId, await shrinkImage(file, 512, 400_000));
      setMsg({ ok: true, text: 'Logo saved. It shows on your club, event and results pages.' }); onChanged?.();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <section className="pq-clubhero" aria-label={`${club} club`}>
      <BigLogo src={logoUrl} club={club} />
      <div className="pq-clubhero-name">{club}</div>
      <div className="pq-club-meta" style={{ justifyContent: 'center' }}>{city}{badge}</div>
      {canEdit && (
        <>
          <input ref={input} type="file" accept="image/*" aria-label="Logo picture" style={{ display: 'none' }} onChange={(e) => void choose(e.target.files?.[0])} />
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Saving the logo…' : logoUrl ? 'Change logo' : 'Add your club logo'}</button>
        </>
      )}
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
    </section>
  );
}

/** On an event page: who runs it, with their logo, big enough to recognise. */
export function OrganiserCard({ club, logoUrl }: { club: string; logoUrl?: string }) {
  return (
    <section className="pq-organiser" aria-label="Organised by">
      <BigLogo src={logoUrl} club={club} size={72} />
      <div style={{ minWidth: 0 }}>
        <div className="pq-kicker">ORGANISED BY</div>
        <div className="pq-organiser-name">{club}</div>
      </div>
    </section>
  );
}
