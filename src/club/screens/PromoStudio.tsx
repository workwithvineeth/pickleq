import { useMemo, useState } from 'react';
import { downloadBlob, promoPng, promoSvg, promoSvgWithFonts, PROMO_TEMPLATES, type PromoTemplate } from '../promoArt';
import { friendlyDate, friendlyTime } from '../dates';
import { appLink, errorText } from './common';

export interface PromoEvent { id: string; name: string; club: string; startDate: string; startTime: string; courts?: number; slug: string; fee?: string }

/** Promotion studio (Phase 3): pick a format and an event; the artwork fills itself in; edit the words; download PNG or SVG. */
export function PromoStudio({ events, initialId }: { events: PromoEvent[]; initialId?: string }) {
  const [tpl, setTpl] = useState<PromoTemplate>('launch');
  const [id, setId] = useState(initialId ?? events[0]?.id ?? '');
  const ev = events.find((e) => e.id === id) ?? events[0];
  const [edits, setEdits] = useState<Record<string, { headline?: string; subline?: string; cta?: string; champions?: string; runnersUp?: string; bronze?: string; score?: string }>>({});
  const e = edits[ev?.id ?? ''] ?? {};
  const set = (k: keyof typeof e, v: string) => ev && setEdits((x) => ({ ...x, [ev.id]: { ...x[ev.id], [k]: v } }));
  const [msg, setMsg] = useState<string | null>(null);
  const input = useMemo(() => ev && ({
    template: tpl, club: ev.club, headline: e.headline ?? ev.name,
    subline: e.subline ?? `${friendlyDate(ev.startDate)} · ${friendlyTime(ev.startTime)}${ev.courts ? ` · ${ev.courts} courts` : ''}`,
    cta: e.cta ?? (tpl === 'results' ? 'See every match' : 'Register on PaddleQ'),
    url: appLink(tpl === 'results' ? `#/results/${ev.slug}` : `#/event/${ev.slug}`),
    date: friendlyDate(ev.startDate), time: friendlyTime(ev.startTime), courts: ev.courts, fee: ev.fee,
    podium: { champions: e.champions, runnersUp: e.runnersUp, bronze: e.bronze, score: e.score },
  }), [ev, tpl, e]);
  if (!ev || !input) return <p className="small muted">Create a tournament first; its artwork appears here.</p>;
  const meta = PROMO_TEMPLATES.find((x) => x.id === tpl)!;
  const file = `paddleq-${tpl}-${ev.slug || ev.id}`;
  async function dl(kind: 'png' | 'svg') {
    setMsg(null);
    try {
      if (kind === 'png') downloadBlob(`${file}.png`, await promoPng(input!));
      else downloadBlob(`${file}.svg`, new Blob([await promoSvgWithFonts(input!)], { type: 'image/svg+xml' }));
      setMsg(`Downloaded ${file}.${kind}`);
    } catch (err) { setMsg(errorText(err)); }
  }
  return (
    <section className="section pq-studio" aria-label="Promotion studio">
      <div className="pq-studio-grid">
        <div className="section">
          <label className="label" htmlFor="promo-event">Event</label>
          <select id="promo-event" className="input" value={ev.id} onChange={(x) => setId(x.target.value)}>
            {events.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.club}</option>)}
          </select>
          <div className="section" role="radiogroup" aria-label="Format">
            {PROMO_TEMPLATES.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={x.id === tpl} className={`pq-choice${x.id === tpl ? ' on' : ''}`} onClick={() => setTpl(x.id)}>
                <b>{x.label}</b><span className="small muted">{x.w} × {x.h} · {x.use}</span>
              </button>
            ))}
          </div>
          <label className="label" htmlFor="promo-head">Headline</label>
          <input id="promo-head" className="input" maxLength={42} value={input.headline} onChange={(x) => set('headline', x.target.value)} />
          <label className="label" htmlFor="promo-sub">Line under it</label>
          <input id="promo-sub" className="input" maxLength={60} value={input.subline} onChange={(x) => set('subline', x.target.value)} />
          {tpl === 'results' && <>
            <label className="label" htmlFor="promo-champ">Champions</label>
            <input id="promo-champ" className="input" maxLength={40} value={e.champions ?? ''} onChange={(x) => set('champions', x.target.value)} placeholder="e.g. A. Reddy / D. Iyer" />
            <label className="label" htmlFor="promo-score">Final score</label>
            <input id="promo-score" className="input" maxLength={12} value={e.score ?? ''} onChange={(x) => set('score', x.target.value)} placeholder="15–9" />
            <label className="label" htmlFor="promo-ru">Runners-up</label>
            <input id="promo-ru" className="input" maxLength={40} value={e.runnersUp ?? ''} onChange={(x) => set('runnersUp', x.target.value)} />
          </>}
          {tpl !== 'results' && tpl !== 'poster' && <>
            <label className="label" htmlFor="promo-cta">Button text</label>
            <input id="promo-cta" className="input" maxLength={30} value={input.cta} onChange={(x) => set('cta', x.target.value)} />
          </>}
        </div>
        <div className="section">
          <div className="pq-studio-preview" aria-label={`${meta.label} preview`} style={{ maxWidth: tpl === 'story' ? 320 : tpl === 'poster' ? 420 : 520 }}
            // Built from fixed shapes and the escaped words above; no outside content.
            dangerouslySetInnerHTML={{ __html: promoSvg(input).replace(/width="\d+" height="\d+"/, 'width="100%"') }} />
          <div className="meta" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => void dl('png')}>Download PNG</button>
            <button type="button" className="btn btn-outline" onClick={() => void dl('svg')}>Download SVG (editable)</button>
          </div>
          {tpl === 'poster' && <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Scan the QR with your phone before printing. It opens {input.url.replace(/^https?:\/\//, '')}.</p>}
          {msg && <p role="status" className="small" style={{ margin: 0, textAlign: 'center' }}>{msg}</p>}
        </div>
      </div>
    </section>
  );
}
