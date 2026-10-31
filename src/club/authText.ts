/** Password rules and plain-English sign-in messages for PaddleQ accounts (organisers and admins). */

export const MIN_PASSWORD = 8;

/** What's wrong with a new password, or null when it's fine. */
export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`;
  if (p.length > 72) return 'Use 72 characters or fewer';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use at least one letter and one number';
  if (/^\s|\s$/.test(p)) return 'Don’t start or end the password with a space';
  return null;
}

/**
 * Has this password appeared in a known data leak? Uses HaveIBeenPwned's free Pwned Passwords range API (the same service Supabase
 * Pro uses): only the first 5 characters of the password's SHA-1 hash leave the phone, never the password. If the check can't run
 * (offline, blocked), it says no, so nobody is stuck.
 */
export async function passwordLeaked(p: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(p));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), 4000);
    const res = await fetcher(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: ctrl?.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const rest = hex.slice(5);
    return (await res.text()).split('\n').some((line) => { const [suffix, count] = line.trim().split(':'); return suffix === rest && Number(count) > 0; });
  } catch { return false; }
}

export const LEAKED_PASSWORD = 'This password has appeared in a data leak, so it’s easy for others to guess. Choose a different one.';

export function emailOk(e: string): boolean { return /^\S+@\S+\.\S+$/.test(e.trim()); }

/** Turns the sign-in server's messages into what a person can act on. */
export function authMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (/invalid login credentials|invalid credentials/.test(m)) return 'That email and password don’t match. Check them, or use “Forgot password”.';
  if (/email not confirmed/.test(m)) return 'Confirm your email first: enter the 6-digit code we emailed you.';
  if (/already (been )?registered|already exists/.test(m)) return 'There’s already an account with this email. Sign in, or use “Forgot password” to set a new password.';
  if (/token has expired|otp.*(expired|invalid)|invalid.*(otp|token)|expired/.test(m)) return 'That code is wrong or has expired. Check the latest email, or send a new code.';
  if (/should contain at least one character of each/.test(m)) return 'Use at least one letter and one number';
  if (/password should be at least|weak password|password.*(short|length)/.test(m)) return `Use at least ${MIN_PASSWORD} characters`;
  if (/should be different from the old/.test(m)) return 'Choose a password different from your old one.';
  if (/rate limit|too many|only request this after/.test(m)) return 'Too many tries just now. Wait a minute, then try again.';
  if (/signups not allowed|signup is disabled/.test(m)) return 'New accounts are switched off just now. Ask PaddleQ for help.';
  if (/fetch|network/.test(m)) return 'No connection to the club server. Check your internet and try again.';
  return raw;
}
