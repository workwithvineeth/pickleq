import type { ScorePatch } from './backend';

const UNSENT = 'pq-club-unsent-scores';
const BLOCKED = 'pq-club-blocked-scores';
/** Fired whenever the kept scores change, so banners update at once instead of waiting for a poll. */
export const PHONE_SCORES_EVENT = 'pq-phone-scores';
const changed = () => { try { window.dispatchEvent(new Event(PHONE_SCORES_EVENT)); } catch { /* no window */ } };

/** Scores saved on this phone that haven't reached the club server yet, keyed by match. */
export function readUnsent(): Record<string, ScorePatch> {
  try { return JSON.parse(localStorage.getItem(UNSENT) ?? '{}') as Record<string, ScorePatch>; } catch { return {}; }
}
export function writeUnsent(v: Record<string, ScorePatch>) {
  try { if (Object.keys(v).length) localStorage.setItem(UNSENT, JSON.stringify(v)); else localStorage.removeItem(UNSENT); } catch { /* storage blocked */ }
  changed();
}
export const countUnsent = () => Object.keys(readUnsent()).length;

/** Scores the server refused for good (wrong PIN, match moved or cancelled). Kept so nothing is lost, never retried by itself. */
export interface BlockedScore { patch: ScorePatch; reason: string }
export function readBlocked(): Record<string, BlockedScore> {
  try { return JSON.parse(localStorage.getItem(BLOCKED) ?? '{}') as Record<string, BlockedScore>; } catch { return {}; }
}
function writeBlocked(v: Record<string, BlockedScore>) {
  try { if (Object.keys(v).length) localStorage.setItem(BLOCKED, JSON.stringify(v)); else localStorage.removeItem(BLOCKED); } catch { /* storage blocked */ }
  changed();
}
export function blockUnsent(key: string, patch: ScorePatch, reason: string) {
  const u = readUnsent(); delete u[key]; writeUnsent(u);
  writeBlocked({ ...readBlocked(), [key]: { patch, reason } });
}
/** A late refusal must not remove a newer score recorded while the request was in flight. */
export function blockUnsentIf(key: string, patch: ScorePatch, reason: string): boolean {
  if (JSON.stringify(readUnsent()[key]) !== JSON.stringify(patch)) return false;
  blockUnsent(key, patch, reason);
  return true;
}

// The list and pad share this queue: scorer_save has no server revision check.
const sends = new Map<string, Promise<unknown>>();
export function queueScoreSend<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (sends.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  sends.set(key, next);
  const clear = () => { if (sends.get(key) === next) sends.delete(key); };
  void next.then(clear, clear);
  return next;
}

/** The desk fixed it: put the score back in the unsent list so it is sent again. */
export function unblock(key: string) {
  const b = readBlocked(); const hit = b[key]; if (!hit) return;
  delete b[key]; writeBlocked(b);
  writeUnsent({ ...readUnsent(), [key]: hit.patch });
}

/**
 * True when the server answered and said no, so sending the same score again can never work: a wrong or changed PIN,
 * a link that is not valid, a match on another court, cancelled or already finished. A dropped connection is not one.
 */
const PERMANENT = /\bPINs?\b|isn.t valid|isn.t on your court|cancelled|already finished|has finished|unknown match|needs a winner|right shape|hasn.t approved/i;
export function isPermanentScoreError(e: unknown): boolean {
  return e instanceof Error && !/no connection|failed to fetch|load failed|network/i.test(e.message) && PERMANENT.test(e.message);
}

/** Removes a kept score only if it is still the one that was just sent (a newer tap may have replaced it). */
export function clearUnsentIf(key: string, sent: ScorePatch) {
  const u = readUnsent();
  if (JSON.stringify(u[key]) !== JSON.stringify(sent)) return;
  delete u[key]; writeUnsent(u);
}

/** Sends every score this referee link kept while offline. Stops at the first connection problem. */
export async function flushLinkUnsent(token: string, save: (matchId: string, patch: ScorePatch) => Promise<void>, active: () => boolean = () => true): Promise<{ sent: number; blocked: number; offline: boolean }> {
  const prefix = `link:${token}:`;
  let sent = 0, blocked = 0, offline = false;
  for (const key of Object.keys(readUnsent())) {
    if (!active() || offline) break;
    if (!key.startsWith(prefix)) continue;
    await queueScoreSend(key, async () => {
      if (!active()) return;
      const patch = readUnsent()[key];
      if (!patch) return;
      try { await save(key.slice(prefix.length), patch); clearUnsentIf(key, patch); sent++; }
      catch (e) {
        if (!isPermanentScoreError(e)) { offline = true; return; }
        if (blockUnsentIf(key, patch, e instanceof Error ? e.message : 'The score was refused')) blocked++;
      }
    });
  }
  return { sent, blocked, offline };
}
