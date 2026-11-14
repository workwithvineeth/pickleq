# S2 handoff: Landing and public pages (14 Nov 2026)

Folder `~/Desktop/PaddleQ-review`, branch `s2-landing` (cut from `nehemiah/batch1-15nov`). Draft MR into `nehemiah/batch1-15nov`. Do not merge or deploy.

## Goal
Easy landing page with real data only; Event page with fee, "Message the club" and a sticky phone button. Brief: `~/Desktop/PickleQ/handoff/BUILD-BRIEFS-14NOV.md` (S2).

## Done
- Home rebuilt: `src/rallyq/home/Main.html` (template), `RallyHome.tsx`, `values.ts`.
  - One-screen hero, one button ("Next: ... " countdown, or "Live now · See live scores"), 3 photo slides from `public/rallyq/photos/{mobile,desktop}` (phone uses the mobile crops, player visible), lighter overlay, manual dots, NO autoplay, "Illustration" tag.
  - Sections with ids `what`, `coming`, `first`, `clubs`: What RallyQ does (3 cards), Coming up (real published events, else announced calendar; "Planned: first live stream on 28 Nov"), Our first tournament (37 players, 60 matches, 1,003 points, 3 courts; totals only), For clubs (3 "Illustration" photo cards, 4 steps, button), footer.
  - Top menu links scroll to sections (existing hash-link handler, reduced-motion aware), `scroll-margin-top`, active link gets class `on` (scroll listener, `activeSection()`).
  - Removed all fake numbers, sample live court, ticker, demo loop (`demoRally`), "following" count.
  - Fixed header being covered by sections once scrolled: `.hero{z-index:30}`. Hid the big lime watermark in the hero.
- Event page: `src/rallyq/event/RallyEvent.tsx`, `EventExtras.tsx`, `fee.ts`.
  - Entry fee line ("₹2,000 per team", "From ₹500 per entry") in the Entry fee card.
  - "Message the club" button + sheet (name, message) that opens WhatsApp/email from the visitor's phone. The number/email is NOT printed (Info tab says "number stays private").
  - Sticky bottom button on phones, shown only after the top button scrolls away; label follows state: Enter the event, Live scores, See the results.
- `PrototypeScreen.tsx`: added photo ids (`p-hero-m` etc.) to the blob map. `sampleNames.test.ts`: allows the pilot's real totals line (`PILOT`).
- CSS: `src/rallyq/rallyq.css` (sticky bar, sheet, hero watermark hidden; removed a hard-coded desktop slide override).

## Tests
- Unit (`npx vitest run src/rallyq`): 19 files, 75 tests passed (new: home values/render, fee, EventExtras, event values). Old `RallyHome.test.ts` replaced by `RallyHome.test.tsx` (the demo-loop tests went away with the loop); `calendarCards.test.tsx` folded into it.
- Robot `e2e/tests/landing.spec.ts` (3 tests: sections + no fake numbers + sizes 320/390/870/1280 + day/night; menu scroll + active highlight; phone hero photos, no autoplay): all 3 passed locally on `--project=android`.
- `e2e/tests/events.spec.ts`: one line added (fee text); needs the real server sandbox, NOT run.
- Full robot (android, local): 60 passed, 0 failed, 30 skipped (need the real server). Baseline 58.
- `npm run check` under load: 8 personal-app tests timed out (App, Backup, Clips, Coach, History, Lock, Log); re-run alone they pass 28/28. Typecheck and lint were not separately confirmed from that run.

## Screenshots looked at (Playwright, own port 4392)
Home at 320, 390, 1280, dark and light; Event (mocked public_event row) at 320, 390, 1280 dark/light, sticky bar and message sheet at 320/390. No horizontal overflow at any size.

## Left (in order)
1. Re-run `npm run check` on a quiet machine to confirm typecheck, lint and all unit tests.
2. (Done once, 60 passed) Full robot: `npm run build:club`, `npx vite preview --mode club --outDir dist/club --port 4392`, then in `e2e/`: `PQ_BASE=http://localhost:4392/pickleq/club/preview/ ./node_modules/.bin/playwright test --project=android --reporter=json > /tmp/s2.json; node summary.mjs /tmp/s2.json`. Expect 58 + 3.
3. Event page: "what the entry fee includes" is not stored anywhere, so only the fee is shown.
4. Optional: dim the sticky bar behind the message sheet; hero heading overlaps the net on wide screens (readable).

## Decisions
- Hero photos: hero-night-rally, social-champions, player-competitor (player clearly visible). Illustration cards for clubs: tv-board-arena, social-result, club-night.
- Dropped the live-score card in the hero: sample scores were fake. Live is only a button label.
- Message the club: no server exists for relaying messages (needs a migration, not mine). The link target still contains the club's number inside the opened WhatsApp URL, but it is not shown on the page. True hiding needs a server relay.
- Pilot name "TPC Diwali Dhamaka" is a real club name; allowed in `sampleNames.test.ts` for the PILOT line only.

## Not verified
Real phone; the Event page against the real server; day-mode contrast with a checker (looked fine by eye); `localhost:4173` not used.

## Needs a human
Vineeth to approve the images, the copy ("Three things, done well.", "Run your event on RallyQ."), and the Message-the-club approach.
