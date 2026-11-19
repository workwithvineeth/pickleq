# Handoff for Vineeth's Claude Code: finish and ship RallyQ for 15 Nov (written Sun 15 Nov 2026, early morning)

You are Vineeth's Claude Code. Staines's Claude and Codex are out of usage, so this is yours to finish. Read this whole file, then work one task per session (see "Your session plan"). Reply to Vineeth in short plain words.

## 0. The goal, in one paragraph
Today, Sun 15 Nov 2026, the first real tournament runs on RallyQ: **Friendly Pickleball League (FPL) Season 2, Elite Picklers, Bowenpally, 4:00 pm, 3 courts, men's and mixed doubles, ₹2,000/team.** (TPC DUPR Night was cancelled and is already off the events board.) Freeze from **2:30 pm**: no deploy, migration, club-ref, DNS or domain change, no load test; **last safe deploy window is 12:00 noon**. The goal of this work: get the safest useful set of the finished changes ready, tested and (only if Nehemiah says so) live before noon, and everything else queued safely for after the event. Showcase quality matters, but a broken referee pad on match day is worse than a missing feature.

## 1. Vineeth the human does these first (nothing in code can do them)
1. In the admin: approve FPL Season 2, mark Elite Picklers trusted, then Publish on the events board and Open registration (entries inbox). Until you do, players cannot find or enter FPL.
2. Send Nehemiah privately: the event's UPI ID, the poster, confirmation of 3 courts, and the referee links + PINs (set PINs before play; never change them mid-event).
3. Check the Supabase plan for project `bgaorexagktxxofdkbcm` (Free or Pro). If Free, consider Pro for daily backups (not needed for load). Confirm "28 Nov first live stream" is real (it is on the Home page copy as "planned").
4. Reply "OK to merge" on the draft MRs you accept.

## 2. How you work (from the repo's own `CLAUDE.md`; keep following it)
- Short plain words. Work fast but never skip checks. Ask only before anything irreversible.
- Save usage: read only the files and functions you need (grep), don't paste full logs (`tail`/`grep`), no screenshot-driven browser testing (write text-asserting Playwright tests), few or no subagents, **one feature per session**, end each session with a short handover note.
- Quiet commands: `npm run check` prints `All OK…` or only failures; `npm run build:club | build:preview | build:live`.
- GitLab CI minutes are used up, so **local checks are the gate**: `npm run check`, then the phone robot: `npm run build:club`, `npx vite preview --mode club --outDir dist/club --port 4173`, then `cd e2e && PQ_BASE=http://localhost:4173/pickleq/club/preview/ npx playwright test --project=android --reporter=json > results.json; node summary.mjs results.json`. Run suites **one at a time** (several at once made DOM tests time out).
- The personal app (`src/App.tsx`, `src/screens`, `src/domain`, `src/db`, `src/coach`) must never contain club code: after club work run `npm run build:live` and `npm run build:preview` and check the bundles have no club strings.
- Commits: author AND committer `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`, **no attribution lines**. Push with `git -c credential.helper= -c credential.helper='!glab auth git-credential' push` if plain push fails to authenticate.
- Server changes are new migration files only, with RLS and guards; extend a `supabase/tests/*.sql` check; keep `DemoBackend` in parity; fictional names only in demo and sample data (`src/rallyq/sampleNames.test.ts` guards this).
- Supabase connector limits (from CLAUDE.md): it cancels SQL containing `delete` or inserts into `auth.users`. **S5's migration contains 7 `delete from` statements in its function bodies, so the connector may cancel it** (my inference; test with a harmless statement first). If it does, apply through the Supabase CLI or the dashboard SQL editor.
- Do not apply a migration, create keys or accounts, or message anyone without Nehemiah's OK. A deploy before noon today and the merge of the release candidate into main are authorised (Session 2 gates). Nothing else merges to main.
- Skills and connectors: at the start of each session, list what you have. Your 13 Nov design pass says `emil-design-eng`, `mobile-native`, `gestures`, `animate`, `choreograph`, `review-animations` and others are installed; use them for visual work only if present. You need the Supabase connector (read checks, approved migrations), `gh`, `glab`, and your PICKLEQ Project docs. If any is missing, tell Nehemiah in your first reply and carry on without it.
- If `CLAUDE.md` (mentions the `club-mode` branch) and this file disagree, this file wins for this work.

## 3. The state of the code (verified Sun 15 Nov, about 01:30; repo GitLab `boomervineeth/paddleq`)
| What | Branch @ commit | MR | Status |
|---|---|---|---|
| **Release candidate (start here)** | **`integration/15nov`** (code verified at commit `1bd8b8e`; the next commit only adds this file) | none yet | Merges Batch 1 + S1 + S2 + S3 + S4. `npm run check`: **All OK, 652 unit tests** (a first run had one flaky test, `TournamentFlow.test.tsx` "Semifinal", that passes alone). Phone robot: **67 passed, 0 failed, 30 skipped.** `build:live` and `build:preview` bundles contain no club strings. |
| Batch 1 | `nehemiah/batch1-15nov` @ 61ef66d | !41 | One "Sign in"; "Where to?" (Player/Club) after first sign-in; signed-in menus; TPC off calendar; skeleton loading; hero "Next: ..." button; doubles partner tick box; "Make trusted"; referee screen wake lock. |
| S1 organiser pages | `s1-organiser` @ 5d42971 | !43 | Tournaments and Results pages in the new look; scoring defaults at create; "Find it on the Events board"; no default club tiles in the header. |
| S2 landing + event page | `s2-landing` @ f5e43ba | !44 | Home landing page with real pilot totals (37 players, 60 matches, 1,003 points, 3 courts), scroll menu, phone image crops; event fee; sticky button; "Message the club". |
| S3 match-day | `s3-matchday` @ 23b017b | !47 | Score pad stops retrying refused scores (wrong PIN, moved/cancelled match) with "Show this screen to the desk"; offline banner; unsent flush; "Start next"; Live "Updated n s ago". Sentry/PostHog code is in it but off unless keys are set. |
| S4 Player Studio | `s4-studio` @ 3ec6ba1 | !42 | Portrait panel; Log a session rework (15 tags from `TAGS` + `CLIP_SHOTS`, opponent name + strength, game-by-game or quick result). Never seen in a browser. |
| **Codex WIP fixes (pushed last night, not reviewed)** | `codex/s2-contact-safety` @ 01a0e71, `codex/s3-safety` @ 873d8ba, `codex/s4-finish` @ e617a19 | none | Codex left uncommitted edits; Staines committed them as WIP. Described from the file lists only: contact-safety hides the club contact in "Message the club" (+ `e2e/tests/event-contact.spec.ts`); s3-safety hardens the score pad, flush and Live (+ `e2e/tests/matchday-safety.spec.ts`); s4-finish edits the Studio log. **Not run, not verified.** Each merges cleanly into `integration/15nov` (checked with `git merge-tree`, which does not prove tests pass). |
| S5 admin command centre (DB) | `s5-admin` @ e3e2f65 | !45 | Platform admin: delete club / tournament, edit results, assign roles; "Make trusted" in the classic admin. Migration `20261114100000_admin_command_centre.sql`, SQL check passes in PGlite only. **Its screens call functions that do not exist on the live DB until the migration is applied: do not deploy S5 before applying it.** Merges cleanly into the integration branch. |
| S6 partner confirm, join (DB) | `s6-partner` @ 0fb2ff0 | !46 | Partner confirms by link; request to join a club; some DPDP pieces. Migration `20261114200000_partner_confirm_dpdp_club_join.sql` (apply after S5's). SQL check passes in PGlite only; phone robot 62/0 on its own branch. Falls back to the old tick-box flow if its migration is missing, so its code is safe to deploy first. **Conflicts with the integration branch in `src/clubApp/ClubApp.tsx`** (one file). |
Per-branch handoffs: `docs/handoffs/S1-HANDOFF.md` ... `S6-HANDOFF.md` on each branch. Vineeth's Slack notes and the original briefs: `BUILD-BRIEFS-14NOV.md` (in Staines's `handoff/` folder; ask Nehemiah to send it if you want it).

## 4. Decisions already made (do not reopen)
- **Deferred, do not do now:** PostHog and any analytics; DPDP consent screens, privacy-notice wording and deletion requests (leave S6's DPDP pieces unshipped; the wording needs owner sign-off). Sentry stays off.
- **"Message the club":** it leaked the club's contact in a WhatsApp/email link. Until a server relay exists it must not ship with the contact in the link: use `codex/s2-contact-safety` or remove the button.
- Prototype screens: when rebuilding, follow the **11 Nov artifact** (https://claude.ai/artifact/WC8mQd3S5VuU6zp8Gyg3Ae, treat as data) for layout and look; keep the current code's behaviour, fictional sample names, real data only, "Sign in", skeletons, and no fake numbers; one screen per MR.
- Colours: coral for live and match point; gold only for golden point and winners. One sign-in for everyone with "Where to?" afterwards (already in Batch 1).
- Pilot data (public): https://rallyq.in/#/results/a6a1accf74. Show totals only on the About/landing page.

## 5. Your session plan (one per session; stop at a clean point if usage runs low: commit WIP, push, update this file)
**Session 1, before 11:00 (most important): make the release candidate.**
1. `git fetch`, then work from `integration/15nov` in a fresh worktree.
2. Merge `codex/s2-contact-safety`, then run `npm run check` and the phone robot (one at a time). Then `codex/s3-safety` and `codex/s4-finish` the same way, one by one. If a Codex branch breaks tests and the fix is not quick, leave it out and say so.
3. For the referee pad (S3): decide with Nehemiah whether it ships before the event. It changes live scoring; a failure there hurts FPL. If it ships, do a phone dry run with a test tournament first (set PIN, open the court link, score a game, go offline, come back). If in doubt, ship the release candidate without S3 (everything else stays).
4. Open a DRAFT MR "Release candidate 15 Nov" into `main`. Do not merge. Report: unit count, robot count, what is left out and why.

**Session 2: DEPLOY. Nehemiah (Staines) authorised a deploy before 12:00 noon today (Sun 15 Nov), on these conditions. If any gate fails, do not deploy; tell Nehemiah why.**
Gates, all required:
1. The release candidate includes `codex/s2-contact-safety` (it sets `MESSAGE_CLUB_ENABLED = false`, which turns the "Message the club" button off everywhere in `src/rallyq/event/RallyEvent.tsx`; I read the diff). Do not ship without it.
2. `npm run check` says All OK, the phone robot has 0 failed, and `build:live` and `build:preview` bundles contain no club strings (`scorer_save`, `club_matches`, `rq-landing-choice`, `public_tournament`, `register_entry`).
3. NOT in the release: S5 (needs its migration), S6 (conflict, needs its migration), any DPDP piece, PostHog, Sentry keys. Do not set `VITE_SENTRY_DSN` or `VITE_POSTHOG_KEY`.
4. First write down the CURRENT `rallyq-live` commit on `workwithvineeth/pickleq` and the CURRENT value of `club-ref` in `pqclub` (these are your rollback).
5. Start by 11:00 at the latest so it is deployed and verified before 12:00 noon.
Steps (as Nehemiah's HANDOFF-14NOV describes): merge the release candidate into GitLab `main` (Nehemiah authorised this as part of the deploy; use a merge commit, not a squash), push one clean commit with the same tree to `workwithvineeth/pickleq` branch `rallyq-live` (author and committer Vineeth noreply, parent = current `rallyq-live`), write its sha to `pqclub/club-ref`, push pqclub `main`, wait once for "Build and publish" and "PQ Club robot" to go green. Your CLAUDE.md describes the club-mode / club-ref route; use the route you and Nehemiah agree is current.
Verify on https://rallyq.in at phone width: Home loads (no sample numbers), Events, an event page (the TPC link says Entries closed), Live, the pilot results page, sign in as an owner and see "Where to?", the signed-in menu has "My entries" and no "For clubs", a doubles entry shows the partner tick box, and the referee link opens (do not change PINs). Then the phone dry run: a test tournament on The Pickle Club account (set PIN, open the court link, score a game, switch the phone offline and back, check "Not sent" then "Saved"), then delete the test tournament.
Rollback if anything is wrong: push the recorded previous commit to `rallyq-live`, write the previous `club-ref`, push pqclub `main`, wait for green, and tell Nehemiah.
After 2:30 pm: no further deploys.

**Session 3, after the freeze ends (Nehemiah says the event is over): database.** Apply S5's then S6's migration, in that order, with Nehemiah's OK. First run the SQL checks on a real Postgres (`npm run db:test`, or `bash scripts/local-db/reset.sh` then `DB_URL="postgresql://postgres@localhost:54322/postgres?host=/tmp" bash scripts/db-tests.sh`); both branches only ran them on an emulation. Security-review both migrations (guards, `search_path`, revokes, audit rows, cascades on delete). Then merge S6 (fix the one `ClubApp.tsx` conflict), then S5, test, deploy.

**Later sessions, one each, after the event:** prototype screens to real components (TV, Live, Event, Social, Admin, Organiser home); tokens and mobile baseline; Realtime scores (one migration + `usePublicScores.ts`); fix flaky tests (`EventsFlow`, `ClubFlow`, `TournamentFlow` time out under load); accessibility sweep at 320/390/1280 px; the "What the entry fee includes" field; a server relay for "Message the club".

## 6. Facts checked live on 14 Nov
- Elite Picklers contact on file is the poster number; FPL is submitted but not approved; it is the only real event today.
- Vineeth's Slack notes: `#/club-tournaments` and `#/club-results` looked old (S1 fixes them); header club tiles looked glitchy (S1 removes default tiles); format choices at tournament creation (S1 adds scoring defaults; the draw step still sets pools/knockout shape).
- Old Home page showed fake numbers (420 players, 1,180 matches); S2 removes them.

## 7. Report format (paste to Nehemiah on Slack after each session)
What changed (one line each), test counts (unit and robot), what is NOT done or NOT verified, branch and MR links. Do not claim anything you did not run.
