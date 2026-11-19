// The PaddleQ load robot: up to 20 test tournaments running at once on the real (free-plan) server, ramped 5 → 10 → 20.
// Referees score point by point on their court links (with offline bursts and retries), desks refresh every 8 s and draw the
// knockouts, spectators refresh the public results every 20 s. It measures every call (p50/p95, errors, timeouts, 429s), checks
// at the end that every score on the server equals what the referees sent and that knockouts are right and never doubled, and
// always deletes everything it made. Runs only in GitHub Actions (pqclub "Load test"): setup and cleanup go through the
// OIDC-guarded load-test edge function, which refuses while a real tournament is on.
// Run: npx -y tsx load/load.ts   (env: LOAD_MAX=20, LOAD_STEP_SECONDS=150)
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gameOver } from '../../src/club/domain/momentum';
import { buildTournamentRows, knockoutMatchesToAdd, poolQualifiers, poolsComplete, type NewMatchRow } from '../../src/club/plan';
import type { ClubMatch, ClubPlayer, ClubTournament, Division, Entry } from '../../src/club/types';

type Row = Record<string, unknown>;
const env = Object.fromEntries(readFileSync(new URL('../../.env.club', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL_ = env.VITE_SUPABASE_URL as string;
const KEY = env.VITE_SUPABASE_KEY as string;
const MAX = Math.min(20, Math.max(1, Number(process.env.LOAD_MAX ?? 20)));
const STEP_S = Number(process.env.LOAD_STEP_SECONDS ?? 150);
const STEPS = [5, 10, 20].filter((n) => n < MAX).concat(MAX);
const MAX_RUN_S = STEP_S * STEPS.length + 900;
const FORMAT = { pointsTo: 11, bestOf: 1, scoring: 'rally' } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- Measuring every call ----------
interface Bucket { ms: number[]; errors: number; timeouts: number; limited: number; calls: number }
const buckets = new Map<string, Bucket>();
const errorText = new Map<string, number>();
let stage = 0;
const recent: { t: number; ok: boolean }[] = [];
const bucket = (k: string) => { let b = buckets.get(k); if (!b) { b = { ms: [], errors: 0, timeouts: 0, limited: 0, calls: 0 }; buckets.set(k, b); } return b; };

async function rpc(kind: string, name: string, args: Row): Promise<Row | null> {
  const b = bucket(`${STEPS[stage]}|${kind}`);
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  b.calls++;
  try {
    const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', signal: ctrl.signal,
      headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
    const text = await res.text();
    b.ms.push(performance.now() - t0);
    if (res.status === 429) b.limited++;
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 120)}`);
    const body = text ? JSON.parse(text) as Row : null;
    if (body && typeof body === 'object' && 'error' in body && body.error) throw new Error(String(body.error));
    recent.push({ t: Date.now(), ok: true });
    return body;
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? 'timeout (10 s)' : e.message) : String(e);
    if (msg.startsWith('timeout')) b.timeouts++;
    b.errors++;
    errorText.set(`${kind}: ${msg}`, (errorText.get(`${kind}: ${msg}`) ?? 0) + 1);
    recent.push({ t: Date.now(), ok: false });
    throw e;
  } finally { clearTimeout(timer); }
}
async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { last = e; await sleep(1000 * 2 ** i); } }
  throw last;
}

// ---------- The load-test edge function (GitHub identity, no stored secret) ----------
async function helper(body: Row): Promise<Row> {
  const idUrl = `${process.env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=pickleq-load`;
  const id = await fetch(idUrl, { headers: { authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } }).then((r) => r.json()) as { value: string };
  const res = await fetch(`${URL_}/functions/v1/load-test`, { method: 'POST', headers: { 'x-github-oidc': id.value, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json() as Row;
  if (!res.ok || out.error) throw new Error(`load-test ${String(body.action)}: ${res.status} ${String(out.error ?? '')}`);
  return out;
}

// ---------- Making the test tournaments with the app's own draw ----------
interface Made { id: string; slug: string; courts: { court: number; token: string; pin: string }[]; desk: { token: string; pin: string } }
function build(run: string) {
  const clubId = randomUUID();
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const players: ClubPlayer[] = [];
  const out = { club: { id: clubId, name: `PQ Load ${run}` }, club_players: [] as Row[], tournaments: [] as Row[], divisions: [] as Row[], entries: [] as Row[], club_matches: [] as Row[] };
  for (let i = 0; i < MAX; i++) {
    const mk = (n: number) => Array.from({ length: n }, (_, k) => {
      const p: ClubPlayer = { id: randomUUID(), clubId, name: `Load ${i + 1}-${players.length + 1}`, duprSingles: 3 + ((k * 7) % 15) / 10, duprDoubles: 3 + ((k * 5) % 15) / 10, share: {}, sample: true };
      players.push(p); return p;
    });
    const singles = mk(8), doubles = mk(16);
    const rows = buildTournamentRows({
      clubId, name: `Load tournament ${i + 1}`, startDate: today, startTime: '09:00', courts: i % 2 ? 4 : 3, slotMinutes: 15,
      divisions: [
        { name: 'Singles', kind: 'singles', format: FORMAT, koFormat: FORMAT, pools: 2, advance: 2, entries: singles.map((p) => [p.id]) },
        { name: 'Doubles', kind: 'doubles', format: FORMAT, koFormat: FORMAT, pools: 2, advance: 2, entries: Array.from({ length: 8 }, (_, k) => [doubles[2 * k].id, doubles[2 * k + 1].id]) },
      ],
    }, new Map(players.map((p) => [p.id, p])), randomUUID);
    const t = rows.tournament;
    out.tournaments.push({ id: t.id, club_id: clubId, name: t.name, start_date: t.startDate, start_time: t.startTime, courts: t.courts, slot_minutes: t.slotMinutes, status: 'live', is_public: true, public_slug: `pqload${randomUUID().replace(/-/g, '').slice(0, 10)}`, entry_mode: 'roster' });
    out.divisions.push(...rows.divisions.map((d) => ({ id: d.id, tournament_id: d.tournamentId, club_id: clubId, name: d.name, kind: d.kind, format: { pool: d.format, ko: d.koFormat }, pools: d.pools, advance: d.advance, sort: d.sort })));
    out.entries.push(...rows.entries.map((e) => ({ id: e.id, division_id: e.divisionId, club_id: clubId, player_ids: e.playerIds, seed: e.seed ?? null, pool: e.pool ?? null, status: 'active' })));
    out.club_matches.push(...rows.matches.map(matchRow));
  }
  out.club_players = players.map((p) => ({ id: p.id, club_id: clubId, name: p.name, dupr_singles: p.duprSingles, dupr_doubles: p.duprDoubles, sample: true }));
  return out;
}
const matchRow = (m: NewMatchRow): Row => ({
  id: m.id, club_id: m.clubId, tournament_id: m.tournamentId ?? null, division_id: m.divisionId ?? null, stage: m.stage, pool: m.pool ?? null, round: m.round ?? null,
  bracket_pos: m.bracketPos ?? null, slot: m.slot ?? null, court: m.court ?? null, entry_a: m.entryA ?? null, entry_b: m.entryB ?? null,
  side_a: m.sideA, side_b: m.sideB, format: m.format, games: m.games, status: m.status, winner: m.winner ?? null, played_on: m.playedOn ?? null,
});

// The desk's bundle (desk_open) in the app's own types, so the app's knockout drawing runs exactly as on a desk.
function fromDesk(r: Row) {
  const t = r.tournament as Row;
  const tournament = { id: String(t.id), clubId: String(t.club_id), name: String(t.name), startDate: String(t.start_date), startTime: String(t.start_time).slice(0, 5), courts: Number(t.courts), slotMinutes: Number(t.slot_minutes), status: t.status, isPublic: !!t.is_public, publicSlug: String(t.public_slug) } as ClubTournament;
  const divisions = (r.divisions as Row[]).map((d) => { const f = d.format as Row; return { id: String(d.id), tournamentId: String(d.tournament_id), clubId: String(d.club_id), name: String(d.name), kind: d.kind, format: f.pool, koFormat: f.ko ?? f.pool, pools: Number(d.pools), advance: Number(d.advance), sort: Number(d.sort), rules: {} } as Division; });
  const entries = (r.entries as Row[]).map((e) => ({ id: String(e.id), divisionId: String(e.division_id), clubId: String(e.club_id), playerIds: e.player_ids as string[], seed: e.seed == null ? undefined : Number(e.seed), pool: e.pool == null ? undefined : Number(e.pool), status: e.status === 'withdrawn' ? 'withdrawn' : 'active' }) as Entry);
  const matches = (r.matches as Row[]).map((m) => ({ id: String(m.id), clubId: String(m.club_id), tournamentId: String(m.tournament_id), divisionId: m.division_id ? String(m.division_id) : undefined, stage: m.stage, pool: m.pool ?? undefined, round: m.round ?? undefined, bracketPos: m.bracket_pos ?? undefined, slot: m.slot ?? undefined, court: m.court ?? undefined, entryA: m.entry_a ?? undefined, entryB: m.entry_b ?? undefined, sideA: (m.side_a as string[]) ?? [], sideB: (m.side_b as string[]) ?? [], format: m.format, games: (m.games as ClubMatch['games']) ?? [], status: m.status, winner: m.winner ?? undefined, playedOn: m.played_on ?? undefined, updatedAt: String(m.updated_at) }) as ClubMatch);
  return { tournament, divisions, entries, matches };
}

// ---------- The actors ----------
let stop = false;
const expected = new Map<string, { games: { a: number; b: number }[]; winner: 'A' | 'B' }>();
const finished = new Set<string>();
let pointsSent = 0, offlineBursts = 0, koDrawn = 0;

async function referee(t: Made, c: { court: number; token: string; pin: string }) {
  while (!stop && !finished.has(t.id)) {
    let view: Row;
    try { view = await retry(() => rpc('referee: open court', 'scorer_open', { p_token: c.token, p_pin: c.pin }) as Promise<Row>); } catch { await sleep(5000); continue; }
    const next = ((view.matches as Row[]) ?? []).filter((m) => m.status !== 'done' && (m.names_a as string[] | null)?.length && (m.names_b as string[] | null)?.length)
      .sort((x, y) => Number(x.slot ?? 999) - Number(y.slot ?? 999))[0];
    if (!next) { await sleep(6000); continue; }
    const id = String(next.id);
    const skew = rand(0.35, 0.65);
    let points = '', a = 0, b = 0, offline = 0;
    while (!gameOver(a, b, FORMAT.pointsTo) && !stop) {
      await sleep(rand(1200, 2600));
      if (Math.random() < skew) { a++; points += 'A'; } else { b++; points += 'B'; }
      const over = gameOver(a, b, FORMAT.pointsTo);
      if (!over && offline === 0 && Math.random() < 0.05) { offline = Math.floor(rand(3, 7)); offlineBursts++; }
      if (offline > 0 && !over) { offline--; continue; }
      const games = [{ points, a, b }];
      const winner = a > b ? 'A' : 'B';
      try {
        await retry(() => rpc(over ? 'referee: final point' : 'referee: point', 'scorer_save', { p_token: c.token, p_pin: c.pin, p_match: id, p_games: games, p_status: over ? 'done' : 'live', p_winner: over ? winner : null, p_played_on: null }));
        pointsSent++;
        if (over) expected.set(id, { games: [{ a, b }], winner });
      } catch { /* counted; the next point sends the whole score again */ }
    }
  }
}

async function desk(t: Made) {
  while (!stop && !finished.has(t.id)) {
    try {
      const d = fromDesk(await rpc('desk: refresh', 'desk_open', { p_token: t.desk.token, p_pin: t.desk.pin }) as Row);
      const add = knockoutMatchesToAdd(d.tournament, d.divisions, d.entries, d.matches, randomUUID);
      if (add.length) { await rpc('desk: draw knockouts', 'desk_add_matches', { p_token: t.desk.token, p_pin: t.desk.pin, p_rows: add.map(matchRow) }); koDrawn += add.length; }
      const finals = d.matches.filter((m) => m.stage === 'final' && m.status !== 'void');
      if (finals.length === d.divisions.length && finals.every((m) => m.status === 'done')) finished.add(t.id);
    } catch { /* counted */ }
    await sleep(rand(7500, 8500));
  }
}

async function spectator(t: Made) {
  await sleep(rand(0, 20000));
  while (!stop && !finished.has(t.id)) {
    try { await rpc('spectator: results page', 'public_tournament', { slug: t.slug }); } catch { /* counted */ }
    await sleep(rand(18000, 22000));
  }
}

// ---------- Run ----------
const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
async function main() {
  if (process.env.LOAD_DRY) {
    const d = build('dry');
    console.log(`Dry run: ${d.tournaments.length} tournaments, ${d.divisions.length} events, ${d.entries.length} entries, ${d.club_matches.length} pool matches, ${d.club_players.length} players`);
    return;
  }
  const run = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
  const report: string[] = [`### PaddleQ load test ${run}`, ''];
  const guard = await helper({ action: 'guard' });
  if (!guard.ok) { console.log(`Not running: a real tournament is on (${(guard.live as string[]).join(', ')}).`); writeFileSync('load-report.md', `### Load test skipped\nA real tournament is on: ${(guard.live as string[]).join(', ')}.\n`); return; }
  await helper({ action: 'cleanup' });
  let verdictAbort = '';
  try {
    const data = build(run);
    const setup = await helper({ action: 'setup', ...data });
    const made = setup.tournaments as Made[];
    console.log(`Set up ${made.length} tournaments, ${data.club_matches.length} pool matches, ${data.club_players.length} players.`);
    const t0 = Date.now();
    const actors: Promise<void>[] = [];
    let started = 0;
    const startUpTo = (n: number) => {
      for (; started < Math.min(n, made.length); started++) {
        const t = made[started];
        for (const c of t.courts) actors.push(referee(t, c));
        actors.push(desk(t));
        if (started < 5) actors.push(desk(t)); // a second desk on five of them: knockouts must still be drawn once
        for (let s = 0; s < 10; s++) actors.push(spectator(t));
      }
    };
    startUpTo(STEPS[0]);
    const watcher = (async () => {
      while (!stop) {
        await sleep(10_000);
        const el = (Date.now() - t0) / 1000;
        const want = Math.min(STEPS.length - 1, Math.floor(el / STEP_S));
        if (want > stage) { stage = want; startUpTo(STEPS[stage]); console.log(`${Math.round(el)} s: ${STEPS[stage]} tournaments running`); }
        const window = recent.filter((r) => r.t > Date.now() - 30_000);
        const bad = window.filter((r) => !r.ok).length;
        if (window.length > 50 && bad / window.length > 0.05) { verdictAbort = `Stopped at ${STEPS[stage]} tournaments: ${bad} of ${window.length} calls failed in 30 s.`; stop = true; }
        if (started === made.length && made.every((t) => finished.has(t.id))) stop = true;
        if (el > MAX_RUN_S) { stop = true; verdictAbort ||= `Time limit reached with ${made.length - finished.size} tournaments unfinished.`; }
      }
    })();
    await Promise.all([...actors, watcher].map((p) => p.catch(() => undefined)));
    stop = true;
    const minutes = ((Date.now() - t0) / 60000).toFixed(1);

    // ---------- Correctness ----------
    let mismatched = 0, missing = 0, doubled = 0, wrongQualifiers = 0, checked = 0;
    for (const t of made) {
      const pub = await retry(() => rpc('check', 'public_tournament', { slug: t.slug })) as Row;
      const d = fromDesk(await retry(() => rpc('check', 'desk_open', { p_token: t.desk.token, p_pin: t.desk.pin })) as Row);
      const server = new Map(((pub.matches as Row[]) ?? []).map((m) => [String(m.id), m]));
      for (const m of d.matches) {
        const want = expected.get(m.id);
        if (!want) continue;
        checked++;
        const got = server.get(m.id);
        if (!got) { missing++; continue; }
        const g = (got.games as { a: number; b: number }[]) ?? [];
        if (got.status !== 'done' || got.winner !== want.winner || g.length !== want.games.length || g.some((x, i) => x.a !== want.games[i].a || x.b !== want.games[i].b)) mismatched++;
      }
      const ko = d.matches.filter((m) => m.stage !== 'pool' && m.status !== 'void');
      const keys = ko.map((m) => `${m.divisionId}|${m.stage}|${m.bracketPos}`);
      doubled += keys.length - new Set(keys).size;
      for (const div of d.divisions) {
        if (!poolsComplete(div.id, d.matches)) continue;
        const q = new Set(poolQualifiers(div, d.entries, d.matches.filter((m) => m.divisionId === div.id && m.stage === 'pool')).qualifiers.map((x) => x.entryId));
        const first = ko.filter((m) => m.divisionId === div.id && m.round === 1);
        const inKo = new Set(first.flatMap((m) => [m.entryA, m.entryB]).filter(Boolean) as string[]);
        if (first.length && (inKo.size !== q.size || [...q].some((x) => !inKo.has(x)))) wrongQualifiers++;
      }
    }

    // ---------- Report ----------
    report.push(`Ran ${minutes} min · steps ${STEPS.join(' → ')} tournaments · ${made.reduce((n, t) => n + t.courts.length, 0)} referees · ${made.length + Math.min(5, made.length)} desks · ${made.length * 10} spectators`);
    report.push(`Tournaments finished (both finals played): ${finished.size} of ${made.length} · points sent ${pointsSent} · offline bursts ${offlineBursts} · knockout matches drawn by desks ${koDrawn}`);
    report.push('', '| Running | Call | Calls | p50 ms | p95 ms | Errors | Timeouts | 429s |', '|---|---|---|---|---|---|---|---|');
    for (const [k, b] of [...buckets.entries()].sort()) {
      const [n, kind] = k.split('|');
      if (kind === 'check') continue;
      report.push(`| ${n} | ${kind} | ${b.calls} | ${Math.round(pct(b.ms, 50))} | ${Math.round(pct(b.ms, 95))} | ${b.errors} | ${b.timeouts} | ${b.limited} |`);
    }
    report.push('', `**Correctness:** ${checked} finished matches checked · ${mismatched} scores differ from what the referee sent · ${missing} missing · ${doubled} knockout matches drawn twice · ${wrongQualifiers} events with the wrong teams in the knockouts.`);
    if (errorText.size) report.push('', '**Errors seen:**', ...[...errorText.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([m, n]) => `- ${n} × ${m}`));
    if (verdictAbort) report.push('', `**Stopped early:** ${verdictAbort}`);
    const ok = !verdictAbort && mismatched === 0 && missing === 0 && doubled === 0 && wrongQualifiers === 0;
    report.push('', ok ? '**Result: green.**' : '**Result: needs a look.**');
    writeFileSync('load-report.md', report.join('\n') + '\n');
    console.log(report.join('\n'));
    if (!ok) process.exitCode = 1;
  } finally {
    stop = true;
    try { const c = await helper({ action: 'cleanup' }); console.log(`Cleanup: removed ${String(c.clubsRemoved)} test club(s) and everything in them.`); }
    catch (e) { console.error('Cleanup failed', e); process.exitCode = 1; }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
