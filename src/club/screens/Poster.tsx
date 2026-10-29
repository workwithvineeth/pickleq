import { useEffect, useRef, useState } from 'react';
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
