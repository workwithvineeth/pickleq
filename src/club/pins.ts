/** PIN rules shared by the demo and the screens; the club server checks the same (weak_pin, set_event_pin, set_desk_pin). */

/** Easy to guess: not 4–6 digits, all the same digit (1111), or a run up or down (1234, 9876). */
export function weakPin(p: string): boolean {
  return !/^\d{4,6}$/.test(p) || /^(\d)\1+$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p);
}

/** Why a PIN typed by an organiser can't be used, or null when it's fine. `other` is the tournament's other PIN. */
export function pinProblem(p: string, other: string | null | undefined, which: 'referee' | 'desk'): string | null {
  if (!/^\d{4,6}$/.test(p)) return 'A PIN is 4 to 6 digits';
  if (weakPin(p)) return 'That PIN is too easy to guess. Avoid repeats like 1111 and runs like 1234.';
  if (other && p === other) return which === 'desk' ? 'The desk PIN must be different from the referee PIN' : 'The referee PIN must be different from the desk PIN';
  return null;
}

function randomDigits(n: number): string {
  const max = 10 ** n;
  const buf = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf); else buf[0] = Math.floor(Math.random() * 2 ** 32);
  return String(buf[0] % max).padStart(n, '0');
}

/** A random PIN of n digits that isn't easy to guess and isn't `not`. Referee PINs are 4 digits, desk PINs 6. */
export function randomPin(n: 4 | 6, not?: string | null): string {
  for (;;) { const p = randomDigits(n); if (!weakPin(p) && p !== not) return p; }
}

/** Where the desk PIN is kept on the desk's own phone or laptop, so a refresh doesn't ask again. */
export const deskPinKey = (token: string) => `pq-desk-pin-${token}`;
