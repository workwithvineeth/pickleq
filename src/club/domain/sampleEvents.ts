import type { Format } from '../../domain/types';
import type { Club, ClubTournament, Division, Registration } from '../types';
import { isoDay } from './sample';

/** Fictional names and numbers only. */
const FORMAT: Format = { pointsTo: 11, bestOf: 1, scoring: 'sideout', golden: true };
const KO: Format = { pointsTo: 11, bestOf: 3, scoring: 'sideout' };

export interface SampleEvents { clubs: Club[]; tournaments: ClubTournament[]; divisions: Division[]; registrations: Registration[] }

/**
 * Events for the demo board: one run on PICKLEQ by the demo club, taking entries (with some already in),
 * one listed-only event and one waiting for approval from a second made-up club.
 */
export function buildSampleEvents(demoClubId: string, id: () => string, today = new Date()): SampleEvents {
  const day = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return isoDay(d); };
  const friends: Club = { id: id(), name: 'PQ Demo Friends Club', city: 'Hyderabad', inviteCode: 'pqdemo0002', settings: {} };
  const base = { courts: 4, slotMinutes: 20, status: 'draft' as const, isPublic: false, city: 'Hyderabad' };
  const night: ClubTournament = {
    ...base, id: id(), clubId: demoClubId, name: 'PQ Demo Night', startDate: day(3), startTime: '18:30', publicSlug: 'pq-demo-night', venue: 'PQ Demo Courts',
    about: 'A made-up evening event for trying PICKLEQ. Round robin pools, golden point.', entryMode: 'registration', registrationOpen: true, entriesClose: day(2),
    upiId: 'pqdemo@upi', listing: 'run', listingStatus: 'approved',
  };
  const social: ClubTournament = {
    ...base, id: id(), clubId: friends.id, name: 'PQ Demo Sunday Social', startDate: day(5), startTime: '07:00', publicSlug: 'pq-demo-social', venue: 'Demo Park Courts',
    about: 'Listed only: players contact the organiser to enter.', contact: '90000 00000', entryMode: 'roster', listing: 'listed', listingStatus: 'approved',
  };
  const ladder: ClubTournament = {
    ...base, id: id(), clubId: friends.id, name: 'PQ Demo Ladder Cup', startDate: day(9), startTime: '08:00', publicSlug: 'pq-demo-ladder', venue: 'Demo Park Courts',
    entryMode: 'registration', registrationOpen: true, listing: 'run', listingStatus: 'pending',
  };
  const div = (t: ClubTournament, name: string, kind: Division['kind'], sort: number, rules: Division['rules']): Division =>
    ({ id: id(), tournamentId: t.id, clubId: t.clubId, name, kind, format: FORMAT, koFormat: KO, pools: 1, advance: 0, sort, rules });
  const md = div(night, 'Men’s Doubles 3.5', 'doubles', 0, { gender: 'men', maxDupr: 3.5, cap: 8, fee: 600 });
  const mx = div(night, 'Mixed Doubles', 'doubles', 1, { gender: 'mixed', cap: 8, fee: 600 });
  const s35 = div(night, 'Open Singles 35+', 'singles', 2, { gender: 'open', minAge: 35, fee: 400 });
  const soc = div(social, 'Social Doubles', 'doubles', 0, { gender: 'open', fee: 300 });
  const lad = div(ladder, 'Open Doubles', 'doubles', 0, { gender: 'open', fee: 500 });
  const teams: [string, number, string, number, Registration['status'], Registration['payment']][] = [
    ['Arjun Rao', 3.41, 'Kabir Shah', 3.22, 'accepted', 'paid'],
    ['Nikhil Iyer', 3.35, 'Rohan Das', 3.18, 'accepted', 'paid'],
    ['Siddharth Pai', 3.29, 'Varun Menon', 3.4, 'accepted', 'venue'],
    ['Aditya Kulkarni', 3.12, 'Pranav Joshi', 3.05, 'pending', 'claimed'],
    ['Imran Khan', 3.47, 'Tarun Bose', 2.98, 'pending', 'unpaid'],
  ];
  const registrations: Registration[] = teams.map(([a, ra, b, rb, status, payment], i) => ({
    id: id(), tournamentId: night.id, divisionId: md.id, clubId: demoClubId, source: i === 2 ? 'offline' : 'online', status, payment,
    paymentRef: payment === 'claimed' ? 'DEMO482913' : undefined, createdAt: new Date(today.getTime() - (10 - i) * 3600_000).toISOString(),
    players: [
      { name: a, phone: `90000 0${String(i * 2 + 10).padStart(4, '0')}`, gender: 'm', age: 28 + i, dupr: ra },
      { name: b, phone: `90000 0${String(i * 2 + 11).padStart(4, '0')}`, gender: 'm', age: 31 + i, dupr: rb },
    ],
  }));
  return { clubs: [friends], tournaments: [night, social, ladder], divisions: [md, mx, s35, soc, lad], registrations };
}
