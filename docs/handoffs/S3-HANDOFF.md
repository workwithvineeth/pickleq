# S3 handoff: match-day reliability and monitoring

Branch `s3-matchday` (worktree `~/Desktop/PaddleQ-s3`), draft MR !47 into `nehemiah/batch1-15nov`. Not merged, not deployed.

## Goal
Referee pad stays safe offline and on refused scores; Live page tells the truth about freshness; Sentry and PostHog behind env keys with court tokens and PINs scrubbed. Never touch score arithmetic.

## DONE
- `src/club/matchdaySafety.ts` (+test): store of unsent and blocked scores, `isPermanentScoreError` (wrong PIN, link not valid, moved, cancelled, finished), `flushLinkUnsent`.
- `src/club/screens/ScorePad.tsx` (+test): permanent error stops retries, keeps score on phone, bar "Show this screen to the desk" with reason and "Try sending again"; taps and Save disabled while blocked; offline banner.
- `src/club/screens/OfflineBanner.tsx`, `src/club/useConnection.ts`: banner after 5 s offline or unsent, with count "N scores saved on this phone"; "N could not be sent. Show this phone to the desk" on the list.
- `src/club/useFlushUnsent.ts` (+test): flush on open, on `online`, every 15 s, one at a time.
- `src/club/screens/Organiser.tsx` (S1's file, small insert in `CourtScorer`): uses the flush hook, banner, and "Result saved · Start next: A vs B" note on the list.
- `src/rallyq/live/RallyLive.tsx` (+test): "Updated n s ago" now uses the real last-poll time (was stale when data unchanged), `connectionLost` chip text, skeleton while scores load instead of sample.
- `src/monitoring/` (scrub, monitoring, hosts + tests), `src/clubApp/main.tsx`, `vite.config.ts` (CSP connect-src only when keys set), `src/vite-env.d.ts`, `docs/MONITORING.md`, deps `@sentry/browser` and `posthog-js` (lazy, only loaded when a key is set).
- Tests green when run alone: ScorePad + matchdaySafety 33, useFlushUnsent 4, RallyLive 3, monitoring 23. tsc app and node configs clean.

## LEFT (in order)
1. Run `npm run check` once, alone (Mac was overloaded; baseline 553 unit tests). Fix anything red.
2. `npm run build:club`, then the phone robot (below). Baseline 58 passed / 0 failed.
3. Add robot coverage: referee court list shows "Result saved · Start next" after a finished match; offline banner via Playwright `context.setOffline(true)`. Not written yet.
4. Check the built bundle has no sentry/posthog code in the main chunk when keys are unset, and the personal bundles (`dist/live`, `dist/preview`) are unchanged.
5. Check 320 and 390 px for the new bars (no overflow, 44 px target on "Try sending again"). Styles reuse `msg msg-bad`; not looked at visually.

## Resume commands
```
cd ~/Desktop/PaddleQ-s3
npm run check
npm run build:club
npx vite preview --mode club --outDir dist/club --port 4183
cd e2e && PQ_BASE=http://localhost:4183/pickleq/club/preview/ ./node_modules/.bin/playwright test --project=android --reporter=json > /tmp/s3.json; node summary.mjs /tmp/s3.json
```
Commits: author and committer Vineeth, no attribution lines, `git add` explicit paths. Push: `git -c credential.helper= -c credential.helper='!glab auth git-credential' push`.

## Decisions
- Permanent errors recognised by message text (server returns text only). Unknown errors are treated as temporary, so a score is never dropped.
- Refused scores are moved to a separate "blocked" store, not deleted.
- Monitoring wired only into the club app entry, not the personal app.
- PostHog: no autocapture, no recording, no profiles, `ip:false`, external script loading off. Sentry: no replay, no tracing, no user.
- Flush only for referee-link scores (`link:<token>:` keys); signed-in organiser flush (`flushUnsentScores`) unchanged.

## Risks
- `Organiser.tsx` is S1's file: expect a small merge conflict in `CourtScorer`.
- DSN/PostHog host parsing and CSP untested in a real deploy.
- Scrubbing of DUPR ids in free text is pattern-based ("DUPR ID: xxxx"); a bare id with no label would not be caught.

## NOT verified
Full unit suite, robot, bundle contents, visual layout, real Sentry/PostHog delivery, `build:club` with keys set.

## Needs a human
Create the Sentry project (DSN) and PostHog project (key); set `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` (and `VITE_POSTHOG_HOST` for EU) in the club build. Add the privacy sentence from `docs/MONITORING.md` to the site. No deploy after 2:30 pm Sun 15 Nov.
