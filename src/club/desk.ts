import { ClubError, type ClubBackend, type MatchBundle, type TournamentBundle } from './backend';
import { publicSources } from './index';

const NOT_FOR_DESK = 'Only the organiser can do that, from their own account.';

/**
 * The desk's view of the club backend: the same calls the organiser's desk, entries and scoring screens make, sent through the
 * desk link and desk PIN instead of an account. Anything else (referee links, other tournaments, club settings) is refused here,
 * and the club server refuses it too.
 */
export function deskBackend(src: ClubBackend, token: string, pin: string): ClubBackend {
  const desk: Partial<ClubBackend> = {
    kind: src.kind,
    tournamentBundle: (): Promise<TournamentBundle> => src.deskOpen(token, pin),
    matchBundle: async (matchId: string): Promise<MatchBundle> => {
      const t = await src.deskOpen(token, pin);
      const m = t.matches.find((x) => x.id === matchId);
      if (!m) throw new ClubError('This match isn’t in your tournament.');
      return { club: t.club, role: t.role, match: m, players: t.players, tournament: t.tournament, divisionName: t.divisions.find((d) => d.id === m.divisionId)?.name };
    },
    saveScore: (id, patch) => src.deskSaveScore(token, pin, id, patch),
    patchMatches: (changes) => src.deskPatchMatches(token, pin, changes),
    addMatches: (rows) => src.deskAddMatches(token, pin, rows),
    addEntry: (e) => src.deskAddEntry(token, pin, e),
    updateEntry: (id, patch) => src.deskUpdateEntry(token, pin, id, patch),
    addPlayer: (_clubId, p) => src.deskAddPlayer(token, pin, { name: p.name, dupr: p.duprSingles ?? p.duprDoubles }),
    updateTournament: async (_id, patch) => {
      if (patch.status === 'live' && patch.isPublic === undefined) return src.deskStart(token, pin);
      throw new ClubError(NOT_FOR_DESK);
    },
  };
  return new Proxy(desk, {
    get(target, key) {
      if (key in target) return target[key as keyof ClubBackend];
      if (key === 'then') return undefined;
      return () => Promise.reject(new ClubError(NOT_FOR_DESK));
    },
  }) as ClubBackend;
}

/** Opens a desk link on the club server, or in the demo on this phone if the server doesn't know it. */
export async function openDesk(token: string, pin: string): Promise<{ src: ClubBackend; bundle: TournamentBundle }> {
  let first: unknown = null;
  for (const src of publicSources()) {
    try { return { src, bundle: await src.deskOpen(token, pin) }; }
    catch (e) {
      first ??= e;
      // An unknown link (or no connection to the server) moves on to the next place; a wrong PIN, lockout or finished
      // tournament is the answer.
      if (!/isn’t valid|No connection/.test(e instanceof Error ? e.message : String(e))) throw e;
    }
  }
  throw first;
}

/** The club and tournament names for a desk link (server first, then the demo), before the PIN is typed. */
export async function deskLabelOf(token: string) {
  for (const src of publicSources()) {
    const l = await src.deskLabel(token).catch(() => null);
    if (l) return l;
  }
  return null;
}
