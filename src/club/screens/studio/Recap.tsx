import { useSkin } from '../../../components/ThemeSwitch';
import { useEffect, useMemo, useRef, useState } from 'react';
import { friendlyDate } from '../../dates';
import { buildRecaps, recapCaption } from '../../recap';
import { canvasBlob, drawRecap } from '../../recapCard';
import type { StudioData } from '../../playerStudio';

/** Player Studio → Home: a shareable recap image of one tournament (your name, club and results only). */
export function RecapShare({ data }: { data: StudioData }) {
  const skin=useSkin();
  const recaps = useMemo(() => buildRecaps(data.official), [data.official]);
  const [key, setKey] = useState(recaps[0]?.key ?? '');
  const [img, setImg] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const r = recaps.find((x) => x.key === key) ?? recaps[0];
  const name = (r && data.players.find((p) => p.club === r.club)?.name) || data.players[0]?.name || 'Me';

  useEffect(() => {
    if (!r || typeof document === 'undefined') return;
    let live = true;
    const cv = canvas.current ?? document.createElement('canvas');
    canvas.current = cv;
    setImg(undefined);
    drawRecap(cv, r, name).then(() => { if (live) setImg(cv.toDataURL('image/png')); }).catch(() => { if (live) setMsg({ ok: false, text: 'This browser can’t make the image. Try Chrome or Safari.' }); });
    return () => { live = false; };
  }, [r, name, skin]);

  if (!r) return null;
  const file = async () => new File([await canvasBlob(canvas.current!)], `${r.tournament.replace(/[^\w-]+/g, '-')}-recap.png`, { type: 'image/png' });
  async function share() {
    setMsg(undefined);
    try {
      const f = await file();
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], text: recapCaption(r!, name) }); return; }
      download(f);
      setMsg({ ok: true, text: 'Saved the image. Post it on WhatsApp or Instagram from your photos.' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg({ ok: false, text: 'Couldn’t share. Use Save image instead.' });
    }
  }
  function download(f: File) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a'); a.href = url; a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="card section pq-recap" aria-label="Share your recap">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>Share your recap</h2></div>
      {recaps.length > 1 && <label className="field"><span className="small">Tournament</span>
        <select className="input" value={r.key} onChange={(e) => setKey(e.target.value)} aria-label="Tournament for the recap">
          {recaps.map((x) => <option key={x.key} value={x.key}>{x.tournament}{x.division ? ` · ${x.division}` : ''} ({friendlyDate(x.date)})</option>)}
        </select>
      </label>}
      <div className="pq-recap-body">
        <div className="pq-recap-preview">
          {img ? <img src={img} alt={`Recap: ${name}, ${r.tournament}, ${r.finish}, won ${r.won} of ${r.played}`} /> : <div className="pq-recap-wait" role="status">Making your image…</div>}
        </div>
        <div className="pq-recap-side">
          <p style={{ margin: 0 }}><b>{r.headline}</b></p>
          <p className="small muted" style={{ margin: 0 }}>{r.won}–{r.lost} · {r.pointsFor}–{r.pointsAgainst} points{r.comeback ? ` · came back from ${r.comeback.from}` : ''}</p>
          <p className="small muted" style={{ margin: 0 }}>Only your name, club and results are on the image. No partner, opponent, phone or email.</p>
          <div className="meta">
            <button type="button" className="btn btn-primary" disabled={!img} onClick={share}>Share</button>
            <button type="button" className="btn btn-outline" disabled={!img} onClick={async () => { download(await file()); setMsg({ ok: true, text: 'Image saved.' }); }}>Save image</button>
          </div>
          {msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
        </div>
      </div>
    </section>
  );
}
