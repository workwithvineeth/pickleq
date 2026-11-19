# Codex brief · RallyQ Arena v2 wiring (Fri 20 Nov 2026)

You are working with Claude on a **reskin only** of rallyq.in. Claude does the visual layer (CSS and the
`.dc.html` templates). **You do the data wiring.** Never change the database, `supabase/`, the scoring rules in
`src/club/domain/`, the referee pad's logic (`src/club/screens/ScorePad.tsx`), or any user flow.

Read first: `CLAUDE.md`, `docs/RESKIN-LOG.md`, `docs/arena-v2/build-spec.md` (sections 5, 6, 10).
The approved target is `docs/arena-v2/prototype-no-images.html` (images stripped). Its `<script>` has the
reference code: `QPATH`, `QPTS`, `qAt`, `qSig` (~line 1246) and `drawQ` / `tags` / `runOf` (~line 1320).

## Save your work constantly (usage limits can stop you at any time)
- Work on branch `codex/reskin-wiring`. After **every** small step that passes `npm run check`:
  `git add -A && git commit -m "<what>" && git push -u origin codex/reskin-wiring`.
- Commit author: `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`.
- Append one line per step to the "Log" section of `docs/RESKIN-LOG.md` (prefix `Codex ·`), commit and push it.
- Never push to any other branch. Never force-push.

## How we work (Vineeth's rule)
We are developing an **existing, tested product**. Do not invent features, rename things, refactor, restyle,
add dependencies or scaffold anything. Do **only the one task Claude names in the prompt**, in the files it
names, then stop. Claude reviews every diff before the next task and reverts anything outside scope.
If something in the task looks wrong or unclear, write the question in the log, commit, push and stop.

## Task 1 · Rally record (pure, tested)
New file `src/rallyq/arena/rallies.ts` (+ `rallies.test.ts`).
`ralliesOf(game, doubles): Rally[]` builds the spec's rally record from what a game already stores
(`points` | `rallies` + `mode` + `serve`; see `scoredPoints` in `src/club/liveView.ts` and
`replaySideOut` in `src/club/domain/sideout.ts`). Do not change those files; replay with them.
`Rally = { n, winner: 'A'|'B', outcome: 'point'|'side_out'|'second_server', serverTeam: 'A'|'B'|null, serverNo: 1|2|null, before: string, after: string }`.
- Rally scoring games (`mode==='rally'` or only `points` stored): every rally is a `point`, server unknown → `null`.
- Side-out games: use the replay to mark `side_out` / `second_server` and the server.
Also export: `currentRun(rallies)` (points in a row by the same team, points only), `servingNow(game, doubles)`
→ `{team, no, call}` or null, `level(rallies)` (scores level after one side trailed by 3+).
Tests: rally game, doubles side-out with second server, singles side-out, empty game, undo (shorter string).

## Task 2 · Living Q and Match DNA (pure React, tested)
New file `src/rallyq/arena/LivingQ.tsx`: `<LivingQ rallies confirmed winner? />` → `<svg viewBox="0 0 100 100">`
port of `drawQ`: base Q path (stroke `var(--ink)`, opacity .3, or .9 when confirmed), one `<line>` per rally
(outward + `var(--sea)` for A, inward + `var(--tide)` for B, length 10 for points and 4.5 for side-outs /
second server, max 32 slots per game), `<title>` per stroke, ball circle at 83,83 in `var(--ball)`. Add
`className="lqs"` on the newest line so CSS can draw it (Claude styles it). Rally count goes in a sibling, not the SVG.
New file `src/rallyq/arena/Dna.tsx`: `<Dna rallies />` → `<div class="dna">` with one `<i>` per rally,
classes `a`/`b` for the winner, `so` for side-out/second-server, `run` for the current run of 3+, `now` on the
last one; `title` = "Rally n · point · 7-5-1 → 8-5-1".
Unit tests render both with Testing Library and check counts, classes and titles.

## Task 3 · Wire into Live and TV (values only)
- `src/rallyq/live/RallyLive.tsx`: in the real-data branch, keep everything that exists and add to each court
  `rallies` (from the current game). In `liveValues` add to `sel`: `q` (a `<LivingQ/>` element), `dna`
  (a `<Dna/>` element), `rallyCount`, `servingA`/`servingB` (`'on'` or `''`), `serverNo`, `call`
  (e.g. `7-5-2`, '' when unknown), `tagA`/`tagB` ('' | 'Level' | 'Game point' | 'Match point' | 'N in a row').
  The sample venues get rallies made from their `pts` strings (rally scoring). Keep every existing value
  and test passing; do not touch the `LIVE_SOURCE` `.replace(...)` anchors (Claude edits the template).
- `src/rallyq/tv/RallyTV.tsx`: same fields on each court object (`c.q`, `c.dna`, `c.tagA`...). Do not change
  the existing motion in `tv/motion.ts`.
- Stale rule (spec section 7): where Live/TV now style a lost connection with coral, give it the class
  `chip stale` instead (Signal grey with ◷). Coral stays only for "act now" items.

## Done for each task
`npm run check` prints `All OK`, committed and pushed, log line added. Then go to the next task.
If you are blocked, write the question in the log, commit, push and stop.
