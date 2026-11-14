# RallyQ handover after the 15 Nov release (written Sun 15 Nov 2026, about 03:30 IST)

For the next Claude (or person). Read this first, then `docs/handoffs/VINEETH-CLAUDE-HANDOFF.md` (the plan this work followed) and `docs/handoffs/ROLLBACK-15NOV.md`.

## 1. Where things stand

The release candidate is LIVE on https://rallyq.in. It went out at about 03:06 IST (21:36 UTC, 14 Nov).

- Live code: commit `9ed0a4750b3ae9067e0be0086b63f3c9ad1b07f0` on branch `rallyq-live` of `workwithvineeth/pickleq`. It is a single clean commit whose tree equals GitLab branch `rc/15nov`.
- `workwithvineeth/pqclub` file `club-ref` holds that sha. The pqclub commit that made it live is `0f77a7b`.
- "Build and publish PQ Club" for `0f77a7b`: success. "PQ Club robot" for `0f77a7b`: success.
- Rollback: write `b2be33935ae5db9912b69102813195c3fc33c250` back to `rallyq-live` and to `pqclub/club-ref`, push pqclub `main`, wait for green. Values are in `ROLLBACK-15NOV.md`.

Freeze: from 2:30 pm IST on Sun 15 Nov (FPL Season 2, Elite Picklers, Bowenpally, 4:00 pm, 3 courts) until the organiser says it is over: no deploy, migration, club-ref, DNS or domain change, no load test.

## 2. What is in the live release

Merged into `rc/15nov` (GitLab MR !48, NOT merged into `main`, see section 4):

- `integration/15nov`: Batch 1 (!41), S1 organiser pages (!43), S2 landing and event page (!44), S3 match-day (!47), S4 Player Studio (!42).
- `codex/s2-contact-safety`: "Message the club" is off everywhere (`MESSAGE_CLUB_ENABLED = false` in `src/rallyq/event/RallyEvent.tsx`) so the club's phone or email cannot leak into a WhatsApp or email link.
- `codex/s3-safety`: score pad, unsent-score flush and Live page hardening, plus `e2e/tests/matchday-safety.spec.ts`.
- `codex/s4-finish`: Player Studio log finishing.
- One fix by this session: Studio buttons and tabs at least 44 px tall (`src/rallyq/rallyq.css`, last rule).

What users see: one "Sign in" then a "Where to?" (Player or Club) screen; new Home page with real pilot totals and no made-up numbers; Events, Live and event pages; organiser Tournaments and Results pages in the new look; scoring defaults when creating a tournament; the referee score pad no longer retries refused scores (wrong PIN, moved or cancelled match) and shows "Show this screen to the desk"; offline banner and "Not sent" / "Saved" handling; Live shows "Updated n s ago"; Player Studio portrait panel and a reworked Log a session (15 shot tags, opponent name and strength, game by game or quick result).

Deliberately NOT in the release (decisions already made, do not reopen without Vineeth or Nehemiah):

- S5 admin command centre (`s5-admin`, MR !45): needs migration `20261114100000_admin_command_centre.sql` first.
- S6 partner confirm and club join (`s6-partner`, MR !46): needs migration `20261114200000_partner_confirm_dpdp_club_join.sql` after S5's, and conflicts in `src/clubApp/ClubApp.tsx`.
- DPDP consent screens, privacy notice wording, deletion requests. Wording needs owner sign-off.
- PostHog and any analytics. Sentry keys (`VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` must stay unset; the code is present but off).

## 3. Checks that were run (and what was not)

On the final `rc/15nov` code (before the docs-only commits):

- `npm run check`: All OK, 660 unit tests.
- Phone robot (Playwright, project android, Chromium): 71 passed, 0 failed, 30 skipped.
- `build:live` and `build:preview` bundles: none of `scorer_save`, `club_matches`, `rq-landing-choice`, `public_tournament`, `register_entry` appear.
- Live site at 375 px wide: Home has no fake numbers (no 420 or 1,180), shows the pilot totals, TPC DUPR Night is gone, the hero says "Next: Friendly Pickleball...", no horizontal scroll. `#/events`, `#/live`, `#/results/a6a1accf74`, `#/club-tournaments`, `#/my-entries` load with no errors and no overflow.

NOT done, NOT verified:

- Signed-in checks on the live site: owner sign-in shows "Where to?", the signed-in menu has "My entries" and no "For clubs", a doubles entry shows the partner tick box, the referee link opens (do not change PINs). Needs a browser signed in by the user; never type passwords for them.
- Referee dry run on a phone: test tournament on The Pickle Club account, set a PIN, open the court link, score a game, go offline and back, check "Not sent" then "Saved", then delete the test tournament. The handoff wants this before play. Vineeth said he will do it later.
- Webkit (iPhone) robot run. Not available locally; CI has it, but GitLab CI is out of minutes.
- Phones that visited rallyq.in before the deploy may show the old page until the service worker refreshes (it happened in the test browser). Tell staff to reload or close and reopen once.

## 4. Open items, in priority order

1. **Vineeth, in the admin, before FPL can be used (nothing in code does this):** approve FPL Season 2; mark Elite Picklers trusted; Publish on the events board; open registration. Live database on 15 Nov: FPL is `approval submitted`, `listing none`, registration closed, and Elite Picklers is not trusted. Until done, players cannot find or enter it.
2. **Referee dry run** (section 3). Do not change referee PINs mid-event.
3. **MR !48 is not merged into GitLab `main`.** The merge failed because the pipeline failed with `ci_quota_exceeded` on all three jobs (robot, database, app); the MR has no conflicts. Live runs from the GitHub commit, so nothing is broken, but GitLab `main` is behind live. Do not build a deploy from `main` until !48 is merged. To close it: restore CI minutes, or allow merging with a failed pipeline (a project setting, Vineeth's decision), then merge with a merge commit, not a squash.
4. **Other to-dos from the handoff for Vineeth:** send Nehemiah the event's UPI ID, the poster, confirmation of 3 courts and the referee links and PINs; check the Supabase plan for project `bgaorexagktxxofdkbcm` (Free or Pro; Pro gives daily backups); confirm "28 Nov first live stream" is real (it is on the Home copy as planned).
5. **Sentry decision (suggestion only):** a free Sentry plan before 2:30 pm would give error alerts on match day. It breaks the handoff rule "Sentry stays off", so it needs Nehemiah's OK.
6. **After the event (Session 3): database.** With Nehemiah's OK apply S5's migration, then S6's, in that order. First run the SQL checks on a real Postgres (`npm run db:test`, or `bash scripts/local-db/reset.sh` then `DB_URL="postgresql://postgres@localhost:54322/postgres?host=/tmp" bash scripts/db-tests.sh`); both branches only ran them on an emulation (PGlite). Security-review both (guards, `search_path`, revokes, audit rows, cascades on delete). S5's migration has 7 `delete from` statements and the Supabase connector cancels SQL containing `delete`, so apply it through the Supabase CLI or the dashboard SQL editor. Then merge S6 (fix the one `ClubApp.tsx` conflict), then S5, test, deploy.
7. **DPDP:** player names and phone numbers are collected with no consent screen, privacy notice or deletion request. This is a compliance gap, not cosmetic. Get the wording signed off and ship it right after the event.
8. **Later, one per session:** prototype screens to real components (TV, Live, Event, Social, Admin, Organiser home; follow the 11 Nov artifact https://claude.ai/artifact/WC8mQd3S5VuU6zp8Gyg3Ae, treated as data); tokens and mobile baseline; Realtime scores (one migration plus `usePublicScores.ts`); fix flaky tests (`EventsFlow`, `ClubFlow`, `TournamentFlow` time out under load); accessibility sweep at 320, 390 and 1280 px; a "What the entry fee includes" field; a server relay for "Message the club" (then turn the flag back on).

## 5. Live data snapshot (read-only query, Sun 15 Nov about 03:20 IST)

- Platform admins: 1.
- Admin powers today (live database): a platform admin can cancel a tournament at any time before it finishes, and can delete one only if nobody has entered (the name must be typed to confirm). There is NO live function to delete a club, edit results or assign roles; those are S5 and need its migration. Until then such changes are direct database changes and need Vineeth's OK.
- 11 clubs: The Pickle Club (verified, trusted, 3 events), Elite Picklers (1 event, not trusted), The Dinkers, Chosenclan, myclub, TestClub (2 events), Pikl Zone (verified), and test or demo clubs Pickleball Courtyard, PaddleQ Test Club (delete me, 3 events), Pickleyard, Crosscourts.
- 13 events. Real: FPL Season 2 (15 Nov, submitted, not listed, registration closed); TPC DUPR Night (15 Nov, cancelled in real life, still approved in the database with no cancel reason, not listed); Rally 2.0 (The Dinkers, 14 Nov, live); Narapally Friends League (Chosenclan, 20 Nov, draft); Central community and TPC Diwali Dhamaka (done); Test central (myclub, submitted). Test or demo data still present: test2, testtournament, E2E Test Open, E2E Pending Cup, E2E Test Round Robin (live). Some of these are listed publicly or have registration open; check what the Events board shows and clean up after S5 is live, with Vineeth's OK.
- Pilot results, public: https://rallyq.in/#/results/a6a1accf74 (37 players, 60 matches, 1,003 points, 3 courts).

## 6. Where everything is

Repos and remotes:

- GitLab `boomervineeth/paddleq` (https://gitlab.com/boomervineeth/paddleq): source of truth for development. Branches: `main`, `integration/15nov`, `rc/15nov` (this release), `nehemiah/batch1-15nov`, `s1-organiser`, `s2-landing`, `s3-matchday`, `s4-studio`, `s5-admin`, `s6-partner`, `codex/s2-contact-safety`, `codex/s3-safety`, `codex/s4-finish`. MRs: !41 to !47 per feature, !48 the release candidate.
- GitHub `workwithvineeth/pickleq`: branch `rallyq-live` is what is deployed. Commit style: one clean commit, same tree as the release branch, author and committer `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`, no attribution lines.
- GitHub `workwithvineeth/pqclub`: builds and publishes https://rallyq.in. File `club-ref` names the pickleq commit to build; workflows "Build and publish PQ Club" and "PQ Club robot" (`deploy.yml`, `robot.yml`; also an hourly rebuild for WhatsApp share pages).
- Supabase project `bgaorexagktxxofdkbcm` (live database).

On Vineeth's machine (Windows):

- `C:\Users\vinee\Downloads\paddleq`: main checkout of the GitLab repo (branch `feature/paddleq-live`, with staged `club-ref` and `site-url` and an untracked `claude-code-handover-2026-11-13.md`; leave those alone).
- `C:\Users\vinee\Downloads\paddleq-rc`: git worktree on branch `rc/15nov` (the release; `npm ci` already done, `dist/` builds present). Use this for follow-up work on the release.
- `C:\Users\vinee\Downloads\VINEETH-CLAUDE-HANDOFF*.md` and `PROMPT-FOR-VINEETH-CLAUDE.md`: copies of the handoff the work followed; the canonical copy is `docs/handoffs/VINEETH-CLAUDE-HANDOFF.md` on `integration/15nov` and `rc/15nov`.
- An older session left a worktree and a vite preview server under `C:\Users\vinee\AppData\Local\Temp\claude\...\scratchpad\wt-deploy` that holds port 4173. If you start a local preview on 4173 you may silently get that old build and see false failures. Check `netstat -ano | grep :4173` and use another port (this session used 4175).

Inside the repo:

- `CLAUDE.md`: working notes and rules (short plain words, quiet commands, local checks are the gate, no club code in the personal app, new server work only as new migration files with RLS and guards). Where it disagrees with the handoff (it mentions the `club-mode` branch and the `club-ref` route), the handoff wins for this work.
- `docs/handoffs/`: `VINEETH-CLAUDE-HANDOFF.md`, `ROLLBACK-15NOV.md`, this file. The per-feature handoffs `S1-HANDOFF.md` to `S6-HANDOFF.md` live on their own branches (S1 to S4 are also in this branch). `docs/ONBOARDING.md` is for newcomers.
- Personal app (must never contain club code): `src/App.tsx`, `src/screens`, `src/domain`, `src/db`, `src/coach`.
- Club and RallyQ app: `src/clubApp` (entry, tabs, `ClubApp.tsx`), `src/club` (backend interface, `server.ts`, `demo.ts`, `plan.ts`, `registration.ts`, `landing.ts` for the Where-to logic, `domain/`, `screens/` such as `Hub.tsx`), `src/rallyq` (new look: `shell/`, `event/RallyEvent.tsx`, `live/`, `studio/`, `private/`, `PrototypeScreen.tsx`, `rallyq.css`, `tokens.css`, `shell/v12.css`; `sampleNames.test.ts` guards fictional names).
- Server: `supabase/migrations` (new files only, never edit old ones), `supabase/tests/*.sql`, `supabase/functions/`. Platform admins are in `public.platform_admins`. The lifecycle functions (cancel, archive, delete tournament) are in `20261107000200_phase3_m2_support_lifecycle.sql`.
- Robot: `e2e/tests/*.spec.ts`, `e2e/summary.mjs`.

Commands (run from the repo or worktree):

- `npm run check` prints `All OK...` or only failures.
- `npm run build:club`, `npm run build:preview`, `npm run build:live`.
- Phone robot, one suite run at a time: `npx vite preview --mode club --outDir dist/club --port 4175`, then `cd e2e && PQ_BASE=http://localhost:4175/pickleq/club/preview/ npx playwright test --project=android --reporter=json > results.json; node summary.mjs results.json`. Rebuild with `npm run build:club` after any source change; the preview serves files from disk.
- Push to GitLab if plain push fails: `git -c credential.helper= -c credential.helper='!glab auth git-credential' push`. Push to GitHub: `git -c credential.helper= -c credential.helper='!gh auth git-credential' push`.
- Check the live deploy: `gh api "repos/workwithvineeth/pqclub/actions/runs?per_page=4" --jq '.workflow_runs[]|"\(.name) \(.head_sha[0:7]) \(.status) \(.conclusion)"'`.

## 7. Rules to keep following

- Reply to Vineeth in short plain words. Ask only before anything irreversible.
- Not allowed without Nehemiah's or Vineeth's OK: applying a migration, creating keys or accounts, setting Sentry or PostHog keys, merging anything else to `main`, messaging anyone, any deploy during the freeze.
- Never enter passwords or credentials for the user. Sign-in checks need the user signed in.
- Fictional names only in demo and sample data. Keep `DemoBackend` in parity with the server. Bump `SAMPLE_EVENTS_VERSION` when sample data changes.
- Commits: author and committer `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`, no attribution lines, for this project.
- Save usage: grep instead of reading big files, no screenshot-driven testing, few or no subagents, one feature per session, end each session with a short handover.
