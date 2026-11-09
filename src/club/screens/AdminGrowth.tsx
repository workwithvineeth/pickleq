import { artworkPalette, currentSkin, SKINS } from '../../skin';
import { useSkin } from '../../components/ThemeSwitch';
import { useState } from 'react';
import { eventsBackend } from '../index';
import { Status, useLoad } from './common';
import { downloadBlob } from '../promoArt';
import { Q_PATH } from '../../components/Logo';
import { PromoStudio, type PromoEvent } from './PromoStudio';
import type { Go } from '../../navigation';
import { BrandMark } from './Brand';

function logoSvg(tile: 'maroon' | 'cream') {
  const art=artworkPalette(); const bg=tile==='maroon'?art.brand:art.hero,fg=tile==='maroon'?art.onBrand:art.chalk;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024"><rect width="512" height="512" rx="112" fill="${bg}"/><svg x="66.6" y="66.6" width="378.9" height="378.9" viewBox="0 0 260 260"><g transform="rotate(-28 130 130)"><rect x="72" y="16" width="116" height="150" rx="54" fill="${fg}"/><rect x="119" y="160" width="22" height="14" fill="${fg}"/><rect x="113" y="170" width="34" height="80" rx="12" fill="${fg}" fill-opacity="0.6"/><path transform="translate(89.75 124) scale(0.052 -0.052)" d="${Q_PATH}" fill="${bg}"/></g><circle cx="212" cy="54" r="24" fill="${fg}"/></svg></svg>`;
}

/** Admin → Brand kit and promotion studio: the official logos and colours, and event artwork that fills itself in. */
export function BrandClubKits({ go }: { go: Go }) {
  useSkin(); const art=artworkPalette();
  const LOGO_FILES=[{id:"primary-tile",label:"App icon · "+SKINS[currentSkin()].name,use:"Profile and app icon",bg:art.brand,tile:"maroon" as const},{id:"reverse-tile",label:"Reversed mark",use:"On dark photos and panels",bg:art.hero,tile:"cream" as const}];
  const COLOURS=[["Brand",art.brand,"Buttons and highlights"],["Chalk",art.chalk,"Text on dark panels"],["Night",art.hero,"Hero and stream backgrounds"],["Ink",art.ink,"Text on light panels"],["Muted",art.muted,"Secondary text"],["Court",art.court,"Court graphics"],["Text accent",art.brandText,"Text on light panels"],["Line",art.line,"Borders and dividers"],["Gold",art.gold,"Winners and game point"],["Alert",art.error,"Errors only"]];
  const b = eventsBackend();
  const state = useLoad(() => b.adminTournaments(), [b]);
  const events: PromoEvent[] = (state.data ?? []).filter((t) => !t.isTest).map((t) => ({ id: t.id, name: t.name, club: t.club, startDate: t.startDate, startTime: t.startTime, slug: t.slug }));
  return <>
    <section className="pq-flow" aria-label="PaddleQ brand">
      <BrandMark size={64} />
      <h3 className="pq-flow-title">Brand kit</h3>
      <p className="pq-flow-sub">Out of the kitchen, into the stats.</p>
    </section>
    <section className="card section" aria-label="Logos">
      <h2 style={{ fontSize: 18 }}>Logos</h2>
      <div className="pq-kit-grid">
        {LOGO_FILES.map((l) => (
          <div key={l.id} className="pq-kit-tile">
            <div style={{ background: l.bg, borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: logoSvg(l.tile).replace('width="1024" height="1024"', 'width="96" height="96"') }} />
            <b>{l.label}</b><span className="small muted">{l.use}</span>
            <button type="button" className="btn btn-outline" onClick={() => downloadBlob(`paddleq-${l.id}.svg`, new Blob([logoSvg(l.tile)], { type: 'image/svg+xml' }))}>Download {l.label} (SVG)</button>
          </div>
        ))}
      </div>
    </section>
    <section className="card section" aria-label="Colours and type">
      <h2 style={{ fontSize: 18 }}>Colours and type</h2>
      <div className="pq-kit-grid">
        {COLOURS.map(([n, h, u]) => (
          <div key={h} className="pq-kit-swatch"><span style={{ background: h }} /><b>{n}</b><span className="small">{h}</span><span className="small muted">{u}</span></div>
        ))}
      </div>
      <p className="small" style={{ margin: 0 }}>Headings: <b style={{ fontFamily: 'var(--font-display)' }}>{currentSkin()==="axis"?"Archivo 800 · 66%":"Fraunces 600"}</b>. Everything else: DM Sans. Filled brand buttons use their paired foreground; text, borders and charts follow the selected skin.</p>
    </section>
    <section className="card section" aria-label="Promotion studio">
      <h2 style={{ fontSize: 18 }}>Promotion studio</h2>
      <Status error={state.error} loading={state.loading && !state.data} />
      {state.data && <PromoStudio events={events} />}
      <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start' }} onClick={() => go('demo')}>Open the demo club</button>
    </section>
  </>;
}
// Fictional campaign rows from Agent 06 emergency BI handoff.
const campaignRows = [
  { date: '2026-10-19', channel: 'instagram', campaign: 'club-open', content: 'Tournament day reel', impressions: 4200, engagements: 206, websiteSessions: 94, tournamentSessions: 64, resultsSessions: 18, qrScans: 0, enquiries: 4, registrationSessions: 9 },
  { date: '2026-10-26', channel: 'instagram', campaign: 'club-open', content: 'Club setup carousel', impressions: 5800, engagements: 301, websiteSessions: 135, tournamentSessions: 80, resultsSessions: 42, qrScans: 0, enquiries: 6, registrationSessions: 14 },
  { date: '2026-10-27', channel: 'facebook', campaign: 'club-open', content: 'Organiser walkthrough', impressions: 3100, engagements: 127, websiteSessions: 84, tournamentSessions: 45, resultsSessions: 29, qrScans: 0, enquiries: 3, registrationSessions: 7 },
  { date: '2026-11-01', channel: 'qr', campaign: 'rally-day', content: 'Venue poster', impressions: null, engagements: null, websiteSessions: 117, tournamentSessions: 99, resultsSessions: 52, qrScans: 144, enquiries: 5, registrationSessions: 21 },
];
const metrics = [
  ['websiteSessions', 'Website sessions'], ['tournamentSessions', 'Tournament page sessions'], ['resultsSessions', 'Results page sessions'],
  ['qrScans', 'QR scans'], ['enquiries', 'Club enquiries'], ['registrationSessions', 'Attributed registration sessions'],
] as const;

export function MarketingPerformance({ previewOnly = false }: { previewOnly?: boolean }) {
  const [sample, setSample] = useState(false);
  const [from, setFrom] = useState('');
  const [through, setThrough] = useState('');
  const [channel, setChannel] = useState('');
  const [campaign, setCampaign] = useState('');
  const shown = campaignRows.filter((row) => (!from || row.date >= from) && (!through || row.date <= through) && (!channel || row.channel === channel) && (!campaign || row.campaign === campaign));
  const total = (key: typeof metrics[number][0]) => shown.reduce((sum, row) => sum + row[key], 0);
  return <>
    {!previewOnly && <label className="card section">
      <span><input type="checkbox" checked={sample} onChange={(e) => { setSample(e.currentTarget.checked); setFrom(''); setThrough(''); setChannel(''); setCampaign(''); }} /> Sample Data Preview</span>
      <span className="small muted">Fictional metrics are shown only in this view.</span>
    </label>}
    {!sample && !previewOnly ? <section className="card section">
      <h3 style={{ margin: 0 }}>Real Data · Not connected</h3>
      <p className="small muted">Instagram, Facebook and campaign attribution are not connected. Website, event, results and QR traffic are unavailable here.</p>
      <p>Review available accounts in <a href="https://business.facebook.com/" target="_blank" rel="noreferrer">Meta Business Suite</a>. An approved account connection and measurement setup are required before PaddleQ can report live campaign results.</p>
    </section> : <>
      <p className="msg" role="status">Sample Data Preview · fictional metrics. No production reporting or writes.</p>
      <section className="card section" aria-label="Campaign filters"><label>From (IST)<input type="date" className="input" value={from} onChange={(e) => setFrom(e.currentTarget.value)} /></label><label>Through (IST)<input type="date" className="input" value={through} onChange={(e) => setThrough(e.currentTarget.value)} /></label>
        {([

          ['Channel', channel, setChannel, ['instagram', 'facebook', 'qr']],
          ['Campaign', campaign, setCampaign, ['club-open', 'rally-day']],
        ] as const).map(([label, value, setValue, choices]) => <label key={label}>{label}
          <select className="input" value={value} onChange={(e) => setValue(e.currentTarget.value)}>
            <option value="">All</option>
            {choices.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>)}
      </section>
      <section className="card section">
        <h3 style={{ margin: 0 }}>Campaign overview</h3>
        {shown.length ? <dl>
          {metrics.map(([key, label]) => <div className="row" key={key}><dt>{label}</dt><dd>{total(key)}</dd></div>)}
          <div className="row"><dt>Registration conversion · attributed registration sessions / tournament page sessions</dt><dd>{(100 * total('registrationSessions') / total('tournamentSessions')).toFixed(1)}%</dd></div>
        </dl> : <p className="muted">No sample campaigns match these filters.</p>}
      </section>
      <section className="card section">
        <h3 style={{ margin: 0 }}>Growth and attribution</h3>
        {shown.length > 0 && <ul>{[...shown].sort((a, b) => b.registrationSessions - a.registrationSessions).map((row) =>
          <li key={row.content}>{row.date} · {row.channel} · {row.content} · {row.registrationSessions} attributed registration sessions{row.impressions !== null && ` · ${row.impressions} impressions / ${row.engagements} engagements`}</li>)}</ul>}
        <p className="small muted">Sample club funnel · 12 qualified → 9 invited → 7 confirmed organisers → 6 clubs created. All sample campaigns, independent of filters.</p>
        <p className="small muted">Sample upcoming campaign · Club demo week · 9 November · Draft.</p>
      </section>
    </>}
  </>;
}

const circuitExamples = [
  { title: 'Interclub Circuit', names: ['Cedar Court Pickleball', 'Lakeview Rally Club'] },
  { title: 'Individual player Circuit', names: ['Demo Player A', 'Demo Player B'] },
];

export function CircuitPreview() {
  const [sample, setSample] = useState(false);
  return <>
    <label className="card section">
      <span><input type="checkbox" checked={sample} onChange={(e) => setSample(e.currentTarget.checked)} /> Sample Data Preview</span>
    </label>
    {sample ? <>
      <p className="msg" role="status">Fictional display order for demonstration only.</p>
      {circuitExamples.map(({ title, names }) => <section className="card section" key={title}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <ol>{names.map((name) => <li key={name}>{name}</li>)}</ol>
      </section>)}
    </> : <p className="muted">Real Data · Rankings are unavailable pending rulebook approval.</p>}
  </>;
}

export function AdminOverviewPreview() {
  // Fictional overview values from the Agent 06 emergency BI handoff.
  return <>
    <p className="msg" role="status">Demo Preview · Fictional data. No production records or writes.</p>
    <section className="card section">
      <h3 style={{ margin: 0 }}>Clubs and tournaments</h3>
      <p>12 qualified clubs · 9 invited · 7 confirmed organisers · 6 clubs created</p>
      <p><strong>Cedar Court Rally Day</strong> · Approved and listed · Entries closed · 3 courts · 32 completed matches</p>
    </section>
    <section className="card section">
      <h3 style={{ margin: 0 }}>Registration and payments</h3>
      <p>28 submitted · 24 accepted · 2 pending · 2 withdrawn</p>
      <p>14 club-confirmed payments · 12 matched to the club ledger</p>
    </section>
    <h3 style={{ margin: 0 }}>Marketing Performance</h3>
    <MarketingPerformance previewOnly />
  </>;
}
