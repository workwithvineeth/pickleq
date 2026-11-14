import type { ClubBackend } from './backend';
import { isStaff } from './types';

/** Where RallyQ opens after sign-in: people who run a club (or RallyQ admins) get My clubs; players get their Player Studio. */
export type Landing = 'club' | 'club-player-studio';

const CHOICE_KEY = 'rq-landing-choice';

/** What this person picked on the "Where to?" screen after signing in (kept on this phone). */
export function readChoice(): Landing | null {
  try { const v = localStorage.getItem(CHOICE_KEY); return v === 'club' || v === 'club-player-studio' ? v : null; } catch { return null; }
}
export function writeChoice(l: Landing): void {
  try { localStorage.setItem(CHOICE_KEY, l); } catch { /* A blocked store only means we ask again next time. */ }
}

/** Where this person opens after signing in: what they picked on "Where to?", else our guess from their clubs. */
export async function landingAfterSignIn(b: Pick<ClubBackend, 'isPlatformAdmin' | 'myClubs'>): Promise<Landing> {
  return readChoice() ?? guessLanding(b);
}

/** The guess alone: people who run a club (or RallyQ admins) get My clubs, everyone else their Player Studio. The header
 * uses this for its My clubs link, so picking "I'm a player" never hides a club you run. */
export async function guessLanding(b: Pick<ClubBackend, 'isPlatformAdmin' | 'myClubs'>): Promise<Landing> {
  try {
    if (await b.isPlatformAdmin().catch(() => false)) return 'club';
    const clubs = await b.myClubs();
    return clubs.some((c) => isStaff(c.role)) ? 'club' : 'club-player-studio';
  } catch {
    // If we can't tell, My clubs is the safe page: it works for everyone.
    return 'club';
  }
}
