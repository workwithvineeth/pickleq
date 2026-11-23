# Job 2 — Score overlay page for OBS

Base branch: `stream-base`. Job 1 (instant scores inside `usePublicScores`) runs in parallel in another branch; just use `usePublicScores(slug)` as it is today — it will become instant when Job 1 merges. Don't edit `usePublicScores.ts`. Read `CLAUDE.md`.
Do only this job. Small, readable diff.

## Goal
A transparent page that OBS adds as a **Browser Source** (Chromium) on top of the camera picture, so the score is burned
into each court's YouTube stream. Mockup: `docs/live-streaming/mockups/overlay.html` ("Score overlay on the stream";
the two photos in it are the camera picture, **not** part of the page). Match it.

## Route
- `#/overlay/<slug>/<court>`. Add `'overlay'` to `RouteName` in `src/navigation.ts`. `parseRoute` today keeps only one id
  segment: keep `{ name:'overlay', id: '<slug>/<court>' }` (join the rest) without changing any other route's behaviour; add a
  unit test for it. Mount it in `src/clubApp/ClubApp.tsx` **before** any shell/strip/UpdatePrompt (no app chrome at all).
- Query options read from the hash (`#/overlay/slug/1?bar=top&scale=1.1`) or `location.search`:
  `bar=bottom|top` (default bottom), `scale` clamped to 0.75–1.25 (default 1).
- Read-only, public, same public rule as other live pages (it only uses `usePublicScores`).

## Page: `src/rallyq/overlay/ScoreOverlay.tsx` (+ `overlay.css` or a style block)
- Fixed 1920×1080 stage scaled to the window (`transform: scale(min(vw/1920, vh/1080) * scale)`, origin top-left), so it
  fits both 1920×1080 and 1280×720 sources with nothing cut off.
- **Transparent**: while mounted, set `html, body, #root { background: transparent !important }` and remove it on unmount.
  No theme background, no scrollbars (`overflow:hidden`).
- Colours (Arena v2 Night tokens, never maroon/cream): Night `#06140D` panels at ~94% opacity, Chalk `#F1F4EA` text,
  Ball `#D9F24A` (leading score, serve dot, Game/Match point chip), Sea `#76E0D0` rail for team A, Tide `#7EAEF2` rail for
  team B, Coral `#FF655C` only for the LIVE chip. Gold only for a confirmed final result. Fonts: Archivo (numbers),
  DM Sans (text), JetBrains Mono (small caps lines) — use the fonts the app already loads; fall back gracefully.
  Never write "Powered by".
- Layout (sizes at 1920×1080 = 1.5× the mockup's 1280×720 numbers):
  - **Top-left**: coral `LIVE` chip (only while the match is live) + chip "<event name> · Court N".
  - **Bottom-left score bar** (`bar=top` moves it to top-left, under the chips): RallyQ Q mark tile; two team rows
    (rail, names, serve dot on the serving side, game dots = games won out of games needed, big points; leader's points in
    Ball); side panel with stage + game (`SEMI-FINAL 1 · G2` style, from `STAGE_LABEL`/match), the referee call
    (e.g. `9-7-2`, from `serveOf` in `src/rallyq/tv/motion.ts` for side-out; for rally scoring `a-b`), and a
    `GAME POINT` / `MATCH POINT` / `GOLDEN POINT` chip from `pointLabel` (same file).
  - **Bottom-right**: `EVERY COURT LIVE` + `RALLYQ.IN`.
- Long names: one line, ellipsis, never overlap the points.
- Which match: use `courtMatches(d)` from `src/club/liveView.ts` for that court (live first, then next scheduled).
  - Live or just finished → the score bar.
  - Nothing live but a scheduled match → small bar "Next: A v B" (+ stage).
  - Nothing at all / unknown slug / court → only the small Q mark, bottom-left. Never an error box on stream.
- Motion: only the existing **Count** motion (count up one point per `COUNT_STEP_MS`, `countStep`/`stepAll` from
  `tv/motion.ts`). Nothing else moves. Respect reduced motion (jump).
- Accessible: the page root has `aria-label="Score overlay, Court N"`; team rows readable by the robot
  (e.g. `aria-label="<names>, <points> points"`).

## Tests
- Unit (`ScoreOverlay.test.tsx`, Testing Library, fake `usePublicScores` or demo data): shows the right names, points,
  call and chip for a live match; "Next: A v B" between matches; only the mark with no match; `bar=top` and `scale`
  clamping; transparent background class added and removed.
- Robot: `e2e/tests/overlay.spec.ts` on demo data (see how other e2e tests open a demo/sample tournament): open
  `#/overlay/<sample slug>/1`, assert team names and points text, and that no element is outside the viewport at
  1280×720 and 1920×1080 (compare bounding boxes).

## Done when
`npm run check` All OK, robot spec written (and passing locally if Playwright runs in your sandbox — say if not).
Branch `stream-job2`, PR into `stream-base`, author `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`.
Final message: files changed, test results, anything not done or unsure.
