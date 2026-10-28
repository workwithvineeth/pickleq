import { useSyncExternalStore } from 'react';
import { appendMessage, recordUsage, type Conversation } from '../db/coach';
import { db } from '../db/db';
import { activeMatches } from '../db/matches';
import { ratingHistory } from '../db/ratings';
import { activeTournaments } from '../db/tournaments';
import { activeSessions } from '../db/training';
import { callClaude, ClaudeError, type ChatMessage } from './api';
import type { CoachData } from './context';
import { costUsd, MODEL } from './cost';
import { loadKey, loadWorkspace } from './key';
import { firstMessage, SYSTEM } from './prompt';

export async function loadCoachData(): Promise<CoachData> {
  const [matches, sessions, singles, doubles, goals, tournaments] = await Promise.all([
    activeMatches(), activeSessions(), ratingHistory('singles'), ratingHistory('doubles'), db.goals.toArray(), activeTournaments(),
  ]);
  return { matches, sessions, singles, doubles, goals, tournaments };
}

/** What actually goes to Claude: the first turn carries the records; failed turns are left out. */
export function apiMessages(c: Conversation): ChatMessage[] {
  const ok = c.messages.filter((m) => !m.error);
  return ok.map((m, i) => ({ role: m.role, content: i === 0 ? firstMessage(c.task, c.params, c.context) : m.text }));
}

// Live text while an answer streams in, shared with any screen showing that conversation.
const live = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useLiveAnswer(id: string): string | undefined {
  return useSyncExternalStore(subscribe, () => live.get(id), () => undefined);
}
export const isSending = (id: string) => live.has(id);

export async function sendTurn(id: string, fetchImpl?: typeof fetch): Promise<void> {
  if (live.has(id)) return;
  const c = await db.conversations.get(id);
  if (!c || c.messages.at(-1)?.role !== 'user') return;
  live.set(id, ''); emit();
  try {
    const r = await callClaude({
      key: loadKey(), workspace: loadWorkspace() || undefined, system: SYSTEM, messages: apiMessages(c),
      maxTokens: c.task === 'report' ? 6000 : 4000, fetchImpl,
      onText: (t) => { live.set(id, t); emit(); },
    });
    const text = r.stopReason === 'max_tokens' ? `${r.text}\n\n*(The answer hit its length limit and was cut short.)*` : r.text;
    await appendMessage(id, { role: 'assistant', text, at: Date.now(), usage: { ...r.usage, usd: costUsd(r.usage) } });
    await recordUsage(c.task, r.usage);
  } catch (e) {
    const msg = e instanceof ClaudeError ? e.message : 'Something went wrong talking to Claude. Try again.';
    await appendMessage(id, { role: 'assistant', text: '', at: Date.now(), error: msg });
  } finally {
    live.delete(id); emit();
  }
}

/** Free check that the key works: counts tokens for a tiny message (token counting has no charge). */
export async function testKey(key: string, workspace: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'You’re offline';
  try {
    const headers: Record<string, string> = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' };
    if (workspace) headers['anthropic-workspace-id'] = workspace;
    const res = await fetchImpl('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST', headers, body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Hello' }] }),
    });
    if (res.ok) return null;
    const { explainError } = await import('./api');
    return explainError(res.status, await res.text().catch(() => '')).message;
  } catch {
    return 'Couldn’t reach Claude. Check your connection.';
  }
}
