import { beforeEach, describe, expect, it } from 'vitest';
import { landingAfterSignIn, readChoice, writeChoice } from './landing';
import type { MyClub } from './backend';

const club = (role: MyClub['role']) => ({ club: { id: 'c1', name: 'Club' }, role }) as unknown as MyClub;
const b = (admin: boolean, clubs: MyClub[] | Error) => ({
  isPlatformAdmin: async () => admin,
  myClubs: async () => { if (clubs instanceof Error) throw clubs; return clubs; },
});

describe('where RallyQ opens after sign-in', () => {
  it('players (no club, or only a player in clubs) go to their Player Studio', async () => {
    expect(await landingAfterSignIn(b(false, []))).toBe('club-player-studio');
    expect(await landingAfterSignIn(b(false, [club('player')]))).toBe('club-player-studio');
  });
  it('organisers, coaches and RallyQ admins go to My clubs', async () => {
    expect(await landingAfterSignIn(b(false, [club('player'), club('owner')]))).toBe('club');
    expect(await landingAfterSignIn(b(false, [club('admin')]))).toBe('club');
    expect(await landingAfterSignIn(b(false, [club('coach')]))).toBe('club');
    expect(await landingAfterSignIn(b(true, []))).toBe('club');
  });
  it('falls back to My clubs if the clubs list fails', async () => {
    expect(await landingAfterSignIn(b(false, new Error('offline')))).toBe('club');
  });
});

describe('the choice made after signing in', () => {
  beforeEach(() => localStorage.clear());
  it('is remembered and wins over the guess from the clubs list', async () => {
    expect(readChoice()).toBeNull();
    writeChoice('club-player-studio');
    expect(readChoice()).toBe('club-player-studio');
    expect(await landingAfterSignIn(b(true, [club('owner')]))).toBe('club-player-studio');
    writeChoice('club');
    expect(await landingAfterSignIn(b(false, []))).toBe('club');
  });
  it('ignores a value it does not know', () => {
    localStorage.setItem('rq-landing-choice', 'somewhere-else');
    expect(readChoice()).toBeNull();
  });
});
