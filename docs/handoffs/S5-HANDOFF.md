# S5 Admin command centre: handoff (14 Nov 2026)

Branch `s5-admin` (cut from `nehemiah/batch1-15nov`), draft MR into that branch. Worktree used: `~/Desktop/PaddleQ-s5` (the shared `PaddleQ-review` checkout is used by other sessions on other branches; do not switch branches there).

## Goal
Vineeth could not delete his test clubs or tournaments. The platform (RallyQ) admin gets the full command centre: delete a club, delete a tournament (typed-name confirmation, audit row), edit results, assign club roles; club "Approve" reads "Make trusted" everywhere including the classic admin dashboard. Server changes are NEW migration files with guards, tested, NEVER applied (freeze Sun 15 Nov 2:30 pm; the project is Vineeth's).

## DONE
### Migration `supabase/migrations/20261114100000_admin_command_centre.sql` (not applied anywhere)
All functions are `security definer`, `set search_path = ''`, raise unless `auth.uid()` is set and `is_platform_admin()`, `revoke execute ... from public, anon`, `grant execute ... to authenticated` (they check the admin inside). Existing `public.audit()` writes `platform_audit` rows.
- `admin_delete_tournament(p_tournament, p_confirm_name)`: exact name; refuses a live tournament; deletes score corrections (their FKs are `on delete restrict`), matches, divisions, tournament (rest cascades). Audit `admin_tournament_delete` with name, date, match/registration counts.
- `admin_delete_club(p_club, p_confirm_name)`: exact name; refuses while any of its tournaments is live; deletes corrections then the club (cascade). Audit `admin_club_delete`.
- `admin_edit_match_result(p_match, p_games, p_reason, p_updated_at)`: copy of `correct_club_match` rules (reason 3-300, stale-check on `updated_at`, legal scores, bye refused) WITHOUT the pool-complete / knockout-exists locks; a knockout winner still cannot change. Writes `club_score_corrections` (reason prefixed "PaddleQ admin:") and audit `admin_result_edit`; uses the `paddleq.correcting_match` setting to pass the completed-score guard trigger.
- `admin_club_members(p_club)` (jsonb list with user_id, email, role, helper, support, name), `admin_set_member_role` (owner/admin/coach/player; last owner cannot be demoted), `admin_add_club_member(p_club, p_email, p_role)` returns 'added' (account exists) or 'invited' (row in `club_claims`, applies at sign-up), `admin_remove_club_member` (last owner cannot be removed). Audit `admin_role_set|add|invite|remove`.
No new tables, so no new RLS; the existing `platform_audit` read policy (platform admins) applies.

### SQL check `supabase/tests/admin_command_centre_check.sql` (23 steps, rolls back, rows say FAIL on a problem)
Covers every function, name mismatch, live refusal, last-owner rules, stale/illegal/knockout edits, non-admin refused, visitor (anon) closed. Needs a second `auth.users` row, so run it in CI/local DB, not the Supabase connector.
RUN RESULT: all 23 SQL checks in `supabase/tests` (22 old + this one) pass in **pglite** (an in-memory Postgres emulation, with `pgcrypto` stubbed). NOT run on real Postgres/Supabase; no Postgres or Docker on this Mac. Re-run it on the real local DB before applying.

### App code
- `src/club/backend.ts`: interface methods `adminDeleteClub`, `adminDeleteTournament`, `adminEditMatchResult`, `adminClubMembers`, `adminSetMemberRole`, `adminAddClubMember`, `adminRemoveClubMember`; type `AdminMember`.
- `src/club/server.ts`: RPC calls for each. `src/club/demo.ts`: same rules on the phone demo (live refusal, typed name, cascade, last owner, audit, `emails` map in demo state).
- `src/club/screens/AdminControl.tsx` (new): `DeleteForGood` (type the name to enable), `AdminPeople` (roles list, change, remove, add by email).
- `src/club/screens/Admin.tsx`: "Make trusted" / "Remove trust" button (aria-label "Make trusted: <club>"), pill "Not trusted yet", Delete club on each club card, Delete tournament + "Edit results" on each event card, club page uses `AdminPeople` and a delete box. `src/club/screens/ResultsDupr.tsx`: admins use `adminEditMatchResult` (override of locks) instead of `correctMatch`. The prototype admin (`src/rallyq/admin/RallyAdmin.tsx` + `Admin.dc.html`) already said "Make trusted".
- Tests: `src/club/adminControl.test.ts` (5 new, pass); updated `src/EventsFlow.test.tsx` and `e2e/tests/events.spec.ts` for the renamed trust button; robot spec `e2e/tests/admin-control.spec.ts` (3 tests, 320 px, demo backend). Fixing a finished score as admin is covered by existing `p0-delivery.spec.ts` (demo user is an admin).

## LEFT (in order)
1. `npm run check` fully green on a QUIET machine. Full runs here failed 1 to 14 DOM tests (ClubFlow/EventsFlow "Your name in the demo" timeouts) while the Mac's load average was ~39 (other sessions); the same files pass when run alone (ClubFlow 23/23, EventsFlow 13/13, adminControl 5/5). Types and lint passed. Expect 553 baseline + 5 new.
2. `npm run build:club`, then `npx vite preview --mode club --outDir dist/club --port 4190`, then in `e2e/`: `PQ_BASE=http://localhost:4190/pickleq/club/preview/ ./node_modules/.bin/playwright test --project=android --reporter=json > /tmp/s5.json; node summary.mjs /tmp/s5.json`. Baseline 58 passed / 0 failed; expect 3 more (admin-control.spec.ts) and fix any selector issue (this spec has NOT been run yet).
3. Also `npm run build:live` / `build:preview` bundles must contain no club code (CLAUDE.md rule); this change touches only `src/club`.
4. Real-DB SQL run (see commands). Then hand to Vineeth.

## Commands
```bash
cd ~/Desktop/PaddleQ-s5 && npm run check
# SQL checks without Postgres/Docker (emulated, what I used):
mkdir -p /tmp/pgl && cd /tmp/pgl && npm init -y && npm i @electric-sql/pglite
cp ~/Desktop/PaddleQ-s5/docs/handoffs/s5-pglite-* /tmp/pgl/   # run.mjs reads stubs next to it
node /tmp/pgl/s5-pglite-run.mjs ~/Desktop/PaddleQ-s5 admin_command_centre_check.sql   # one check; omit the name for all
# Real local Postgres 16 (preferred): bash scripts/local-db/reset.sh && DB_URL="postgresql://postgres@localhost:54322/postgres?host=/tmp" bash scripts/db-tests.sh
```
(`s5-pglite-run.mjs` needs `@electric-sql/pglite` resolvable: run it from a folder where it is installed, e.g. copy it into `/tmp/pgl`.)

## Decisions
- Raise exceptions (like `delete_tournament`) rather than the older `{error}` jsonb style; `check()` in server.ts surfaces the text.
- Refuse deleting anything live: a mis-tap must not wipe a running event (admin can Mark finished first).
- Admin delete also removes `club_score_corrections` (kept with "restrict" for normal use) because otherwise a club/tournament with corrected scores could never be deleted.
- Edit results reuses the existing correction screen; knockout winner stays locked because the bracket depends on it.
- Roles by email for unknown users go to `club_claims` (existing mechanism consumed at sign-up in 0002).

## Risks / review points
- Security: all functions gated by `is_platform_admin()`; confirm none is callable by `authenticated` non-admins (tested) and `anon` (tested). `admin_club_members` exposes member emails to platform admins only (same as `admin_clubs`).
- Deletion is irreversible by design (audit row keeps name and counts only). Hard deletes of a club cascade widely: review the FK list if new tables were added after this migration.
- `admin_add_club_member` with role `owner` can create a second owner; intended.
- Demo `adminAddClubMember` always returns 'added' (no accounts in the demo).
- The audit log screen (`#/admin/audit`) shows existing `platformAudit()` rows; new action names show as raw text (e.g. `admin_club_delete`).

## NOT verified
Real Postgres/Supabase run; the robot spec; the full `npm run check` result at time of writing; 390 px layout beyond the 320 px assertions; iPhone project.

## Needs a human
Vineeth applies `20261114100000_admin_command_centre.sql` to project `bgaorexagktxxofdkbcm` AFTER the freeze ends (never before; no migration/DNS/club-ref change during the event). Do not merge or deploy this MR before then.
