import { MODEL, type Usage } from './cost';

export type ClaudeErrorKind = 'offline' | 'no-key' | 'bad-key' | 'credits' | 'workspace' | 'rate' | 'overloaded' | 'too-long' | 'network' | 'other';

export class ClaudeError extends Error {
  kind: ClaudeErrorKind;
  constructor(kind: ClaudeErrorKind, message: string) { super(message); this.kind = kind; }
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface CallOptions {
  key: string;
  workspace?: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  onText?: (soFar: string) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}
export interface CallResult { text: string; usage: Usage; stopReason?: string }

const URL_MESSAGES = 'https://api.anthropic.com/v1/messages';

/** Turns an API error response into words a player can act on. */
export function explainError(status: number, body: string): ClaudeError {
  let msg = '';
  try { msg = JSON.parse(body)?.error?.message ?? ''; } catch { msg = body.slice(0, 200); }
  const m = msg.toLowerCase();
  if (status === 401) return new ClaudeError('bad-key', 'Claude didn’t accept your key. It may be mistyped, deleted or expired. Make a new one in the Claude Console and paste it in Coach settings.');
  if (m.includes('credit balance') || m.includes('billing') || status === 402) return new ClaudeError('credits', 'Your Claude credits have run out. Top up in the Claude Console (Billing). Built-in insights still work.');
  if (m.includes('workspace')) return new ClaudeError('workspace', 'Your key needs a workspace ID. Copy it from the Claude Console (Settings → Workspaces, ID column) into Coach settings.');
  if (status === 403) return new ClaudeError('bad-key', 'Your key isn’t allowed to use Claude. Check its workspace and permissions in the Claude Console.');
  if (status === 429) return new ClaudeError('rate', 'Claude is limiting requests from your key right now. Wait a minute and try again.');
  if (status === 529 || status === 503 || status === 500) return new ClaudeError('overloaded', 'Claude is busy at the moment. Try again in a few minutes.');
  if (status === 413 || m.includes('too long') || m.includes('maximum context')) return new ClaudeError('too-long', 'That conversation has grown too long. Start a new one.');
  return new ClaudeError('other', `Claude returned an error (${status})${msg ? `: ${msg}` : ''}.`);
}

/** Reads Claude's server-sent events and keeps only the visible answer text. */
export function parseEvents(chunk: string, state: { buffer: string; text: string; usage: Usage; stop?: string }): void {
  state.buffer += chunk;
  const parts = state.buffer.split(/\r?\n\r?\n/);
  state.buffer = parts.pop() ?? '';
  for (const part of parts) {
    const data = part.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
    if (!data) continue;
    let ev: { type?: string; message?: { usage?: { input_tokens?: number; output_tokens?: number } }; delta?: { type?: string; text?: string; stop_reason?: string }; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string; type?: string } };
    try { ev = JSON.parse(data); } catch { continue; }
    if (ev.type === 'message_start') {
      const u = ev.message?.usage;
      if (u?.input_tokens !== undefined) state.usage.input = u.input_tokens;
      if (u?.output_tokens !== undefined) state.usage.output = u.output_tokens;
    } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
      state.text += ev.delta.text;
    } else if (ev.type === 'message_delta') {
      if (ev.usage?.output_tokens !== undefined) state.usage.output = ev.usage.output_tokens;
      if (ev.usage?.input_tokens !== undefined) state.usage.input = ev.usage.input_tokens;
      if (ev.delta?.stop_reason) state.stop = ev.delta.stop_reason;
    } else if (ev.type === 'error') {
      const m = (ev.error?.message ?? '').toLowerCase();
      throw ev.error?.type === 'overloaded_error' ? explainError(529, '') : m.includes('credit') ? explainError(400, JSON.stringify(ev)) : new ClaudeError('other', `Claude stopped with an error: ${ev.error?.message ?? 'unknown'}`);
    }
  }
}

export async function callClaude(o: CallOptions): Promise<CallResult> {
  if (!o.key) throw new ClaudeError('no-key', 'Add your Claude API key in Coach settings first.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ClaudeError('offline', 'You’re offline. Claude needs internet; built-in insights still work.');
  const f = o.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // x-api-key is still supported and is always read as an API key (Bearer can be read as a sign-in token on some endpoints).
    'x-api-key': o.key,
    'anthropic-version': '2023-06-01',
    // Needed for calls made straight from a browser; the key never leaves this phone except to Anthropic.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (o.workspace) headers['anthropic-workspace-id'] = o.workspace;
  let res: Response;
  try {
    res = await f(URL_MESSAGES, {
      method: 'POST', headers, signal: o.signal,
      body: JSON.stringify({ model: MODEL, max_tokens: o.maxTokens ?? 4000, system: o.system, messages: o.messages, stream: true, output_config: { effort: 'low' } }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ClaudeError('network', 'Couldn’t reach Claude. Check your connection and try again.');
  }
  if (!res.ok) throw explainError(res.status, await res.text().catch(() => ''));
  const state = { buffer: '', text: '', usage: { input: 0, output: 0 }, stop: undefined as string | undefined };
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parseEvents(dec.decode(value, { stream: true }), state);
      o.onText?.(state.text);
    }
    parseEvents('\n\n', state);
  } else {
    parseEvents(`${await res.text()}\n\n`, state);
    o.onText?.(state.text);
  }
  if (!state.text.trim()) throw new ClaudeError('other', 'Claude sent an empty answer. Try again.');
  return { text: state.text, usage: state.usage, stopReason: state.stop };
}
