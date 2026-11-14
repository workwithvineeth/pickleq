# S1 Organiser pages: handoff (14 Nov 2026 night)

## Goal
Brief: `~/Desktop/PickleQ/handoff/BUILD-BRIEFS-14NOV.md`, section S1. Move `#/club-tournaments` and `#/club-results` to the new look; audit every signed-in organiser route at 390 and 1280 px; scoring defaults at create-tournament; overview link to the Events board; header strip (RallyQ logo only on public pages, club tiles only on that club's own pages).

## Done
- `src/clubApp/Tabs.tsx`: Tournaments and Results rebuilt inside `OrgShell` + `PageHead` (v12 tokens, `card list`, status pills). Routed from `ClubRoutes.tsx`; `club-tournaments`, `club-results`, `club-claim`, `club-join` added to `BARE` in `ClubApp.tsx`. `OrgTab` gained `results` (side menu item "Results & DUPR").
- Route audit (demo club, 390 + 1280): everything was already v12 except `club-claim` (`studio/Claim.tsx`) and `club-join` (`Hub.tsx` `ClubJoin`): both now in `PublicShell` + `PageHead` + `Legacy`. `club-sharing` is a personal-app route and redirects to My clubs (unchanged).
- Create tournament (`Tournament.tsx`, `Formats.tsx`): `ScoringDefaultsFields`/`withScoring`/`scoringOf` in Formats.tsx; shown for "Players request entry" (roster mode already showed full FormatFields). Saved through `draftToDivision`; the draw step (`Inbox.tsx`) starts from `divisionToDraft`, so they stay in sync. "Golden point" sets pools AND knockouts; "Games to" sets pools and every knockout round.
- Overview: "View public page" replaced by "Find it on the Events board" (`src/club/boardLink.ts`, `RallyOverview.tsx`). `Events.tsx` got a small `focus` prop (scrolls to the event card). NOTE: Events.tsx is S2's file; the change is ~8 lines, expect a trivial merge.
- Header strip: `PublicShell` no longer defaults to the fake `ALL_CLUBS` tiles (constant removed); a tile shows only when a page passes its own `host` (event page, public results, Results & DUPR public view). `Hub.tsx` no longer passes a tile for a single club.
- Tests added: `src/club/boardLink.test.ts`, `src/club/screens/Formats.scoring.test.ts`, `src/clubApp/Tabs.test.tsx`, additions in `src/rallyq/shell/Shell.test.tsx` and `src/clubApp/ClubApp.test.tsx`, robot `e2e/tests/organiser-pages.spec.ts` (5 tests).

## Last results
- `npm run check`: typecheck + lint pass; unit tests all pass except load-flaky timeouts in `ClubFlow.test.tsx` / `EventsFlow.test.tsx` (known flaky under load; both files pass when run alone: 36/36).
- Robot (android, local): full run 60 passed / 3 failed / 30 skipped (baseline 58/0). Of the 3: `header-consistency #/live` passed on rerun (flake); my overview test was fixed (now 5/5 organiser-pages pass); `design-tokens T1` times out at its 300 s cap on this loaded machine (8 passes, slow) in both runs. NOT checked against baseline: rerun it on a quiet machine or on the base branch to confirm it is not a regression.

## Left (ordered)
1. Re-run `design-tokens.spec.ts` on a quiet machine and on the base branch (see above). Full robot command: `cd e2e && PQ_BASE=http://localhost:4391/pickleq/club/preview/ ./node_modules/.bin/playwright test --project=android --reporter=json > /tmp/s1-robot.json; node summary.mjs /tmp/s1-robot.json`. 
2. Existing robot specs that look for the old Tournaments/Results markup (`match-row`, "Header") may need updates: grep e2e/tests for `club-tournaments`, `club-results`, `Create Tournament at`.
3. Visual look at 390/1280 of Tournaments and Results (script: scratchpad audit.cjs idea: demo club, then goto each route).
4. Not-published club tile rule: only the public pages above pass a host; organiser pages (OrgShell) still show their own club tile by design.

## Resume
- Worktree: `~/Desktop/PaddleQ-s1`, branch `s1-organiser` (do not use `~/Desktop/PaddleQ-review`, S3's).
- `npm run build:club && npx vite preview --mode club --outDir dist/club --port 4391`
- Unit: `npm run check`. Robot: command in item 1.
- git: `git -c credential.helper='!glab auth git-credential' push`; author/committer Vineeth <349021697+workwithvineeth@users.noreply.github.com>, no attribution lines.

## Decisions
- Reused OrgShell/PageHead/`card list` so the pages match Hub/ClubView without new CSS.
- Scoring defaults live in Formats.tsx so creation and the draw share one definition.
- Events-board link scrolls via a prop on EventsBoard rather than a new route.

## Risks / not verified
- No visual screenshot review by a human; checked structurally (v12 frame present, no old frame, no overflow) only.
- Server-backed (non-demo) behaviour not exercised; demo backend only.
- No migrations were needed or written.

## Needs a human
- Vineeth to eyeball Tournaments/Results on desktop and phone; decide merge order (S1 after Batch 1 !41).
