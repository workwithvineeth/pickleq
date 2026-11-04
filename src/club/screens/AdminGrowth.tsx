import { useEffect, useState } from 'react';
import type { Go } from '../../navigation';
import { BrandMark } from './Brand';

const artwork = import.meta.glob<string>('./growthAssets/*.svg', { eager: true, query: '?url', import: 'default' });
const brandFiles = [
  ['Official PaddleQ mark', 'PaddleQ-BrandMark.svg'],
  ['Social profile', 'profile.svg'],
  ['Social cover', 'cover.svg'],
  ['Launch post', 'launch-post.svg'],
  ['Launch story', 'launch-story.svg'],
  ['Results announcement', 'results-celebration.svg'],
];
const clubFiles = [
  ['Tournament poster', 'PaddleQ-tournament-poster.svg'],
  ['Poster with QR slot', 'qr-poster.svg'],
];

function Artwork({ files }: { files: string[][] }) {
  return <ul style={{ paddingLeft: 20 }}>
    {files.map(([label, file]) => {
      const href = artwork['./growthAssets/' + file];
      return <li key={file} style={{ marginBlock: 8 }}>
        <strong>{label}</strong>{' · '}
        <a href={href} target="_blank" rel="noreferrer" aria-label={'Preview ' + label}>Preview</a>{' · '}
        <a href={href} download={file} aria-label={'Download ' + label}>Download</a>
      </li>;
    })}
  </ul>;
}

export function BrandClubKits({ go }: { go: Go }) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => () => files.forEach(({ url }) => URL.revokeObjectURL(url)), [files]);
  return <>
    <section className="pq-flow" aria-label="PaddleQ brand">
      <BrandMark size={64} />
      <h3 className="pq-flow-title">Brand &amp; Growth Centre</h3>
      <p className="pq-flow-sub">Artwork, club onboarding and demo materials for review.</p>
    </section>
    <section className="card section">
      <h3 style={{ margin: 0 }}>PaddleQ Branding Kit</h3>
      <p className="small muted">Official mark and editable artwork. Draft promotional templates require approval before publishing.</p>
      <p>Maroon #7A1F2B · Cream #F3EBDD · Card #FBF7F0 · Text #2B1D17 · Muted #6E5E52 · Border #E3D5BF</p>
      <p>Fraunces headings · DM Sans body. Place the mark on maroon and preserve its proportions.</p>
      <Artwork files={brandFiles} />
    </section>
    <section className="card section">
      <h3 style={{ margin: 0 }}>Club Acquisition &amp; Demonstration Kits</h3>
      <p className="small muted">Verify the entry URL and scan the finished QR poster before sharing.</p>
      <Artwork files={clubFiles} />
      <button type="button" className="btn btn-outline" onClick={() => go('demo')}>Open the isolated demo club</button>
      <details><summary>Club onboarding, referee and payments</summary>
        <p>Agree the format, courts and desk lead. Rehearse one match. Check approval, board visibility and registration separately.</p>
        <p>Players pay the club directly. Check a claimed UPI reference against the club’s account before confirming payment.</p>
        <p>Give scorers their court links privately. Check both sides and the final score. Escalate discrepancies to the desk before sharing results.</p>
      </details>
      <details><summary>Club outreach copy · draft</summary>
        <p>Would you try PaddleQ on one doubles division? Share a tentative date and court count and we’ll check whether the format fits.</p>
      </details>
    </section>
    <section className="card section">
      <h3 style={{ margin: 0 }}>Private review files</h3>
      <p className="small muted">Select the pitch, guides, videos or campaign files from your device. They stay in this browser tab. Historical footage and silent sample storyboards are for review. Verified current-candidate footage is pending.</p>
      <label>Choose review files <input className="input" type="file" multiple onChange={(e) => {
        setFiles(Array.from(e.currentTarget.files ?? [], (file) => ({ name: file.name, url: URL.createObjectURL(file) })));
      }} /></label>
      {files.length > 0 && <ul>
        {files.map(({ name, url }) => <li key={url}><a href={url} download={name}>{name}</a></li>)}
      </ul>}
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
