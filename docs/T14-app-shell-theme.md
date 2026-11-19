# T14: app shell and theme review handover

Base: staging b8ea7bb3, created only after T1 MR !1 was merged with Vineeth's
approval and its post-merge staging app/database/Android/iPhone pipeline passed.
Branch: feature/ui-shell. Worktree and all local helpers: Downloads/pq-T14-shell.
T2 remains paused locally and unpublished. No production action.

## Result

- Glass workspace rail from 870px. Icons with accessible names and titles from
  870–1099px; labels and the existing tournament picker from 1100px.
- Below 870px: glass bottom tabs, and a separately scrollable section strip with
  overflow-x:auto, overscroll-behavior-x:contain, nowrap/fixed-flex labels, an edge
  fade, and keyboard reach to the last item. Focus removes the fade.
- Club name is first and larger than the small PaddleQ wordmark in the top bar.
  Routes and backend permissions are unchanged. Organizer/admin items wait for
  the existing permission result; ordinary members retain their limited menu.
- Auto / Light / Dark in the top bar. Phone Settings is a native disclosure in
  that bar; the existing personal Settings screen has the same shared switch.
  No new Settings route or route rename is needed.
- Live court chip counts unique public active courts, never scheduled/private
  matches. In a club workspace it describes the focused public event and opens
  its existing results URL. Other workspaces use the public live board and link
  to the sole event or existing Results tab. Zero/error = no chip. One 30-second
  timer, paused when hidden, with listener/timer cleanup and stale-response guard.
- Public score totals get a quiet, polite, atomic announcement after one second
  only when a signature changes. Initial and unchanged polls are silent, with
  at most two court descriptions plus a short remainder notice. No scoring path
  or Player Studio logic changes.

## Theme and first paint

src/theme.ts handles storage validation, save failures (fall back to Auto), device
changes and cross-tab storage changes. Entry initialization installs one listener
set; each switch subscribes to the resulting theme-change event.

The tiny inline bootstrap sets data-theme, canvas/color-scheme and theme-color
before the app script. Its exact SHA-256 is included by cspFor; no unsafe-inline
script permission was added. Browser coverage blocks the app JS entirely to
prove that the stored choice still applies before React runs.

All legacy prefers-color-scheme dark blocks, not just the new tokens, now honor
explicit dark or Auto+device dark. Forced Light is tested on a dark device;
forced Dark is tested on a light device. Existing glass fallbacks are preserved.

## Evidence and checks

The shell robot generates the full 20-view matrix at 320/390/870/1100/1440 in
Auto-light, Auto-dark, Light and Dark, plus two live-chip captures. Both Android
and iPhone CI projects run it; successful artifacts are retained for 30 days.
No screenshot binaries are committed.

e2e/tests/contrast.ts computes WCAG ratios on rendered styles, compositing alpha
glass colors over all ancestor gradient endpoints and checking the worst result.
Coverage: rail, app header, switch, phone tabs, visible badges, live signal,
selected UI borders and focus outlines: 4.5:1 text, 3:1 large text/UI.
This is scoped to the frame and visible sample-page badges, not a claim about
every screen, photographs or all possible user-provided content.

Keyboard robots cover rail order into the live chip/switch, Tab/Enter theme
changes, focus outlines, the last offscreen phone tab and phone Settings.
Unit coverage includes valid/missing/invalid/blocked storage, opposite device
theme, pre-app bootstrap, media/storage changes and cleanup, public live counts,
non-organizer navigation and preserved destinations, and score announcements.

Local checks: npm run check (VITEST_MAX_WORKERS=2), npm run build:club.
The existing demo and T1 design robot are run alongside the T14 suite.
Exact CI results and artifact links are recorded on the draft merge request.

No dependencies, migrations, backend writes, route renames or screen redesigns.
Stop for Claude/ChatGPT review and Vineeth approval. Before any next task, read
HQ STATUS/reviews and open-MR comments; fix any score below 8, push, and reply.
