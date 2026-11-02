import { useRef, useState } from 'react';
import type { ClubBackend } from '../backend';
import { friendlyDate } from '../dates';
import { shrinkImage } from '../poster';
import { hasContactDetails, TESTIMONIAL_CONSENT, TESTIMONIAL_MAX, TESTIMONIAL_STATUS_LABEL, type Testimonial } from '../types';
import { errorText, Status, useLoad } from './common';

const STARS = [1, 2, 3, 4, 5];
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

function StatusPill({ t }: { t: Testimonial }) {
  const cls = t.status === 'approved' ? ' pill-ok' : t.status === 'hidden' ? ' pill-bad' : '';
  return <span className={`pill${cls}`}>{TESTIMONIAL_STATUS_LABEL[t.status]}{t.featured ? ' · ★ Featured' : ''}</span>;
}

function Quote({ t }: { t: Testimonial }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {t.photoUrl && <img src={t.photoUrl} alt={`Photo of ${t.personName}`} width={56} height={56} style={{ borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div aria-label={`${t.rating} out of 5`} style={{ color: 'var(--accent)', letterSpacing: 2 }}>{stars(t.rating)}</div>
        <p style={{ margin: '4px 0', overflowWrap: 'anywhere' }}>“{t.quote}”</p>
        <div className="small muted" style={{ overflowWrap: 'anywhere' }}>{t.personName}, {t.personRole}</div>
      </div>
    </div>
  );
}

/** Club page (owner and admins): "Share your experience", and the club's own testimonials with their status. */
export function TestimonialsCard({ b, clubId, club }: { b: ClubBackend; clubId: string; club: string }) {
  const state = useLoad(() => b.clubTestimonials(clubId), [b, clubId]);
  const [rating, setRating] = useState(0);
  const [quote, setQuote] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState(`Owner, ${club}`.slice(0, 80));
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    try { setPhoto(await shrinkImage(f, 400, 300_000)); } catch { setMsg({ ok: false, text: 'That picture couldn’t be used. Try another one.' }); }
  }
  async function send() {
    if (rating < 1) return setMsg({ ok: false, text: 'Pick a rating from 1 to 5' });
    if (quote.trim().length < 10) return setMsg({ ok: false, text: 'Write a few words (at least 10 characters)' });
    if (name.trim().length < 2 || role.trim().length < 2) return setMsg({ ok: false, text: 'Add your name and role' });
    if (hasContactDetails(`${quote} ${name} ${role}`)) return setMsg({ ok: false, text: 'Please leave out phone numbers and email addresses' });
    if (!consent) return setMsg({ ok: false, text: 'Tick the box to let PaddleQ use it' });
    setBusy(true); setMsg(null);
    try {
      await b.submitTestimonial({ clubId, rating, quote, personName: name, personRole: role, consent, photo: photo ?? undefined });
      setMsg({ ok: true, text: 'Thank you! PaddleQ will check it soon.' });
      setRating(0); setQuote(''); setConsent(false); setPhoto(null); if (file.current) file.current.value = '';
      state.reload();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  async function withdraw(id: string) {
    setBusy(true); setMsg(null);
    try { await b.withdrawTestimonial(id); setConfirm(null); setMsg({ ok: true, text: 'Withdrawn. PaddleQ won’t use it.' }); state.reload(); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const left = TESTIMONIAL_MAX - quote.length;
  return (
    <section className="card section" aria-label="Share your experience">
      <h2 style={{ fontSize: 16 }}>Share your experience</h2>
      <p className="small muted" style={{ margin: 0 }}>Tell other clubs what running events on PaddleQ is like. We check every one before using it. No phone numbers or emails are shown.</p>
      <div role="group" aria-label="Rating" style={{ display: 'flex', gap: 4 }}>
        {STARS.map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={rating === n} onClick={() => setRating(n)}
            style={{ minWidth: 44, minHeight: 44, fontSize: 24, background: 'none', border: 'none', color: n <= rating ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer' }}>
            {n <= rating ? '★' : '☆'}
          </button>
        ))}
      </div>
      <label className="small" htmlFor="tm-quote">Your words</label>
      <textarea id="tm-quote" className="input" aria-label="Your words" rows={4} maxLength={TESTIMONIAL_MAX} value={quote} onChange={(e) => setQuote(e.target.value)} />
      <div className="small muted" aria-live="polite">{left} characters left</div>
      <label className="small" htmlFor="tm-name">Your name</label>
      <input id="tm-name" className="input" aria-label="Your name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="small" htmlFor="tm-role">Role</label>
      <input id="tm-role" className="input" aria-label="Role" maxLength={80} value={role} onChange={(e) => setRole(e.target.value)} />
      <label className="small" htmlFor="tm-photo">Photo (optional)</label>
      <input id="tm-photo" ref={file} type="file" accept="image/*" aria-label="Photo (optional)" onChange={(e) => void pick(e.target.files?.[0])} style={{ minHeight: 44, maxWidth: '100%' }} />
      {photo && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setPhoto(null); if (file.current) file.current.value = ''; }}>Remove photo</button>}
      <label className="check-row small"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {TESTIMONIAL_CONSENT}</label>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={send}>Send to PaddleQ</button>
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      <Status error={state.error} loading={state.loading && !state.data} />
      {(state.data ?? []).length > 0 && <h3 style={{ fontSize: 15, margin: '8px 0 0' }}>Your testimonials</h3>}
      {(state.data ?? []).map((t) => (
        <section key={t.id} className="section" aria-label={`Testimonial from ${t.personName}`} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, gap: 6 }}>
          <div className="row" style={{ padding: 0 }}><span className="small muted">{friendlyDate(t.createdAt.slice(0, 10))}</span><StatusPill t={t} /></div>
          <Quote t={t} />
          {confirm !== t.id
            ? <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(t.id)}>Withdraw</button>
            : (
              <div className="meta">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => withdraw(t.id)}>Yes, withdraw it</button>
                <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)}>Keep it</button>
              </div>
            )}
        </section>
      ))}
    </section>
  );
}

/** Admin → Testimonials: every club's, with Approve, Hide and Featured. */
export function TestimonialsAdmin({ b }: { b: ClubBackend }) {
  const state = useLoad(() => b.adminTestimonials(), [b]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function set(t: Testimonial, status: 'approved' | 'hidden', featured: boolean, ok: string) {
    setBusy(true); setMsg(null);
    try { await b.setTestimonial(t.id, status, featured); setMsg({ ok: true, text: ok }); state.reload(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const list = state.data ?? [];
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>Every club’s testimonial. Each one has the club’s permission to use it on the website and social media. Featured ones are for the website and pitch decks.</p>
      <Status error={state.error} loading={state.loading && !state.data} />
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {state.data && list.length === 0 && <p className="small muted" style={{ margin: 0 }}>No testimonials yet.</p>}
      {list.map((t) => (
        <section key={t.id} className="card section" aria-label={`Testimonial from ${t.club ?? 'a club'}`}>
          <div className="row" style={{ padding: 0 }}><b style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{t.club}</b><StatusPill t={t} /></div>
          <Quote t={t} />
          <div className="small muted">{friendlyDate(t.createdAt.slice(0, 10))}</div>
          <div className="meta">
            {t.status !== 'approved' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => set(t, 'approved', false, 'Approved')}>Approve</button>}
            {t.status === 'approved' && (
              <button type="button" className="btn btn-outline" aria-pressed={t.featured} disabled={busy} onClick={() => set(t, 'approved', !t.featured, t.featured ? 'No longer featured' : 'Featured')}>
                {t.featured ? '★ Featured' : '☆ Feature'}
              </button>
            )}
            {t.status !== 'hidden' && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => set(t, 'hidden', false, 'Hidden')}>Hide</button>}
          </div>
        </section>
      ))}
    </>
  );
}
