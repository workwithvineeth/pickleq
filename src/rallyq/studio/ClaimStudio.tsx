import type { Go } from '../../navigation';
import { serverBackend } from '../../club/index';
import { useLoad } from '../../club/screens/common';
import type { FoundPlayer } from '../../club/playerStudio';

export interface ClaimCard { title: string; lines: string[]; found: { playerId: string; label: string }[] }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What the "Claim my Studio" card says. Players found by your sign-in email (or your online entries) get a claim button
 * each; with none found it explains the two ways results reach your Studio, so nobody is left guessing.
 */
export function claimCard(found: FoundPlayer[], email: string | undefined, claimed: number): ClaimCard | null {
  if (found.length) {
    return {
      title: found.length === 1 ? 'We found your matches' : 'We found matches that may be yours',
      lines: ['From tournaments where the organiser has your email, or that you entered with this account. Claim them to add them to your Player Studio.'],
      found: found.map((f) => ({ playerId: f.playerId, label: `${f.name} · ${f.club} · ${plural(f.matches, 'match', 'matches')}` })),
    };
  }
  if (claimed > 0) return null;
  return {
    title: 'Claim my Studio',
    lines: [
      `Enter tournaments with this email${email ? ` (${email})` : ''}. After your matches are scored, they show up here to claim.`,
      'Entered by the organiser with another email, or none? Ask them for your claim link (Results & DUPR → Claim links) and open it while signed in.',
    ],
    found: [],
  };
}

/** The Studio's claim card: never blocks the page, and says nothing if there is nothing to claim and you have claimed already. */
export function ClaimStudio({ go, claimed }: { go: Go; claimed: number }) {
  const b = serverBackend();
  const state = useLoad(async () => {
    if (!b) return null;
    const [found, user] = await Promise.all([b.foundPlayers().catch(() => [] as FoundPlayer[]), b.currentUser().catch(() => null)]);
    return claimCard(found, user?.email ?? undefined, claimed);
  }, [b, claimed]);
  const card = state.data;
  if (!card) return null;
  return (
    <section aria-labelledby="claim-studio-title" style={{ background: '#D9F24A', color: '#0B2418', borderRadius: 28, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 id="claim-studio-title" className="disp" style={{ fontSize: 26, margin: 0 }}>{card.title}</h2>
      {card.lines.map((l) => <p key={l} style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{l}</p>)}
      {card.found.map((f) => (
        <div key={f.playerId} className="between" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>{f.label}</b>
          <button type="button" className="btn sm" style={{ background: '#0B2418', color: '#D9F24A', minHeight: 44 }} onClick={() => go('club-claim', `p.${f.playerId}`)}>Claim my Studio</button>
        </div>
      ))}
    </section>
  );
}
