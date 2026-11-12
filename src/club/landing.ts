import type { ClubBackend } from './backend';
import { isStaff } from './types';

/** Where RallyQ opens after sign-in: people who run a club (or RallyQ admins) get My clubs; players get their Player Studio. */
export type Landing = 'club' | 'club-player-studio';

export async function landingAfterSignIn(b: Pick<ClubBackend, 'isPlatformAdmin' | 'myClubs'>): Promise<Landing> {
  try {
    if (await b.isPlatformAdmin().catch(() => false)) return 'club';
    const clubs = await b.myClubs();
    return clubs.some((c) => isStaff(c.role)) ? 'club' : 'club-player-studio';
  } catch {
    // If we can't tell, My clubs is the safe page: it works for everyone.
    return 'club';
  }
}
