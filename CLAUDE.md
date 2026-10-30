# PICKLEQ: working notes for Claude (read this instead of exploring)

The owner is Vineeth, a non-developer founder. Reply in short, plain words. Work fast but never skip checks, deploys or features. Ask only before anything irreversible.

## What's where
- **Personal app** (players): `src/App.tsx`, `src/screens`, `src/domain`, `src/db` (Dexie), `src/coach`. It ships on `main` → Preview (`/pickleq/preview/`) and on `live` → Live (`/pickleq/`). It must **never** contain club code. Check the built `dist/live` and `dist/preview` bundles after club work.
- **PQ Club app** (clubs and organisers), on branch **`club-mode` only**:
  - `src/clubApp`: its own entry, tabs and manifest; `vite.config.ts` swaps the entry in `--mode club`.
  - `src/club`: backend interface, `server.ts` (Supabase) and `demo.ts` (on-phone demo with the same rules), `plan.ts` (draw, schedule, withdraw, late entry), `registration.ts`, `domain/` (engine: standings/tie-breaks, knockouts, scheduling; sample data), `screens/`.
  - `supabase/migrations` (RLS, security-definer functions with guards), `supabase/tests/*.sql` (each rolls back; rows say FAIL on a problem), `supabase/functions/robot-reset`.
  - `e2e/` robot (Playwright, Android + iPhone): `e2e/tests/*.spec.ts`, `e2e/season-sim.ts` (10 tournaments, 300 players).
- **Published club site**: repo `workwithvineeth/pqclub` → https://paddleq.in/ (since 31 Oct 2026; old github.io/pqclub/ links forward there, checked by the robot). It builds the `pickleq` commit named in its `club-ref` file (`deploy.yml`, plus an hourly rebuild for WhatsApp share pages). `robot.yml` runs the robot after deploys, nightly and on demand.
- Supabase project `bgaorexagktxxofdkbcm`. Project docs (claude.ai Project "PICKLEQ") hold handovers, milestones and requirements; read the latest `claude/handover-*.md` first.

## Commands (quiet by design: read the one-line result, not full logs)
- `npm run check`: typecheck, lint and unit tests. Prints `All OK…` or only the failures.
- `npm run build:club` | `build:preview` | `build:live`.
- Robot locally: `npx vite preview --mode club --outDir dist/club --port 4173`, then `cd e2e && PQ_BASE=http://localhost:4173/pickleq/club/preview/ npx playwright test --project=android --reporter=json > results.json; node summary.mjs results.json`. Webkit may be missing locally; CI has it.
- `npm run db:test`: all SQL checks against a local Supabase (`supabase start`). In CI this runs automatically.

## CI does the heavy work (don't poll it in loops)
- `pickleq/.github/workflows/club-checks.yml`: on every push to club-mode, runs app checks and database checks. On failure it opens or updates one issue labelled `club-checks` (closed on the next green run).
- `pqclub` robot: on failure it opens or updates one issue labelled `robot` with only the failed tests and errors.
- To check a run: `gh api repos/workwithvineeth/pqclub/actions/runs?per_page=3 --jq '.workflow_runs[]|"\(.name) \(.head_sha[0:7]) \(.status) \(.conclusion)"'`, or read the open issue. Wait once with Monitor; don't sleep-poll.

## Rules
- Commits: author `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`, with your session's attribution lines at the end. Run `git fetch && git merge origin/main` on club-mode before every push.
- Deploy club: push `club-mode`, write the HEAD sha to `pqclub/club-ref`, push pqclub `main`, then make sure the deploy and robot are green.
- Server changes are new migration files (never edit old ones), with RLS and guards. Revoke private helpers from `authenticated` too. Add or extend a `supabase/tests/*.sql` check. Keep `DemoBackend` in parity and bump `SAMPLE_EVENTS_VERSION` when sample data changes.
- Supabase connector limits: it cancels SQL with `delete` or inserts into `auth.users`. Signed-in checks act as Vineeth (sub `81b32feb-1a70-47c3-b0b4-9eb4a81a12dd`) in rolled-back transactions. Multi-user checks run in CI (`db:test`).
- UI: phone-first (no overflow at 320 px), plain English, accessible labels (the robot finds things by role and label). New features get unit tests **and** robot coverage.
- Fictional names only in demo and sample data.

## Saving usage
- Read only the files and functions you need (use grep); don't read whole big screens. Don't paste full logs; pipe through `tail`/`grep`.
- No screenshot-driven browser testing. Write text-asserting Playwright tests and let CI run them.
- Few or no subagents. One feature per session; end with a short handover in the Project.
