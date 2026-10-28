import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Chips, Field } from '../components/Controls';
import { Icon } from '../components/Icon';
import { buildContext, hasEnoughData, type CoachData } from '../coach/context';
import { costUsd, fmtInr, fmtUsd } from '../coach/cost';
import { checkKey, checkWorkspace, loadKey, loadRate, loadWorkspace, maskKey, saveKey, saveRate, saveWorkspace } from '../coach/key';
import { Markdown } from '../coach/markdown';
import { firstMessage, SYSTEM } from '../coach/prompt';
import { isSending, loadCoachData, sendTurn, testKey, useLiveAnswer } from '../coach/run';
import { COMPARE_PRESETS, REPORT_TASK, taskInfo, type ComparePreset, type TaskId, type TaskParams } from '../coach/tasks';
import { appendMessage, deleteConversation, dropTrailingError, newConversation, summarizeUsage } from '../db/coach';
import { db } from '../db/db';
import type { Go } from '../navigation';
import { dateRange } from './Tournaments';

const VALID: TaskId[] = ['weekly', 'weaknesses', 'compare', 'plan', 'notes', 'tournament', 'questions', 'chat', 'report'];
/** Rough token count for the estimate shown before sending (about 3.5 characters per token). */
const estTokens = (s: string) => Math.ceil(s.length / 3.5);

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <header className="header">
      <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
      <h1 className="screen-title" style={{ flex: 1, fontSize: 24 }}>{title}</h1>
      {right}
    </header>
  );
}

function useOnline(): boolean {
  const [on, setOn] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

function NotReady({ go }: { go: Go }) {
  const online = useOnline();
  if (!loadKey()) return <div className="notice notice-warn">Add your Claude key first. <button type="button" className="link-btn" onClick={() => go('coach-settings')}>Open Coach settings</button></div>;
  if (!online) return <div className="notice notice-warn">You’re offline. Claude needs internet; the built-in insights on the Coach tab still work.</div>;
  return null;
}

// ---------------- set up a task ----------------
export function CoachTask({ task, go, onBack }: { task: string; go: Go; onBack: () => void }) {
  const id = (VALID.includes(task as TaskId) ? task : 'chat') as TaskId;
  const info = taskInfo(id);
  const data = useLiveQuery(() => loadCoachData(), []);
  const [params, setParams] = useState<TaskParams>({ compare: '30v30' });
  const [showData, setShowData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const context = useMemo(() => (data ? buildContext(id, params, data) : ''), [data, id, params]);
  const tokens = estTokens(SYSTEM + firstMessage(id, params, context));
  const est = costUsd({ input: tokens, output: 2500 });

  async function ask() {
    if (!data) return;
    if (!loadKey()) return setError('Add your Claude key in Coach settings first');
    if (!online) return setError('You’re offline. Try again when you have internet');
    const problem = hasEnoughData(id, params, data);
    if (problem) return setError(problem);
    const t = id === 'tournament' ? data.tournaments.find((x) => x.id === params.tournamentId) : undefined;
    const title = id === 'chat' ? params.question!.trim().slice(0, 60) : t ? `${info.title}: ${t.name}` : id === 'compare' ? `${info.title}: ${COMPARE_PRESETS.find((p) => p.value === params.compare)?.label}` : `${info.title} · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    const display = id === 'chat' ? params.question!.trim() : params.question?.trim() ? `${info.title}. ${params.question.trim()}` : info.title;
    const c = await newConversation({ task: id, title, params, context }, display);
    go('conversation', c.id, { replace: true });
    void sendTurn(c.id);
  }

  return (
    <main className="screen" aria-labelledby="ct-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="ct-title" className="screen-title" style={{ flex: 1, fontSize: 24 }}>{info.title}</h1>
      </header>
      <p className="small muted" style={{ margin: 0 }}>{info.blurb}.</p>
      <NotReady go={go} />

      {id === 'compare' && <Chips label="Periods to compare" value={params.compare} options={COMPARE_PRESETS} onChange={(v: ComparePreset) => { setParams({ ...params, compare: v }); setError(null); }} />}
      {id === 'tournament' && data && (
        data.tournaments.length === 0 ? <p className="muted">Add a tournament first, from the Matches tab.</p> : (
          <Field label="Which tournament?">
            <div className="section" style={{ gap: 6 }}>
              {data.tournaments.map((t) => (
                <button key={t.id} type="button" className="chip" aria-pressed={params.tournamentId === t.id} style={{ textAlign: 'left' }} onClick={() => { setParams({ ...params, tournamentId: t.id }); setError(null); }}>{t.name} · {dateRange(t)}</button>
              ))}
            </div>
          </Field>
        )
      )}
      <Field label={id === 'chat' ? 'Your question' : 'Anything you want Claude to focus on? (optional)'}>
        <textarea className="input" rows={3} style={{ padding: 10, minHeight: 72 }} aria-label={id === 'chat' ? 'Your question' : 'Focus (optional)'}
          placeholder={id === 'chat' ? 'Why do I lose close games in doubles?' : 'My backhand in mixed'} value={params.question ?? ''}
          onChange={(e) => { setParams({ ...params, question: e.target.value }); setError(null); }} />
      </Field>

      {data && (
        <section className="card section" aria-label="What Claude will see">
          <div className="header">
            <span className="small">Claude will see about {tokens.toLocaleString('en-IN')} tokens of your records · about {fmtInr(est, loadRate())}</span>
            <button type="button" className="link-btn" aria-expanded={showData} onClick={() => setShowData(!showData)}>{showData ? 'Hide' : 'Show'}</button>
          </div>
          {showData && <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 320, overflow: 'auto', fontFamily: 'inherit' }}>{context}</pre>}
          <span className="small muted">Includes names you’ve recorded. Sent to Anthropic only when you tap Ask.</span>
        </section>
      )}
      {error && <div role="status" className="msg msg-bad">{error}</div>}
      <button type="button" className="btn btn-primary" onClick={ask} disabled={!data}>Ask Claude</button>
    </main>
  );
}

// ---------------- a conversation ----------------
export function ConversationView({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const c = useLiveQuery(async () => (await db.conversations.get(id)) ?? null, [id]);
  const live = useLiveAnswer(id);
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const online = useOnline();
  const rate = loadRate();
  if (c === undefined) return <main className="screen"><p className="muted">Loading…</p></main>;
  if (c === null) return <main className="screen"><Header title="Conversation" onBack={onBack} /><p>This conversation was deleted.</p></main>;
  const sending = live !== undefined || isSending(id);
  const last = c.messages.at(-1);

  async function follow() {
    const t = text.trim();
    if (!t || sending) return;
    await appendMessage(id, { role: 'user', text: t, at: Date.now() });
    setText('');
    void sendTurn(id);
  }
  async function retry() { await dropTrailingError(id); void sendTurn(id); }

  return (
    <main className="screen" aria-labelledby="cv-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="cv-title" className="screen-title" style={{ flex: 1, fontSize: 20 }}>{c.title}</h1>
      </header>
      <NotReady go={go} />
      {c.messages.map((m, i) => m.role === 'user' ? (
        <div key={i} className="bubble-user">{m.text}</div>
      ) : m.error ? (
        <div key={i} className="card section" role="alert">
          <span className="msg msg-bad">{m.error}</span>
          {i === c.messages.length - 1 && <button type="button" className="btn btn-outline" onClick={retry} disabled={sending}>Try again</button>}
        </div>
      ) : (
        <article key={i} className="card section" aria-label={`Claude’s answer ${i}`}>
          <Markdown text={m.text} />
          <span className="small muted">Written by Claude from your records. Explanations are possibilities, not proven.{m.usage ? ` · ${m.usage.input.toLocaleString('en-IN')} in, ${m.usage.output.toLocaleString('en-IN')} out · ${fmtInr(m.usage.usd, rate)}` : ''}</span>
        </article>
      ))}
      {sending && (
        <article className="card section" aria-live="polite" aria-label="Claude is writing">
          {live ? <Markdown text={live} /> : <span className="muted">Claude is reading your records…</span>}
        </article>
      )}
      {!sending && last?.role === 'user' && !last.error && (
        <div className="card section"><span className="small muted">This question hasn’t been answered.</span><button type="button" className="btn btn-outline" onClick={() => sendTurn(id)}>Send it now</button></div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea className="input" rows={2} style={{ padding: 10, minHeight: 56 }} aria-label="Follow-up question" placeholder="Ask a follow-up" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" className="btn btn-primary" style={{ minHeight: 56 }} onClick={follow} disabled={sending || !online || !text.trim()}>Send</button>
      </div>
      {confirm ? (
        <div className="card section">
          <span>Delete this conversation? This can’t be undone.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={async () => { await deleteConversation(id); onBack(); }}>Delete</button>
            <button type="button" className="btn btn-outline" onClick={() => setConfirm(false)}>Keep it</button>
          </div>
        </div>
      ) : <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>Delete conversation</button>}
    </main>
  );
}

// ---------------- settings ----------------
export function CoachSettings({ onBack }: { onBack: () => void }) {
  const [key, setKey] = useState('');
  const [workspace, setWorkspace] = useState(loadWorkspace());
  const [saved, setSaved] = useState(loadKey());
  const [rate, setRate] = useState(String(loadRate()));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const usage = useLiveQuery(() => db.usage.toArray(), []) ?? [];
  const now = new Date();
  const month = summarizeUsage(usage, new Date(now.getFullYear(), now.getMonth(), 1).getTime());
  const all = summarizeUsage(usage);
  const r = Number(rate) > 0 ? Number(rate) : loadRate();

  async function save() {
    const k = key.trim() || saved;
    const e = (key.trim() ? checkKey(key) : saved ? null : 'Paste your key') ?? checkWorkspace(workspace);
    if (e) return setMsg({ ok: false, text: e });
    setBusy(true);
    const problem = await testKey(k, workspace.trim());
    setBusy(false);
    if (problem) return setMsg({ ok: false, text: problem });
    saveKey(k); saveWorkspace(workspace);
    setSaved(k); setKey('');
    setMsg({ ok: true, text: 'Key works and is saved on this phone' });
  }

  return (
    <main className="screen" aria-labelledby="cs-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="cs-title" className="screen-title" style={{ flex: 1, fontSize: 24 }}>Coach settings</h1>
      </header>

      <section className="card section" aria-label="Claude key">
        <h2 style={{ fontSize: 18 }}>Your Claude API key</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Sign in at <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">platform.claude.com</a> and open API keys.</li>
          <li>Tap Create key, name it PICKLEQ, and copy it. It starts with sk-ant-.</li>
          <li>Under Billing, buy a small prepaid credit and leave auto-reload off. Claude stops when the credit runs out, so you can’t overspend.</li>
        </ol>
        {saved && <div className="kv"><span>Saved key</span><span>{maskKey(saved)}</span></div>}
        <Field label={saved ? 'Replace the key (optional)' : 'Paste the key'}>
          <input className="input" type="password" autoComplete="off" aria-label="Claude API key" placeholder="sk-ant-…" value={key} onChange={(e) => { setKey(e.target.value); setMsg(null); }} />
        </Field>
        <Field label="Workspace ID (only if Claude asks for one)">
          <input className="input" autoComplete="off" aria-label="Workspace ID" placeholder="wrkspc_…" value={workspace} onChange={(e) => { setWorkspace(e.target.value); setMsg(null); }} />
        </Field>
        {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Checking…' : 'Check and save'}</button>
        {saved && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { saveKey(''); saveWorkspace(''); setSaved(''); setWorkspace(''); setMsg({ ok: true, text: 'Key removed from this phone' }); }}>Remove key from this phone</button>}
        <span className="small muted">The key stays on this phone only. It isn’t in backups or exports, so add it again after restoring a backup on a new phone. Checking a key doesn’t use any credit.</span>
      </section>

      <section className="card section" aria-label="Usage">
        <h2 style={{ fontSize: 18 }}>Usage</h2>
        <div className="kv"><span>This month</span><span>{month.answers} answers · {fmtUsd(month.usd)} · about {fmtInr(month.usd, r)}</span></div>
        <div className="kv"><span>All time</span><span>{all.answers} answers · {fmtUsd(all.usd)} · about {fmtInr(all.usd, r)}</span></div>
        <div className="kv"><span>Tokens all time</span><span>{all.input.toLocaleString('en-IN')} in · {all.output.toLocaleString('en-IN')} out</span></div>
        <Field label="Rupees per US dollar (for the estimate)">
          <input className="input" inputMode="decimal" aria-label="Rupees per dollar" value={rate} onChange={(e) => { setRate(e.target.value); const n = Number(e.target.value); if (n > 0 && n < 1000) saveRate(n); }} />
        </Field>
        <span className="small muted">Worked out from Claude’s token counts at Haiku 5.5 list prices ($0.10 in and $0.50 out per million tokens). Your Claude Console shows the exact charge.</span>
      </section>
    </main>
  );
}

// ---------------- PDF report ----------------
export function Report({ go, onBack }: { go: Go; onBack: () => void }) {
  const data = useLiveQuery(() => loadCoachData(), []);
  const reports = useLiveQuery(() => db.conversations.where('task').equals('report').reverse().sortBy('updatedAt'), []) ?? [];
  const [msg, setMsg] = useState<string | null>(null);
  const latest = reports[0];
  const answer = latest?.messages.find((m) => m.role === 'assistant' && !m.error);
  const live = useLiveAnswer(latest?.id ?? '');
  const online = useOnline();

  async function write() {
    if (!data) return;
    if (!loadKey()) return setMsg('Add your Claude key in Coach settings first');
    if (!online) return setMsg('You’re offline');
    const problem = hasEnoughData('report', {}, data);
    if (problem) return setMsg(problem);
    const context = buildContext('report', {}, data);
    const c = await newConversation({ task: 'report', title: `Performance report · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, params: {}, context }, REPORT_TASK.title);
    setMsg(null);
    void sendTurn(c.id);
  }

  async function pdf() {
    if (!latest || !answer || !data) return;
    setMsg('Making the PDF…');
    const { makeReportPdf } = await import('../coach/pdf');
    const res = await makeReportPdf(answer.text, data);
    setMsg(res === 'cancelled' ? null : res === 'shared' ? 'PDF shared' : 'PDF downloaded');
  }

  return (
    <main className="screen" aria-labelledby="rp-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="rp-title" className="screen-title" style={{ flex: 1, fontSize: 24 }}>Performance report</h1>
      </header>
      <p className="small muted" style={{ margin: 0 }}>Claude writes a report on your last 90 days. The PDF puts the app’s measured numbers first, then Claude’s analysis, clearly labelled.</p>
      <NotReady go={go} />
      {live !== undefined && <article className="card section" aria-live="polite">{live ? <Markdown text={live} /> : <span className="muted">Claude is reading your records…</span>}</article>}
      {live === undefined && answer && (
        <>
          <article className="card section" aria-label="Latest report"><span className="small muted">{latest!.title}</span><Markdown text={answer.text} /></article>
          <button type="button" className="btn btn-primary" onClick={pdf}>Save or share as PDF</button>
        </>
      )}
      {live === undefined && latest?.messages.at(-1)?.error && <div className="msg msg-bad" role="alert">{latest.messages.at(-1)!.error}</div>}
      {msg && <div role="status" className="msg">{msg}</div>}
      <button type="button" className={`btn ${answer ? 'btn-outline' : 'btn-primary'}`} onClick={write} disabled={live !== undefined || !data}>{answer ? 'Write a new report' : 'Write my report'}</button>
    </main>
  );
}

export type { CoachData };
