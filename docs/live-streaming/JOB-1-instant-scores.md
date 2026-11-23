# Job 1 — Instant scores (Supabase Realtime broadcast)

Base branch: `stream-base` (= live commit `63ab94e` + these docs). Read `CLAUDE.md` first and follow its rules.
Do only this job. Small, readable diff. Keep the existing code style.

## Goal
A referee tap shows on the Live page (`src/rallyq/live/RallyLive.tsx`), the Venue TV (`src/rallyq/tv/RallyTV.tsx`) and
any screen that uses `usePublicScores` in **≤ 2 s** (aim ~1 s). Today `src/club/screens/usePublicScores.ts` polls every 20 s.

## 1. Database: new migration `supabase/migrations/20261124010000_live_score_broadcast.sql`
Every referee/desk/organiser write ends up as an INSERT/UPDATE on `public.club_matches` (games jsonb, status, winner, court…).
- Add `public.live_score_broadcast()` (plpgsql, `security definer`, `set search_path = ''`) and an
  `AFTER INSERT OR UPDATE ON public.club_matches FOR EACH ROW` trigger `club_matches_live_broadcast`.
- Fire only when a shown field changed: `games, status, winner, court, slot, entry_a, entry_b` (`IS DISTINCT FROM`).
- Look up the tournament: only when `t.is_public and t.approval = 'approved' and t.public_slug is not null`
  (same rule as `public_tournament_rev`, migration `20261112100000`).
- Payload (small, and **only fields `public_tournament` already exposes** — see migration `20261112060000`):
  `{ "id": match id, "court", "slot", "status", "winner", "entryA", "entryB",
     "games": [ {a, b, rallies?, serve?, mode?} …  ← exactly the jsonb_strip_nulls projection public_tournament uses ],
     "at": extract(epoch from clock_timestamp())*1000 }`.
  No names, no phones, emails, PINs, tokens, side_a/side_b player ids, `points`, notes or reasons.
- Send with `realtime.send(payload, 'score', 'live:' || t.public_slug, false)` (public topic).
  - Call it **dynamically** (`if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then execute …`)
    so the migration also loads on the no-Docker local DB (`scripts/local-db/shim.sql` has no realtime schema).
  - Wrap the send in `begin … exception when others then null; end;` — a broadcast problem must **never** block or roll
    back a referee's score save.
- `revoke all on function public.live_score_broadcast() from public, anon, authenticated;`
- New SQL check `supabase/tests/live_score_broadcast_check.sql` (style of `public_tournament_rev_check.sql`; whole file in
  `begin … rollback;`; rows print `FAIL…` on a problem). If `realtime.send` is missing (local shim), create a stub
  `realtime.send` + `realtime.messages`-like capture table inside the transaction; in CI the real Supabase one is used
  (`realtime.messages` has `topic`, `event`, `payload`, `private`). Check:
  1. a score update on a public+approved tournament produces exactly one message on `live:<slug>`, event `score`,
     `private = false`, with the new games;
  2. no message for a private, or not-approved, tournament;
  3. no message when an unrelated column changes;
  4. payload keys are only the allowed ones (no `side_a`, `points`, phone/email/pin/token keys);
  5. the save still succeeds if `realtime.send` raises (replace the stub with one that raises);
  6. `anon` and `authenticated` cannot execute `live_score_broadcast()`.

## 2. Client
- `src/club/live/scoreStream.ts`: a tiny interface
  ```ts
  export interface LiveScoreMessage { id: string; court?: number; slot?: number; status: …; winner?: 'A'|'B'; entryA?: string; entryB?: string; games: PublicTournament['matches'][number]['games']; at: number }
  export type StreamStatus = 'connecting' | 'live' | 'down';
  export interface LiveScoreStream { subscribe(slug: string, onMessage: (m: LiveScoreMessage) => void, onStatus: (s: StreamStatus) => void): () => void }
  ```
  plus a pure `applyLiveMessage(data: PublicTournament, m: LiveScoreMessage): PublicTournament` (returns the same object
  when the match is unknown; never drops fields; maps games like `server.ts` `publicTournament` does, `points: ''`).
- Server: `ClubBackend` gets an **optional** `liveScores?(): LiveScoreStream`. `ServerBackend` implements it with its
  existing `this.sb` (`channel('live:' + slug, { config: { broadcast: { self: false } } }).on('broadcast', { event: 'score' }, …)`,
  status from the `subscribe` callback: SUBSCRIBED → live; CHANNEL_ERROR/TIMED_OUT/CLOSED → down). Validate the message
  shape before use (ignore anything malformed).
- Demo parity: `DemoBackend` implements `liveScores()` with a local bus: when the demo saves a score / patches a match of a
  public sample tournament, it emits the same `LiveScoreMessage` (in-memory listeners + `BroadcastChannel('rallyq-live')`
  when available, so two demo tabs work).
- `usePublicScores(slug)`:
  - Subscribe to `liveScores()` of the source that answered (first in `publicSourcesFor`). On a message: apply it at once
    with `applyLiveMessage` (ignore a message with `at` older than the last applied one for that match), set `updatedAt`,
    then schedule one confirming full fetch ~1.5 s later (debounced; a burst of taps → one fetch).
  - Keep polling as the fallback: every **20 s** while the stream is not `live`, every **60 s** while it is.
  - Reconnect when the stream drops (back off 1 s, 2 s, 5 s, 10 s, max 30 s) and on `online` / `visibilitychange`
    (visible). On reconnect, do a fetch right away (messages may have been missed).
  - Stop everything when the tournament is `done` (as today) and on unmount.
  - Return a new field `live: boolean` (true while the stream is `live`). Existing fields keep their meaning; the stale /
    "Reconnecting" labels in screens must stay honest (they read `updatedAt` / `failures`).
- `src/club/screens/LiveCourts.tsx` says "Scores refresh every 20 seconds." — show "Scores update live." when `live`,
  else keep the old line. Pass `live` down from wherever `LiveCourts` gets its data (it may need a prop).

## 3. Tests (must be green: `npm run check`, `npm run db:test`)
- `src/club/live/scoreStream.test.ts`: `applyLiveMessage` (updates games/status/winner/court; unknown match = no change;
  older `at` ignored by the hook logic).
- `src/club/screens/usePublicScores.test.ts` (fake timers, fake backend + fake stream): a message updates `data` before any
  fetch; a confirm fetch happens once after a burst; poll is 60 s when live and 20 s when down; a drop triggers reconnect
  and an immediate fetch; nothing runs after unmount.
- Demo bus test: a demo score save reaches a subscriber.

## Done when
`npm run check` prints All OK, `npm run db:test` is green, and the diff touches only what this job needs. Commit on a
branch `stream-job1` with author `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`.
In your final message list: files changed, anything you could not do, and anything you were unsure of.
