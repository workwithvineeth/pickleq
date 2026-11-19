import { useMemo, type ReactNode } from 'react';
import { OrgShell, PageHead } from '../../rallyq/shell/Shell';
import { DeskFrame } from './DeskFrame';
import { newId } from '../../db/ids';
import type { Go } from '../../navigation';
import type { ClubBackend, ScorePatch } from '../backend';
import { knockoutMatchesToAdd } from '../plan';
import { isStaff, STAGE_LABEL } from '../types';
import { DemoNote, names, Status, useLoad } from './common';
import { useClubBackend, useDesk } from './deskContext';
import { readUnsent, ScorePad, writeUnsent } from './ScorePad';

/** Sends any scores saved while the phone had no connection (signed-in scorers). */
export async function flushUnsentScores(b: ClubBackend): Promise<number> {
  const all = readUnsent();
  let sent = 0;
  for (const [id, patch] of Object.entries(all)) {
    if (id.startsWith('link:') || id.startsWith('desk:')) continue;
    try { await b.saveScore(id, patch); delete all[id]; sent++; } catch { break; }
  }
  writeUnsent(all);
  return sent;
}

/** Scoring a match as a signed-in organiser, or at the desk (desk link and desk PIN). */
export function ScoreMatch({ matchId, go, onBack }: { matchId: string; go?: Go; onBack: () => void }) {
  const b = useClubBackend();
  const desk = useDesk();
  const state = useLoad(async () => { if (!b) throw new Error('Open Club mode first'); return b.matchBundle(matchId); }, [b, matchId]);
  const d = state.data;
  const players = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  // Court Green v1.2 frame: the organiser's own shell, or the desk frame at the desk. Scoring is unchanged.
  const frame = (body: ReactNode) => (desk || !go
    ? <DeskFrame clubName={d?.club.name}>{body}</DeskFrame>
    : <OrgShell go={go} active="desk" clubName={d?.club.name} clubId={d?.club.id} tournament={d?.tournament ? { id: d.tournament.id, name: d.tournament.name, slug: d.tournament.publicSlug } : undefined}>{body}</OrgShell>);
  const head = (title: string) => <PageHead cap={capOf(d?.match)} title={<span id="score-title">{title}</span>} actions={<button type="button" className="btn ghost sm" onClick={onBack}>Back</button>} />;
  if (!d || !b) return frame(<div className="pq-matchday pq-referee rq-referee" aria-labelledby="score-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{head('Score')}<Status error={state.error} loading={state.loading} /></div>);
  const m = d.match;
  const title = m.stage === 'friendly' ? 'Club match' : `${d.divisionName ?? ''} ${STAGE_LABEL[m.stage]}`.trim();
  const send = (patch: ScorePatch) => b.saveScore(matchId, patch);
  async function finished() {
    // Draw the next knockout round if this result completes one.
    if (m.tournamentId && b) {
      const t = await b.tournamentBundle(m.tournamentId);
      const add = knockoutMatchesToAdd(t.tournament, t.divisions, t.entries, t.matches, newId);
      if (add.length) await b.addMatches(add);
    }
    onBack();
  }
  return (
    frame(<div className="pq-matchday pq-referee rq-referee" aria-labelledby="score-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {head(title || 'Score')}
      <DemoNote b={b} />
      {!isStaff(d.role) && <div role="alert" className="msg msg-bad">Only the club’s organisers and the desk can score matches.</div>}
      <ScorePad
        key={m.id}
        matchKey={desk ? `desk:${desk.token}:${m.id}` : m.id}
        initialGames={m.games}
        format={m.format}
        nameA={names(m.sideA, players)}
        nameB={names(m.sideB, players)}
        doubles={m.sideA.length > 1}
        thresholds={d.club.settings.thresholds}
        playedOn={m.playedOn}
        send={send}
        onFinished={finished}
        canScore={isStaff(d.role) && m.status !== 'done' && m.status !== 'void'}
      />
    </div>)
  );
}

/** Court and state: LIVE while scoring, Final only once the result is saved. */
const capOf = (m?: { court?: number; status: string }) => [m?.court ? `Court ${m.court}` : '', m?.status === 'done' ? 'Final' : m?.status === 'void' ? 'Cancelled' : 'LIVE'].filter(Boolean).join(' · ');
