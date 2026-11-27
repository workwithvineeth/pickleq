import type { Go } from '../../navigation';
import { PageHead, PublicShell } from '../../rallyq/shell/Shell';
import { friendlyDate } from '../dates';
import { GRIEVANCE, NOTICE, NOTICE_VERSION } from '../privacy';

/** Public privacy notice (DPDP Act 2023): what RallyQ collects, who sees it, rights, and who to complain to. */
export function PrivacyNotice({ go }: { go: Go }) {
  return (
    <PublicShell go={go}>
      <PageHead cap={<span className="acc">Privacy</span>} title="Your data on RallyQ." sub={`Updated ${friendlyDate(NOTICE_VERSION)}`} />
      {NOTICE.map((s) => (
        <section key={s.title} className="card" aria-label={s.title} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{s.title}</h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
        </section>
      ))}
      <section className="card" aria-label="Complaints" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Questions or complaints</h2>
        <p style={{ margin: 0 }}>Write to the {GRIEVANCE.role} at <a href={`mailto:${GRIEVANCE.email}`}>{GRIEVANCE.email}</a>. We reply within {GRIEVANCE.replyDays} days and act within {GRIEVANCE.actDays} days. If you are not happy with our answer, you can complain to the Data Protection Board of India.</p>
      </section>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <button type="button" className="btn" onClick={() => go('club-player-studio', 'profile')}>Manage my data</button>
        <button type="button" className="btn ghost" onClick={() => go('events')}>Back to events</button>
      </div>
    </PublicShell>
  );
}
