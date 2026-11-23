# Job 4 — Venue TV on instant scores (+ optional square fit)

Base branch: `stream-base` after Jobs 1–3. Read `CLAUDE.md`. Small diff.

- `src/rallyq/tv/RallyTV.tsx` (`#/club-tv/<slug>`, run full screen on the venue laptop for the LED wall) must use Job 1's
  instant scores (it already calls `usePublicScores`; check nothing else in it throttles updates, e.g. a separate timer or
  the Count motion queueing more than needed). The stale / sync label must say live when `live` is true and still turn
  into the coral warning when updates stop (`STALE_MS`, `STALE_FAILURES` in `tv/motion.ts`).
- Optional `?fit=square` (read from the hash query like Job 2's overlay): for square LED walls (9×9 ft, maybe 12×7 ft),
  lay the 16:9 board at the top (full width, 16:9) and below it a band with a QR code (`qrcode-generator`, already a
  dependency) to `<origin><base>#/live/<slug>` and the words "Watch live on rallyq.in". Night background.
  Without `fit=square` the TV is unchanged.
- Tests: unit test that the TV re-renders a new score from a live message without waiting for a poll (fake stream), and
  that `fit=square` shows the QR band with an accessible label ("QR code: watch live on rallyq.in") while the default
  doesn't. Robot: extend the existing TV spec (find it in `e2e/tests`) with `fit=square`.
- Done when `npm run check` All OK. Branch `stream-job4`, PR into `stream-base`, author
  `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`. Final message: files changed, tests, not done, unsure.
