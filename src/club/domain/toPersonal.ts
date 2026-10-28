import type { NewMatch } from '../../db/matches';
import type { Game, Participant } from '../../domain/types';
import type { ClubMatch, ClubPlayer, Thresholds } from '../types';
import { STAGE_LABEL } from '../types';
import { playerRating } from './engine';
import { analyseGame } from './momentum';
import { sideOf } from './analytics';

/**
 * Turns a club match into a match in the player's personal PICKLEQ, from their side of the net.
 * Momentum comes from the point-by-point record when the club scored it live.
 */
export function clubMatchToPersonal(m: ClubMatch, playerId: string, players: Map<string, ClubPlayer>, clubName: string, eventName: string | undefined, thresholds?: Thresholds): NewMatch | null {
  const side = sideOf(m, playerId);
  if (!side || m.status !== 'done' || !m.winner) return null;
  const mine = side === 'A' ? m.sideA : m.sideB;
  const theirs = side === 'A' ? m.sideB : m.sideA;
  const kind = mine.length > 1 ? 'doubles' : 'singles';
  const person = (id: string, role: Participant['role']): Participant => {
    const p = players.get(id);
    const rating = playerRating(p, kind);
    return { name: p?.name ?? 'Unknown player', role, ...(rating !== undefined ? { rating } : {}) };
  };
  const games: Game[] = m.games.map((g) => {
    const you = side === 'A' ? g.a : g.b, them = side === 'A' ? g.b : g.a;
    if (!g.points) return { you, them, momentum: 'neither' };
    const an = analyseGame(g.points, m.format.pointsTo, thresholds);
    const momentum = side === 'A' ? an.momentumA : an.momentumB;
    if (momentum === 'came-back' || momentum === 'lost-lead') {
      return { you, them, momentum, fromYou: side === 'A' ? an.fromA : an.fromB, fromThem: side === 'A' ? an.fromB : an.fromA };
    }
    return { you, them, momentum };
  });
  const label = m.stage === 'friendly' ? 'Club match' : `${eventName ?? 'Club tournament'} · ${STAGE_LABEL[m.stage]}`;
  return {
    date: m.playedOn ?? m.updatedAt.slice(0, 10),
    type: kind,
    category: m.stage === 'friendly' ? 'casual' : 'tournament',
    format: m.format,
    participants: [...mine.filter((id) => id !== playerId).map((id) => person(id, 'partner')), ...theirs.map((id) => person(id, 'opponent'))],
    outcome: 'played',
    games,
    won: m.winner === side,
    status: 'complete',
    backfilled: false,
    tags: {},
    venue: clubName,
    notes: label,
    club: { matchId: m.id, clubName },
  };
}
