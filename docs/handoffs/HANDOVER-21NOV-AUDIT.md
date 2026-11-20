# Handover, Sat 21 Nov 2026, 03:45 IST: app audit + fixes (nothing live)

## What's live
- Unchanged: pqclub `club-ref` = `d52d4b7` (deployed 20 Nov 19:54 UTC). Rollback before that: `432dce3`/`7769d98`.
- **Freeze from 2:30 pm today** (Pickle Yard event, 3 pm): no club-ref, migration, DNS or domain change, no load test.
- Nothing from this session is live. Vineeth must type **"go"** before any deploy.

## Work branch: `fix/audit-21nov` (pickleq, pushed)
Base `d52d4b7`. `npm run check` All OK (765 tests at the last full run). SQL checks pass on a local PGlite run (`docs/handoffs/s5-pglite-run.mjs`).
Done, with tests:
1. **Claim my Studio** (B2): `src/rallyq/studio/ClaimStudio.tsx` card in My Player Studio (uses existing `studio_found_players`), how-to-claim note on the signed-out Studio, "Claim in my Studio" on My entries. No migration.
2. **No double UPI payment** (C1): My entries hides "Pay by UPI" once a reference is sent.
3. **Late entry with full details** (B1/K1): `+ Add team` asks name, phone, email, DUPR, DUPR ID, age, gender, payment. New `addLateTeam` (server/demo/desk). **Migration `20261121030000_late_entry_with_details.sql`** (`add_late_team`, `desk_add_late_team`, `add_late_pool_entry_core`) + `supabase/tests/late_team_check.sql`.
4. **Public profile** (B3, C10, M7): court picture (`.ph-court`) instead of the sample man's photo for real players; "Champion · <event>" chip for a won final; same-day matches ordered final first.
5. **Create club keeps your name** (B4): **migration `20261121040000_create_club_keeps_name.sql`** + `create_club_name_check.sql`.
6. **Withdrawn teams in standings** (B5): bottom, unranked, "Withdrawn" label; public results now carry entry status.

Not yet done (audit v2 list): B6 Promote → Results card champions (was editing `PromoStudio.tsx`: add `podium` to `PromoEvent`, fill from the final in `Tournament.tsx` ~line 391), C2 "Entries closed" on a new tournament, C3 event name stays "Open Singles" after Doubles, C4 fee "per player" vs "a team", C5 counts include withdrawn, M3 TV champions mode, M6 tap targets < 44 px, C12 plurals, B10 after deleting a club, B8 code in email subject (Brevo/Supabase template), B0 paddleq.in stale app (hosting: frozen after 2:30 pm), B7 archive instead of delete, B9 robot-reset FK (issue #12), M5 hash PINs, M2 one profile per person. Robot test added only for K1 (`e2e/tests/demo.spec.ts`), claim note (`studio.spec.ts`).

## To ship (only after "go", before 2:30 pm)
1. Finish/stop, `npm run check`, build club, local robot.
2. Apply the two new migrations (late entry, create club) via Supabase `apply_migration`.
3. Merge `fix/audit-21nov` into `claude/project-thread-hdj0m3`, push; club-ref = new HEAD in pqclub; watch Build + robot.

## Audit
- Report (v2, rechecked on rallyq.in): https://claude.ai/artifact/7JjLKPyVdtPM1WCKsXYr2D
- First pass used paddleq.in, which served an **old cached app** in Chrome; findings from it are superseded.
- Test data (test club only): "Night Owls Test Cup", "Dawn Patrol Test Cup" (finished). Nightly reset is broken, so they stay.
- Test logins: vineethanumula23@gmail.com = player "Riya Testrally"; vineethboomer@gmail.com = admin of the test club (and of The Pickle Club); boomervineeth = platform admin. vinnyboomer@icloud.com = plain.
- Data fixes made: Vineeth's display name restored to "Vineeth"; test sample club created and deleted.
