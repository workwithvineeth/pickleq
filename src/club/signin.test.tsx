import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authMessage, passwordProblem } from './authText';
import { ClubError } from './backend';

const fake = {
  kind: 'server' as const,
  passwordSignIn: vi.fn(),
  signUp: vi.fn(),
  confirmEmail: vi.fn(),
  resendConfirm: vi.fn(),
  sendPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  isPlatformAdmin: vi.fn(),
  signOut: vi.fn(),
  finishLinkSignIn: vi.fn(async () => false),
};
vi.mock('./index', async (orig) => ({ ...(await orig<typeof import('./index')>()), serverBackend: () => fake, takeReturn: () => null }));

const { ClubSignIn } = await import('./screens/Hub');

beforeEach(() => { for (const f of Object.values(fake)) if (typeof f === 'function') (f as ReturnType<typeof vi.fn>).mockReset(); fake.finishLinkSignIn.mockResolvedValue(false); });

describe('password rules and messages', () => {
  it('needs at least 8 characters', () => {
    expect(passwordProblem('1234567')).toBe('Use at least 8 characters');
    expect(passwordProblem('abcd1234')).toBeNull();
    expect(passwordProblem('12345678')).toBe('Use at least one letter and one number');
    expect(passwordProblem('abcdefgh')).toBe('Use at least one letter and one number');
    expect(passwordProblem(' padded1 ')).toMatch(/space/);
  });
  it('turns server wording into plain English', () => {
    expect(authMessage('Invalid login credentials')).toMatch(/email and password don’t match/);
    expect(authMessage('Email not confirmed')).toMatch(/6-digit code/);
    expect(authMessage('Token has expired or is invalid')).toMatch(/wrong or has expired/);
    expect(authMessage('Password should be at least 6 characters.')).toBe('Use at least 8 characters');
    expect(authMessage('email rate limit exceeded')).toMatch(/Too many tries/);
    expect(authMessage('Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789')).toBe('Use at least one letter and one number');
  });
});

describe('Sign in with a password', () => {
  it('signs in, and says so plainly when the password is wrong', async () => {
    const go = vi.fn();
    const user = userEvent.setup();
    fake.passwordSignIn.mockRejectedValueOnce(new ClubError(authMessage('Invalid login credentials')));
    render(<ClubSignIn go={go} onBack={() => {}} />);
    await user.type(screen.getByLabelText('Email'), 'organiser@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password don’t match');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'rightpass1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('club', undefined, { replace: true }));
    expect(fake.passwordSignIn).toHaveBeenLastCalledWith('organiser@example.com', 'rightpass1');
  });

  it('creates an account: 8+ characters, matching, then the emailed code', async () => {
    const go = vi.fn();
    const user = userEvent.setup();
    fake.signUp.mockResolvedValue(true);
    render(<ClubSignIn go={go} onBack={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Create an account/ }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Choose a password'), 'short');
    await user.type(screen.getByLabelText('Password again'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters');
    await user.clear(screen.getByLabelText('Choose a password'));
    await user.type(screen.getByLabelText('Choose a password'), 'longenough1');
    await user.clear(screen.getByLabelText('Password again'));
    await user.type(screen.getByLabelText('Password again'), 'different1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The two passwords don’t match');
    await user.clear(screen.getByLabelText('Password again'));
    await user.type(screen.getByLabelText('Password again'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('emailed a 6-digit code to new@example.com');
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm and sign in' }));
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('club', undefined, { replace: true }));
    expect(fake.signUp).toHaveBeenCalledWith('new@example.com', 'longenough1');
    expect(fake.confirmEmail).toHaveBeenCalledWith('new@example.com', '123456');
  });

  it('forgot password: emails a code, then sets a new password', async () => {
    const go = vi.fn();
    const user = userEvent.setup();
    render(<ClubSignIn go={go} onBack={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email'), 'organiser@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByRole('status')).toHaveTextContent('emailed it a 6-digit code');
    await user.type(screen.getByLabelText('6-digit code'), '654321');
    await user.type(screen.getByLabelText('New password'), 'brandnew99');
    await user.type(screen.getByLabelText('Password again'), 'brandnew99');
    await user.click(screen.getByRole('button', { name: 'Save password and sign in' }));
    await vi.waitFor(() => expect(go).toHaveBeenCalled());
    expect(fake.resetPassword).toHaveBeenCalledWith('organiser@example.com', '654321', 'brandnew99');
  });

  it('admin sign-in lets admins into the dashboard and turns others away', async () => {
    const go = vi.fn();
    const user = userEvent.setup();
    fake.isPlatformAdmin.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ClubSignIn admin go={go} onBack={() => {}} />);
    expect(screen.getByRole('heading', { name: 'PaddleQ admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create an account/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'organiser@example.com');
    await user.type(screen.getByLabelText('Password'), 'rightpass1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t a PaddleQ admin');
    expect(fake.signOut).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('admin', 'overview', { replace: true }));
  });
});
