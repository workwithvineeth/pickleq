import { db } from '../db/db';
import { addMatch, activeMatches, type NewMatch } from '../db/matches';
import { activeSessions } from '../db/training';
import { recordSummary } from '../domain/record';
import { CLOSE_MARGIN } from '../domain/stats';
import { tagStats } from '../domain/insights';
import { drillStats, iso } from '../domain/training';
import type { Match, TrainingSession } from '../domain/types';
import type { ClubBackend } from './backend';
import { clubMatchToPersonal } from './domain/toPersonal';
import type { Share, SummaryData } from './types';

/** Club matches you played that aren't in your personal PICKLEQ yet (including ones you later deleted, so they don't come back). */
export async function pendingClubMatches(b: ClubBackend): Promise<NewMatch[]> {
  const all = await db.matches.toArray();
  const have = new Set(all.map((m) => m.club?.matchId).filter(Boolean));
  const out: NewMatch[] = [];
  for (const c of await b.myClubMatches()) {
    const players = new Map(c.players.map((p) => [p.id, p]));
    const tname = new Map(c.tournaments.map((t) => [t.id, t.name]));
    for (const m of c.matches) {
      if (have.has(m.id)) continue;
      const nm = clubMatchToPersonal(m, c.playerId, players, c.club.name, m.tournamentId ? tname.get(m.tournamentId) : undefined, c.club.settings.thresholds);
      if (nm) out.push(nm);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function importClubMatches(list: NewMatch[]): Promise<number> {
  const all = await db.matches.toArray();
  const have = new Set(all.map((m) => m.club?.matchId).filter(Boolean));
  let n = 0;
  for (const m of list) {
    if (m.club && have.has(m.club.matchId)) continue;
    await addMatch(m);
    if (m.club) have.add(m.club.matchId);
    n++;
  }
  return n;
}

/** The numbers you'd share with your club, worked out on this phone from your personal data. Only the parts you switched on. */
export function buildSummary(share: Share, matches: Match[], sessions: TrainingSession[], today = new Date()): SummaryData {
  const out: SummaryData = { generatedAt: today.toISOString() };
  const live = matches.filter((m) => m.deletedAt === undefined);
  if (share.record) {
    const r = recordSummary(live);
    let closeWins = 0, closeLosses = 0;
    for (const m of live) for (const g of m.games) {
      if (g.you === null || g.them === null || g.you === g.them || Math.abs(g.you - g.them) > CLOSE_MARGIN) continue;
      if (g.you > g.them) closeWins++; else closeLosses++;
    }
    out.record = { matches: live.length, wins: r.overall.wins, singles: [r.singles.wins, r.singles.losses], doubles: [r.doubles.wins, r.doubles.losses], closeWins, closeLosses };
  }
  if (share.tags) {
    const wins = live.filter((m) => m.won && m.status === 'complete' && !m.backfilled).length;
    const losses = live.filter((m) => !m.won && m.status === 'complete' && !m.backfilled).length;
    out.tags = tagStats(live).filter((t) => t.needsWork + t.wentWell > 0)
      .map((t) => ({ tag: t.tag, inLosses: t.needsInLosses, losses, inWins: t.needsInWins, wins }))
      .sort((a, b) => b.inLosses - a.inLosses).slice(0, 12);
  }
  if (share.training) {
    const from = new Date(today); from.setDate(from.getDate() - 30);
    const since = iso(from);
    const recent = sessions.filter((s) => s.deletedAt === undefined && s.date >= since);
    out.training = {
      hours30d: Math.round((recent.reduce((n, s) => n + s.minutes, 0) / 60) * 10) / 10,
      sessions30d: recent.filter((s) => s.type !== 'rest').length,
      drills: drillStats(recent).map((d) => ({ category: d.category, made: d.made, attempts: d.attempts })),
    };
  }
  return out;
}

export async function mySummary(share: Share): Promise<SummaryData> {
  return buildSummary(share, await activeMatches(), await activeSessions());
}
