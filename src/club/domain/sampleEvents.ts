import type { Format } from '../../domain/types';
import { drawRows } from '../plan';
import { sampleLogo, samplePoster, type PosterDesign } from '../poster';
import type { Club, ClubMatch, ClubPlayer, ClubTournament, Division, Entry, Registration } from '../types';
import { entryRating } from './engine';
import { isoDay } from './sample';
import { rng, simulateMatch } from './simulate';

/** Fictional names and numbers only. Every sample event has its own made-up poster. */
const FORMAT: Format = { pointsTo: 11, bestOf: 1, scoring: 'sideout', golden: true };
const KO: Format = { pointsTo: 11, bestOf: 3, scoring: 'sideout' };

/** Bump when the sample events change, so demos already on a phone get the new set. */
export const SAMPLE_EVENTS_VERSION = 5;

export interface SampleEvents {
  clubs: Club[];
  tournaments: ClubTournament[];
  divisions: Division[];
  entries: Entry[];
  matches: ClubMatch[];
  registrations: Registration[];
  /** The demo club's own Open (from Module 1) gets a poster too. */
  openPoster: string;
  /** A made-up logo for the demo club itself. */
  demoLogo: string;
}

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The demo's events board:
 * - finished, with results: PQ Demo Diwali Doubles and PQ Demo Monsoon Singles (played by the demo club's players);
 * - upcoming, on the board: PQ Demo Night (entries open, some already in), PQ Demo Sunday Social (listed only),
 *   PQ Demo Women's Open (entries open);
 * - waiting for approval, from a new club: PQ Demo Ladder Cup and PQ Demo Corporate Cup;
 * - from a second city (PQ Demo Riverside Club, Bengaluru): PQ Demo Smash Fest, PQ Demo Seniors Classic (50+), PQ Demo Winter Mixer (listed);
 * - live today: Pickleball Central Season 8 (the demo club's own). Singles started about 80 minutes ago and is mid-pools;
 *   doubles starts in about 2 hours, so the owner can still add or withdraw doubles teams.
 */
export function buildSampleEvents(demoClubId: string, id: () => string, players: ClubPlayer[], today = new Date()): SampleEvents {
  const day = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return isoDay(d); };
  const friends: Club = { id: id(), name: 'PQ Demo Friends Club', city: 'Hyderabad', inviteCode: 'pqdemo0002', settings: {}, verified: true,
    logoUrl: sampleLogo({ initials: 'FC', bg: '#FCE7D6', ink: '#5A2A12', accent: '#D9622B', shape: 'circle' }) };
  const newbie: Club = { id: id(), name: 'PQ Demo New Club', city: 'Hyderabad', inviteCode: 'pqdemo0003', settings: {},
    logoUrl: sampleLogo({ initials: 'NC', bg: '#E8F1E4', ink: '#1E3A1A', accent: '#3E8E41', shape: 'shield' }) };
  // Waiting for PaddleQ to approve it to host (no tournaments yet): shows the approval workflow in the admin dashboard.
  const courtyard: Club = { id: id(), name: 'PQ Demo Courtyard Club', city: 'Pune', inviteCode: 'pqdemo0005', settings: {},
    hosting: 'pending', hostingPhone: '+91 9000044444', hostingNote: 'Two outdoor courts in Baner. We plan a monthly doubles night.',
    logoUrl: sampleLogo({ initials: 'CC', bg: '#F6E6E8', ink: '#7A1F2B', accent: '#7A1F2B', shape: 'circle' }) };
  const riverside: Club = { id: id(), name: 'PQ Demo Riverside Club', city: 'Bengaluru', inviteCode: 'pqdemo0004', settings: {}, verified: true,
    logoUrl: sampleLogo({ initials: 'RC', bg: '#14304A', ink: '#FFFFFF', accent: '#FF9F43', shape: 'ball' }) };
  const poster = (t: Pick<ClubTournament, 'name' | 'startDate' | 'startTime' | 'venue' | 'city'>, look: Omit<PosterDesign, 'title' | 'date' | 'place'>) =>
    samplePoster({ title: t.name.replace(/^PQ Demo /, ''), date: `${fmtDay(t.startDate)} · ${t.startTime}`, place: [t.venue, t.city].filter(Boolean).join(', '), ...look });
  const base = { courts: 4, slotMinutes: 20, status: 'draft' as const, isPublic: false, city: 'Hyderabad' };
  const reviewedAt = new Date(today.getTime() - 3 * 86400_000).toISOString();

  const t = (x: Omit<ClubTournament, 'id' | 'courts' | 'slotMinutes' | 'status' | 'isPublic' | 'city'> & Partial<ClubTournament>, look: Omit<PosterDesign, 'title' | 'date' | 'place'>): ClubTournament => {
    const full: ClubTournament = { ...base, id: id(), ...x };
    full.posterUrl = poster(full, look);
    return full;
  };

  // Finished, with results.
  const diwali = t({ clubId: demoClubId, name: 'PQ Demo Diwali Doubles', startDate: day(-12), startTime: '17:00', publicSlug: 'pq-demo-diwali', venue: 'PQ Demo Courts',
    about: 'A made-up festival doubles round robin.', entryMode: 'registration', registrationOpen: false, listing: 'run', listingStatus: 'approved', reviewedAt, status: 'done', isPublic: true, drawnAt: new Date(today.getTime() - 13 * 86400_000).toISOString() },
  { tag: 'Festival doubles', bg: '#2B1640', ink: '#FFF4E0', accent: '#F2B134', motif: 'sun' });
  const monsoon = t({ clubId: demoClubId, name: 'PQ Demo Monsoon Singles', startDate: day(-20), startTime: '07:00', publicSlug: 'pq-demo-monsoon', venue: 'PQ Demo Courts',
    about: 'A made-up singles round robin in the rain season.', entryMode: 'registration', registrationOpen: false, listing: 'run', listingStatus: 'approved', reviewedAt, status: 'done', isPublic: true, drawnAt: new Date(today.getTime() - 21 * 86400_000).toISOString() },
  { tag: 'Singles round robin', bg: '#0F3A47', ink: '#EAF7F7', accent: '#7FD1C7', motif: 'trophy' });

  // Upcoming, on the board.
  const night = t({ clubId: demoClubId, name: 'PQ Demo Night', startDate: day(3), startTime: '18:30', publicSlug: 'pq-demo-night', venue: 'PQ Demo Courts',
    about: 'A made-up evening event for trying PaddleQ. Round robin pools, golden point.', entryMode: 'registration', registrationOpen: true, entriesClose: day(2),
    upiId: 'pqdemo@upi', listing: 'run', listingStatus: 'approved', reviewedAt },
  { tag: 'Under the lights', bg: '#14213D', ink: '#FFFFFF', accent: '#C6F432', motif: 'ball' });
  const social = t({ clubId: friends.id, name: 'PQ Demo Sunday Social', startDate: day(5), startTime: '07:00', publicSlug: 'pq-demo-social', venue: 'Demo Park Courts',
    about: 'Listed only: players contact the organiser to enter.', contact: '90000 00000', entryMode: 'roster', listing: 'listed', listingStatus: 'approved', reviewedAt },
  { tag: 'Sunday social', bg: '#FCE7D6', ink: '#5A2A12', accent: '#D9622B', motif: 'paddles' });
  const women = t({ clubId: friends.id, name: 'PQ Demo Women’s Open', startDate: day(8), startTime: '08:00', publicSlug: 'pq-demo-women', venue: 'Demo Park Courts',
    about: 'A made-up open for women’s singles and doubles.', entryMode: 'registration', registrationOpen: true, entriesClose: day(6), upiId: 'pqfriends@upi',
    listing: 'run', listingStatus: 'approved', reviewedAt },
  { tag: 'Women’s open', bg: '#5B1A3A', ink: '#FFEFF6', accent: '#FF8FC0', motif: 'stars' });

  // Waiting for approval (a club's first listings).
  const ladder = t({ clubId: newbie.id, name: 'PQ Demo Ladder Cup', startDate: day(9), startTime: '08:00', publicSlug: 'pq-demo-ladder', venue: 'Demo New Courts',
    about: 'A made-up ladder event, waiting for PaddleQ to check it.', entryMode: 'registration', registrationOpen: true, listing: 'run', listingStatus: 'pending' },
  { tag: 'Climb the ladder', bg: '#E8F1E4', ink: '#1E3A1A', accent: '#3E8E41', motif: 'court' });
  const corporate = t({ clubId: newbie.id, name: 'PQ Demo Corporate Cup', startDate: day(14), startTime: '09:00', publicSlug: 'pq-demo-corporate', venue: 'Demo New Courts',
    about: 'Listed only: company teams contact the organiser. Waiting for PaddleQ to check it.', contact: '90000 22222', entryMode: 'roster', listing: 'listed', listingStatus: 'pending' },
  { tag: 'Office teams', bg: '#1D2B53', ink: '#F5F7FF', accent: '#7EA6FF', motif: 'trophy' });

  // Three more on the board, from a second made-up club in another city.
  const smash = t({ clubId: riverside.id, name: 'PQ Demo Smash Fest', startDate: day(11), startTime: '07:30', publicSlug: 'pq-demo-smash', venue: 'Demo Riverside Courts',
    city: 'Bengaluru', about: 'A made-up doubles festival: open and mixed, pools then knockouts.', entryMode: 'registration', registrationOpen: true, entriesClose: day(9),
    upiId: 'pqriverside@upi', listing: 'run', listingStatus: 'approved', reviewedAt },
  { tag: 'Doubles festival', bg: '#3A1F0B', ink: '#FFF3E6', accent: '#FF9F43', motif: 'ball' });
  const seniors = t({ clubId: riverside.id, name: 'PQ Demo Seniors Classic', startDate: day(16), startTime: '08:00', publicSlug: 'pq-demo-seniors', venue: 'Demo Riverside Courts',
    city: 'Bengaluru', about: 'A made-up event for players aged 50 and over.', entryMode: 'registration', registrationOpen: true, entriesClose: day(14),
    upiId: 'pqriverside@upi', listing: 'run', listingStatus: 'approved', reviewedAt },
  { tag: 'Fifty and over', bg: '#1F3B2C', ink: '#F6F1E1', accent: '#E8C872', motif: 'trophy' });
  const mixer = t({ clubId: riverside.id, name: 'PQ Demo Winter Mixer', startDate: day(21), startTime: '17:00', publicSlug: 'pq-demo-mixer', venue: 'Demo Riverside Courts',
    city: 'Bengaluru', about: 'Listed only: a made-up evening mixer. Message the organiser to enter.', contact: '90000 33333', entryMode: 'roster', listing: 'listed',
    listingStatus: 'approved', reviewedAt },
  { tag: 'Evening mixer', bg: '#E6EEF8', ink: '#16243A', accent: '#3A6EA5', motif: 'stars' });

  const div = (tt: ClubTournament, name: string, kind: Division['kind'], sort: number, rules: Division['rules']): Division =>
    ({ id: id(), tournamentId: tt.id, clubId: tt.clubId, name, kind, format: FORMAT, koFormat: KO, pools: 1, advance: 0, sort, rules });
  const md = div(night, 'Men’s Doubles 3.5', 'doubles', 0, { gender: 'men', maxDupr: 3.5, cap: 8, fee: 600 });
  const mx = div(night, 'Mixed Doubles', 'doubles', 1, { gender: 'mixed', cap: 8, fee: 600 });
  const s35 = div(night, 'Open Singles 35+', 'singles', 2, { gender: 'open', minAge: 35, fee: 400 });
  const soc = div(social, 'Social Doubles', 'doubles', 0, { gender: 'open', fee: 300 });
  const ws = div(women, 'Women’s Singles', 'singles', 0, { gender: 'women', cap: 16, fee: 500 });
  const wd = div(women, 'Women’s Doubles 3.5', 'doubles', 1, { gender: 'women', maxDupr: 3.5, cap: 12, fee: 800 });
  const lad = div(ladder, 'Open Doubles', 'doubles', 0, { gender: 'open', fee: 500 });
  const corp = div(corporate, 'Company Doubles', 'doubles', 0, { gender: 'open', fee: 2000 });
  const dd = div(diwali, 'Open Doubles', 'doubles', 0, { gender: 'open', fee: 600 });
  const ms = div(monsoon, 'Open Singles', 'singles', 0, { gender: 'open', fee: 400 });
  const smo = div(smash, 'Open Doubles', 'doubles', 0, { gender: 'open', cap: 16, fee: 700 });
  const smx = div(smash, 'Mixed Doubles', 'doubles', 1, { gender: 'mixed', cap: 12, fee: 700 });
  const sen = div(seniors, 'Seniors Doubles 50+', 'doubles', 0, { gender: 'open', minAge: 50, cap: 12, fee: 600 });
  const mix = div(mixer, 'Mixer Doubles', 'doubles', 0, { gender: 'mixed', fee: 400 });

  // Results for the finished events: drawn from the demo club's (made-up) players and played out.
  const pmap = new Map(players.map((p) => [p.id, p]));
  const pick = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const doubles = Array.from({ length: 6 }, (_, i) => [pick[i * 2].id, pick[i * 2 + 1].id]);
  const singles = pick.slice(14, 20).map((p) => [p.id]);
  const rand = rng(20261029);
  const entries: Entry[] = [];
  const matches: ClubMatch[] = [];
  for (const [tt, d, groups] of [[diwali, dd, doubles], [monsoon, ms, singles]] as const) {
    const drawn = drawRows(tt, [{ division: d, entries: groups.map((g) => [...g]) }], pmap, id);
    entries.push(...drawn.entries);
    for (const m of drawn.matches) {
      const r = simulateMatch(entryRating(m.sideA, pmap, d.kind) ?? 3.5, entryRating(m.sideB, pmap, d.kind) ?? 3.5, m.format, rand);
      matches.push({ ...m, games: r.games, winner: r.winner, status: 'done', updatedAt: new Date(`${tt.startDate}T12:00:00`).toISOString() });
    }
  }

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
  // Live today: singles running, doubles in about 2 hours. Times are set from when the demo is made.
  const SLOT = 20;
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const startMin = Math.max(0, Math.floor(nowMin / SLOT) * SLOT - 4 * SLOT);
  const doneSlots = Math.max(0, Math.floor((nowMin - startMin) / SLOT));
  const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const doublesSlot = doneSlots + 6;
  const s8 = t({ clubId: demoClubId, name: 'Pickleball Central Season 8', startDate: day(0), startTime: hhmm(startMin), publicSlug: 'pq-demo-central-s8', venue: 'PQ Demo Courts',
    about: `Season 8 is live. Singles is under way; doubles starts at ${hhmm(startMin + doublesSlot * SLOT)}. Pools of four (singles) and three (doubles), top two into the knockouts.`,
    entryMode: 'roster', listing: 'run', listingStatus: 'approved', reviewedAt, status: 'live', isPublic: true, slotMinutes: SLOT },
  { tag: 'Season 8 · live today', bg: '#0B3B2E', ink: '#F4FFF8', accent: '#9BE15D', motif: 'trophy' });
  const s8s: Division = { ...div(s8, 'Season 8 Singles', 'singles', 0, { gender: 'open' }), pools: 4, advance: 2 };
  const s8d: Division = { ...div(s8, 'Season 8 Doubles', 'doubles', 1, { gender: 'open' }), pools: 4, advance: 2 };
  const at = (i: number) => pick[i % pick.length].id;
  const s8Singles = Array.from({ length: 16 }, (_, i) => [at(20 + i)]);
  // Twelve teams of two different players; a few play both events, as at a real club day.
  const s8Teams = Array.from({ length: 12 }, (_, i) => [at(32 + i * 2), at(33 + i * 2)]);
  const rs = drawRows(s8, [{ division: s8s, entries: s8Singles }], pmap, id);
  const rd = drawRows(s8, [{ division: s8d, entries: s8Teams }], pmap, id);
  entries.push(...rs.entries, ...rd.entries);
  const stamp = today.toISOString();
  for (const m of rs.matches) {
    const slot = m.slot ?? 0;
    if (slot > doneSlots) { matches.push({ ...m, updatedAt: stamp }); continue; }
    const r = simulateMatch(entryRating(m.sideA, pmap, 'singles') ?? 3.5, entryRating(m.sideB, pmap, 'singles') ?? 3.5, m.format, rand);
    if (slot < doneSlots) { matches.push({ ...m, games: r.games, winner: r.winner, status: 'done', updatedAt: stamp }); continue; }
    // On court now: part-way through the first game.
    const pts = r.games[0].points.slice(0, Math.max(3, Math.floor(r.games[0].points.length * 0.6)));
    const g = { points: pts, a: [...pts].filter((c) => c === 'A').length, b: [...pts].filter((c) => c === 'B').length };
    matches.push({ ...m, games: [g], status: 'live', updatedAt: stamp });
  }
  for (const m of rd.matches) matches.push({ ...m, slot: (m.slot ?? 0) + doublesSlot, updatedAt: stamp });

  const openPoster = samplePoster({ title: 'Demo Open', date: 'Live today', place: 'PQ Demo Courts, Hyderabad', tag: 'Club championship', bg: '#7A1F2B', ink: '#FFF6EC', accent: '#F3C77A', motif: 'court' });
  return {
    clubs: [friends, newbie, riverside, courtyard],
    tournaments: [s8, diwali, monsoon, night, social, women, ladder, corporate, smash, seniors, mixer],
    divisions: [s8s, s8d, dd, ms, md, mx, s35, soc, ws, wd, lad, corp, smo, smx, sen, mix],
    entries, matches, registrations, openPoster,
    demoLogo: sampleLogo({ initials: 'PQ', bg: '#7A1F2B', ink: '#F3EBDD', accent: '#F3C77A', shape: 'circle' }),
  };
}
