// Motion board picks for the public screens (Live, Home, Studio). Display only: nothing here changes a score.
// Every animation is CSS (transform and opacity) and turns into a short fade with reduced motion.
import { flipOnChange } from '../tv/motion';

export type Seen = Map<string, { value: string; cls: string }>;
/** Restarts a CSS animation each time `value` changes, by flipping between two identical class names. */
export const flip = (seen: Seen, key: string, value: string, base: string) => flipOnChange(seen, key, value, [base + '0', base + '1']);

const moments = new Map<string, { value: string; at: number; text: string }>();
/** A short banner (Side out, Game, Match) for 1.6 s after something changes; never on first load. */
export function moment(key: string, value: string, text: string, now = Date.now()): { text: string; at: number } | null {
  const prev = moments.get(key);
  if (!prev) { moments.set(key, { value, at: 0, text: '' }); return null; }
  if (prev.value !== value) { const next = { value, at: now, text }; moments.set(key, next); return text ? { text, at: now } : null; }
  return prev.text && now - prev.at < 1600 ? { text: prev.text, at: prev.at } : null;
}
export const resetMoments = () => moments.clear();

