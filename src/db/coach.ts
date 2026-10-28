import { costUsd, type Usage } from '../coach/cost';
import type { TaskId, TaskParams } from '../coach/tasks';
import { db, newId, type PickleqDB } from './db';

export interface CoachMessage { role: 'user' | 'assistant'; text: string; at: number; usage?: Usage & { usd: number }; error?: string }
export interface Conversation {
  id: string;
  task: TaskId;
  title: string;
  params: TaskParams;
  /** The records sent with the first question, kept so follow-ups see the same data. */
  context: string;
  messages: CoachMessage[];
  createdAt: number;
  updatedAt: number;
}
export interface UsageRow { id: string; at: number; task: TaskId; input: number; output: number; usd: number }

export async function newConversation(c: Pick<Conversation, 'task' | 'title' | 'params' | 'context'>, firstText: string, d: PickleqDB = db, now = Date.now()): Promise<Conversation> {
  const conv: Conversation = { ...c, id: newId(), messages: [{ role: 'user', text: firstText, at: now }], createdAt: now, updatedAt: now };
  await d.conversations.add(conv);
  return conv;
}

export async function appendMessage(id: string, m: CoachMessage, d: PickleqDB = db): Promise<void> {
  await d.transaction('rw', d.conversations, async () => {
    const c = await d.conversations.get(id);
    if (!c) return;
    c.messages.push(m);
    c.updatedAt = m.at;
    await d.conversations.put(c);
  });
}

/** Removes a failed answer so the question can be sent again. */
export async function dropTrailingError(id: string, d: PickleqDB = db): Promise<void> {
  const c = await d.conversations.get(id);
  if (c && c.messages.at(-1)?.error) { c.messages.pop(); await d.conversations.put(c); }
}

export async function recordUsage(task: TaskId, u: Usage, d: PickleqDB = db, now = Date.now()): Promise<UsageRow> {
  const row: UsageRow = { id: newId(), at: now, task, input: u.input, output: u.output, usd: costUsd(u) };
  await d.usage.add(row);
  return row;
}

export interface UsageSummary { answers: number; input: number; output: number; usd: number }
export function summarizeUsage(rows: UsageRow[], from = 0): UsageSummary {
  const r = rows.filter((x) => x.at >= from);
  return { answers: r.length, input: r.reduce((n, x) => n + x.input, 0), output: r.reduce((n, x) => n + x.output, 0), usd: r.reduce((n, x) => n + x.usd, 0) };
}

export const listConversations = (d: PickleqDB = db) => d.conversations.orderBy('updatedAt').reverse().toArray();
export const deleteConversation = (id: string, d: PickleqDB = db) => d.conversations.delete(id);
