import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = {
  kind: 'server' as const,
  passwordSignIn: vi.fn(async () => undefined),
  isPlatformAdmin: vi.fn(async () => false),
  myClubs: vi.fn(async () => []),
  signOut: vi.fn(),
  finishLinkSignIn: vi.fn(async () => false),
};
vi.mock('./index', async (orig) => ({ ...(await orig<typeof import('./index')>()), serverBackend: () => fake, takeReturn: () => null }));
vi.mock('./config', async (orig) => ({ ...(await orig<typeof import('./config')>()), isClubApp: () => true }));

const { ClubSignIn } = await import('./screens/Hub');
import type { Go } from '../navigation';

async function signInAs(go: Go) {
  const user = userEvent.setup();
  render(<ClubSignIn go={go} onBack={() => {}} />);
  await user.type(screen.getByLabelText('Email'), 'someone@example.com');
  await user.type(screen.getByLabelText('Password'), 'password99');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

beforeEach(() => { localStorage.clear(); fake.passwordSignIn.mockClear(); });

describe('one sign-in, then pick Player or Club', () => {
  it('asks where to go the first time, and sends a player to their Player Studio', async () => {
    const go = vi.fn();
    const user = await signInAs(go);
    expect(await screen.findByRole('group', { name: 'Where to?' })).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'I’m a player' }));
    expect(go).toHaveBeenCalledWith('club-player-studio', undefined, { replace: true });
    expect(localStorage.getItem('rq-landing-choice')).toBe('club-player-studio');
  });

  it('sends someone who runs a club to My clubs', async () => {
    const go = vi.fn();
    const user = await signInAs(go);
    await user.click(await screen.findByRole('button', { name: 'I run a club' }));
    expect(go).toHaveBeenCalledWith('club', undefined, { replace: true });
    expect(localStorage.getItem('rq-landing-choice')).toBe('club');
  });

  it('remembers the answer: the next sign-in goes straight there', async () => {
    localStorage.setItem('rq-landing-choice', 'club-player-studio');
    const go = vi.fn();
    await signInAs(go);
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('club-player-studio', undefined, { replace: true }));
    expect(screen.queryByRole('group', { name: 'Where to?' })).toBeNull();
  });
});
