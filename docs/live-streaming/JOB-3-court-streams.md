# Job 3 — YouTube links per court (organiser) + video on the Live page

Base branch: `stream-base` after Jobs 1–2 are merged. Read `CLAUDE.md`. Mockups: `docs/live-streaming/mockups/`
`organiser.html` ("Organiser · live streams"), `watch-desktop.html`, `watch-phone.html`. Match them (Arena v2 Night tokens:
Night #06140D, Ball #D9F24A, Chalk #F1F4EA, Sea #76E0D0 team A, Tide #7EAEF2 team B, Coral #FF655C live only; never
maroon/cream, never "Powered by").

## A. Link parser — `src/club/live/youtubeLink.ts` (pure) + exhaustive `youtubeLink.test.ts`
`parseYouTubeLink(input: string): { ok: true; videoId: string } | { ok: false; reason: string }`
- Trim. Must parse with `new URL` and protocol `https:` (also accept `http:` → treat same) — anything else fails.
- Host must be **exactly** one of: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be`,
  `youtube-nocookie.com`, `www.youtube-nocookie.com` (compare `url.hostname`, lower-case; no suffix/contains matching).
- Accept: `/watch?v=ID`, `youtu.be/ID`, `/live/ID`, `/embed/ID` (youtube + nocookie), `/shorts/ID` is **not** required.
  Extra query params (`&t=10s`, `&si=…`, `&list=…` alongside v) are fine.
- ID must match `^[A-Za-z0-9_-]{11}$`.
- Reject (with a plain reason the UI can show, e.g. "That isn't a YouTube video link. Paste the link from YouTube's Share button."):
  look-alike hosts (`youtube.com.evil.in`, `evil.com/youtube.com/watch?v=…`, `youtube.co`), `javascript:`, `data:`,
  iframe HTML (`<iframe …>`), playlist-only (`/playlist?list=`), channel/handle links (`/channel/…`, `/@name`, `/c/…`,
  `/user/…`), `/results`, wrong-length or bad-char IDs, empty input, very long input (> 500 chars).
- Tests: at least every accepted form + every rejected kind above, plus whitespace and upper-case host.

## B. Database — new migration `supabase/migrations/20261124020000_court_streams.sql` + `supabase/tests/court_streams_check.sql`
- Table `public.court_streams`:
  `id uuid pk default gen_random_uuid()`, `tournament_id uuid not null references public.tournaments(id) on delete cascade`,
  `court int not null check (court between 1 and 64)`, `provider text not null default 'youtube' check (provider = 'youtube')`,
  `video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$')`, `visible boolean not null default false`,
  `status text not null default 'unknown' check (status in ('unknown','upcoming','live','ended','unavailable'))`,
  `embeddable boolean`, `checked_at timestamptz`, `created_by uuid`, `created_at timestamptz default now()`,
  `updated_by uuid`, `updated_at timestamptz default now()`, `unique (tournament_id, court)`.
  Enable RLS with **no** policies for anon/authenticated (all access through functions). Index on tournament_id.
- Organiser rule: the caller's `public.club_role(t.club_id) in ('owner','admin')` (see `0014_desk_access.sql`), or a platform
  admin if the repo already has such a check used by organiser functions (find how e.g. `set_desk_pin` guards). Desk-token
  versions are optional (only if trivial, using `desk_check`).
- Functions (security definer, `set search_path = ''`, raise a clear error when not allowed):
  - `set_court_stream(p_tournament uuid, p_court int, p_video_id text)` → upsert (keeps `visible` as is; new rows hidden).
    Re-check the id regex server-side.
  - `set_court_stream_visible(p_tournament uuid, p_court int, p_visible boolean)`.
  - `clear_court_stream(p_tournament uuid, p_court int)` → delete the row.
  - `court_streams_for(p_tournament uuid)` → organiser read (all rows incl. hidden).
  - `public_court_streams(slug text)` → **anon read**: only `visible` rows of a tournament where
    `is_public and approval = 'approved'`; returns only `court, video_id, status, embeddable, checked_at`.
  - Grants: organiser functions to `authenticated` only; `public_court_streams` to `anon, authenticated`; revoke all from
    `public` first; revoke any private helper.
- SQL check (rolls back; FAIL rows): organiser can set/show/hide/clear; a non-member and anon cannot; bad id refused;
  public read hides hidden rows and private/unapproved events and exposes no audit columns; court out of range refused.

## C. Backend + demo
- `ClubBackend`: `courtStreams(tournamentId)`, `setCourtStream(tid, court, videoId)`, `setCourtStreamVisible(tid, court, v)`,
  `clearCourtStream(tid, court)`, and on the public side `publicCourtStreams(slug): Promise<CourtVideo[] & {court}>`
  (reuse `CourtVideo` from `src/club/liveView.ts`). Server + `DemoBackend` (parity, stored with the demo data; bump
  `SAMPLE_EVENTS_VERSION` only if sample data changes).

## D. Organiser screen — "Live streams"
- Route `club-streams/<tournamentId>` (add to `withId` in `src/navigation.ts`), linked from the tournament menu in
  `src/rallyq/shell/Shell.tsx` next to "TV board" (label "Live streams").
- Courts 1..N (N = the tournament's number of courts, or the highest court used, at least 1). Each court row:
  link field (label "YouTube link for Court N"), Save; status chip **Live / Starting soon / Stream linked / No link**
  (from `videoState()`; without a status check it can only say "Stream linked", never "LIVE"); button
  "Show to fans" ↔ "Showing to fans" (aria-pressed); "Check now" (re-reads status; disabled with a note if no checker);
  "Copy overlay link" (copies `<origin><base>#/overlay/<slug>/<court>`; shows "Copied").
- Help line: "Hiding removes it from RallyQ only. The stream keeps running on YouTube."
- Before the **first** Show on this tournament, a confirm step: "Players and spectators must know they are being filmed.
  Put up the filming notice at the venue before you show streams to fans." [Cancel] [I've told them — show it].
- Bad link → the parser's plain message under the field, nothing saved.
- 44 px targets, labels for every control, no overflow at 320 px.

## E. Live page video — `src/rallyq/live/RallyLive.tsx` (or `LiveCourts`; pick the cleaner)
- Load `publicCourtStreams(slug)` (re-read every 60 s, and when the tab becomes visible).
- With at least one visible stream: 16:9 video stage (youtube-nocookie embed like `CourtStage`), court tabs, other courts'
  streams as small tiles (thumbnail `https://i.ytimg.com/vi/<id>/mqdefault.jpg`, tap = switch court), "Watch on YouTube ↗".
  Desktop: video beside/above the board as in `watch-desktop.html`; phone as in `watch-phone.html`.
- **The iframe must never reload on a score change**: render it in a component keyed by `video_id` only, memoised, with
  no score props; add a unit test that re-rendering with new scores keeps the same iframe element.
- **"Synced to video"** switch (role switch, on by default) + "Delay N s" (default 3, 0–30). While on, RallyQ's own board
  shows the score as it was N seconds ago (keep a small time-stamped buffer of `data` snapshots from `usePublicScores`;
  show the newest snapshot older than N s). Off = "Instant scores". Remember the choice in localStorage (try/catch).
  Only shown when a video is shown.
- **No video linked: the page must look exactly as it does today** (add a test).
- No overflow at 320 px.

## F. Optional (only if time allows; ask before starting): status check Edge Function
`supabase/functions/stream-status`: YouTube Data API `videos.list?part=liveStreamingDetails,status&id=…`, key from a
Supabase secret `YOUTUBE_API_KEY`, ~60 s cache per id, writes `status/embeddable/checked_at`. Without a key: no change
("Stream linked"). Doc: how to create the key (Google Cloud console → YouTube Data API v3 → API key, restrict to that API).

## Tests / done when
Parser tests, SQL check, unit tests for the organiser screen (save, bad link, show/hide with consent step, copy overlay
link) and the Live page (video shown, iframe not reloaded, sync switch, no-video = unchanged), robot spec
`e2e/tests/streams.spec.ts` on demo data (organiser pastes a link → Live shows the video frame; Hide removes it; bad link
message). `npm run check` All OK. Branch `stream-job3`, PR into `stream-base`, author
`Vineeth <349021697+workwithvineeth@users.noreply.github.com>`. Final message: files changed, tests, not done, unsure.
