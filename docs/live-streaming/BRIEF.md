# Build brief: live streaming + instant scores (24 Nov 2026)

**For:** the RallyQ build agent. **From:** Vineeth (written up by the growth agent).
**Event:** Pickleball Central Open, Peerzadiguda, 4 courts, **29 Nov** (confirm the date with Vineeth; their own poster says 28 Nov).
**Deadline:** everything merged, deployed and green by **26 Nov night**. 27 Nov is the venue test day.

## How to work: let Codex build, you review
Vineeth wants **Codex to do the coding**, and you to **check it, fix it and prove it works**:
1. Split the work into the 4 jobs below. Give Codex one job at a time, with the exact files, rules and acceptance checks from this brief.
2. Review every Codex change yourself: read the diff, run `npm run check` and `npm run db:test`, run the robot, and fix anything wrong. Don't merge on Codex's word.
3. Ship only when every acceptance check below passes. At the end, write a short handover in the Project and tell Vineeth in plain words what works.

## Read first
- `CLAUDE.md` in `workwithvineeth/pickleq` (rules, commands, deploy, the **event-day freeze**).
- **Which code is live:** `pqclub/club-ref` = `63ab94e` (branch `claude/project-thread-hdj0m3`, Arena v2 screens). Build on top of that commit. `main` and `club-mode` are older; check how they relate before merging.
- **Look:** Arena v2, always Night on TV and the overlay. The tokens are in `src/rallyq/tokens.css` and `docs/arena-v2/build-spec.md`. `CLAUDE.md`'s "maroon/cream" line is out of date: the brand is RallyQ Night #06140D, Ball #D9F24A, Chalk #F1F4EA, Sea #76E0D0 (team A), Tide #7EAEF2 (team B), Coral #FF655C for live only, Gold only for a confirmed result. Never "Powered by".
- **Approved mockups:** https://claude.ai/artifact/TWy6mbuY4r4tKiK49WQeQg. It has 4 screens: Watch live (desktop), Score overlay, Watch live (phone), and Organiser live streams. Match them.
- **Earlier stream spec:** Project doc `claude/codex-prompt-paddleq-live.md`. Reuse its data model, security rules and link parser. **Ignore its PaddleQ name and maroon/cream colours.**

## What exists today (checked 24 Nov on `63ab94e`)
- **Scores are slow:** `src/club/screens/usePublicScores.ts` polls every **20 s** (it checks `public_tournament_rev` first, then downloads the whole tournament). The Live page (`src/rallyq/live/RallyLive.tsx`) and the Venue TV (`src/rallyq/tv/RallyTV.tsx`) both use it, so fans and the LED screen run up to 20 s behind the referee.
- **The video player is half built:** `src/club/screens/LiveCourts.tsx` has `CourtStage`, a youtube-nocookie embed per court with status labels. `src/club/liveView.ts` has `CourtVideo` and `videoState()`. **Nothing passes `videos`:** `Tournament.tsx` mounts `<LiveCourts>` without it, there's no table for stream links, and `RallyLive`/`RallyTV` show no video.
- No overlay page, and no Supabase Realtime anywhere in `src`.

## Job 1: instant scores (top priority)
**Goal:** a referee tap shows on the Live page, the Venue TV and the overlay in **≤ 2 s** (aim for about 1 s).
- Use **Supabase Realtime** to push a change, not polling.
  - Preferred: a trigger on `club_matches` (and whatever table the referee pad writes points to) that broadcasts a **small** message on a public topic per tournament, e.g. `live:<public_slug>`. The message carries the match id, court, current points, games, server and status, or at least the new `public_tournament_rev`.
  - Public tournaments only (`is_public` and `approval = 'approved'`, the same rule as `public_tournament_rev`). No names beyond what public pages already show, and no PINs, phones, emails or tokens.
- In `usePublicScores` (or a sibling hook), subscribe to that topic. On a message, update the shown score straight away, then confirm with a fetch.
  - **Keep the 20 s poll as a fallback** and slow it to 60 s while the socket is healthy.
  - Reconnect on drop. The existing stale or "Reconnecting" labels must stay honest.
- Check the Supabase free-plan Realtime limits (concurrent connections, messages a month) in the docs. Size for 4 courts × about 500 viewers. Write the numbers you used in the handover.
- Keep `DemoBackend` in parity (demo mode can use a local event bus).
- **Accept when:** two browsers, one on the referee pad and one on Live or TV, show a point in ≤ 2 s on 20 taps in a row. Wi-Fi off and on recovers without a reload. A unit test covers the hook's message and fallback logic, and an SQL test covers the trigger and topic rules.

## Job 2: score overlay page for OBS
**Goal:** a transparent page that OBS adds as a Browser Source on top of the camera picture, so the score is part of the YouTube stream.
- New route, for example `#/overlay/<slug>/<court>`. It's 1920×1080, has a **transparent background** and no app chrome, and it is read-only and public (same public rule).
- Layout as in the mockup **"Score overlay on the stream"**:
  - **Bottom-left score bar:** a Q mark; two team rows with Sea and Tide rails, names, a serve dot, game dots and big points; a side panel with stage, game, referee call (e.g. `9-7-2`) and a Game point or Match point chip.
  - **Top-left:** a coral LIVE chip and "<event> · Court N".
  - **Bottom-right:** "EVERY COURT LIVE · RALLYQ.IN".
- Uses Job 1's instant scores. The score animation is the existing **Count** motion from `tv/motion.ts`, and nothing else moves.
- Between matches it shows the next match on that court ("Next: A v B"). When nothing is scheduled it shows only the small RallyQ mark.
- Query options: `?bar=bottom|top` and `?scale=0.75–1.25`, so a crew can fit it.
- **Accept when:** it loads in OBS's browser source (Chromium) with a transparent background, the score changes in ≤ 2 s after a tap, nothing is cut off at 1280×720 or 1920×1080, and there's a robot test that the page shows the right names and points.

## Job 3: YouTube links per court (organiser) + video on the Live page
- **Data:** a table `court_streams`, per the earlier spec (`tournament_id`, `court`, `provider='youtube'`, `video_id` checked against `^[A-Za-z0-9_-]{11}$`, `visible`, `status`, `embeddable`, `checked_at`, audit fields). Writes only through security definer functions guarded by the existing organiser or desk rules (find them; `club_role()` and the desk token functions). Public read only through a function that returns visible streams for public events. New migration, plus an SQL test.
- **Link parser:** a pure function with exhaustive unit tests. It accepts `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/live/`, `youtube.com/embed/`, `m.youtube.com` and `youtube-nocookie.com/embed/`. It rejects everything else, including look-alike hosts such as `youtube.com.evil.in`, `javascript:`, iframe HTML, playlist-only or channel links, and wrong-length IDs.
- **Organiser screen**, as in the mockup **"Organiser · live streams"**: courts 1..N, each with a link field, a status chip (Live / Starting soon / No link), "Show to fans / Showing to fans", "Check now", and "Copy overlay link". Add the help line "Hiding removes it from RallyQ only…" and the filming consent reminder before the first Show.
- **Status check (optional, if time allows):** an Edge Function calls the YouTube Data API `videos.list` (part `liveStreamingDetails,status`) using a key held in a Supabase secret, cached for about 60 s. Without a key, the badge reads "Stream linked", never "LIVE". Document how Vineeth creates the key.
- **Live page,** as in the mockups **"Watch live · desktop"** and **"Watch live · phone"**:
  - Video at 16:9 above or beside the Arena board, with court tabs, other courts as video tiles, and "Watch on YouTube ↗".
  - Feed `videos` into `LiveCourts`, or build the stage inside `RallyLive`; pick the cleaner one.
  - **The iframe must never reload when the score changes:** mount it once per `video_id`.
  - **"Synced to video" switch, on by default:** delays RallyQ's own board by N seconds (default 3, settable 0–30) so it doesn't spoil points ahead of the YouTube video. "Instant scores" turns the delay off.
  - **No video linked:** the page looks exactly as it does today.
- **Accept when:** pasting a real (unlisted) test live link shows the video on Live for desktop and phone; Hide removes it; a bad link is refused with a plain message; parser tests and SQL tests are green; and there's no overflow at 320 px.

## Job 4: Venue TV keeps working
- `RallyTV` uses Job 1's instant scores. The LED screen (9×9 ft, maybe 12×7 ft) is fed by a laptop running `#/club-tv/<slug>` full screen.
- Add `?fit=square`, which lays the 16:9 board on top with a "Watch live on rallyq.in" QR band below for square LED walls. This one is optional.

## Venue setup this supports (for context)
- 8 rented **DJI Osmo Action 5 Pro** cameras, 2 per court (main camera behind the baseline, side camera at the net).
- Each camera streams over a dedicated 5 GHz router (RTMP from the DJI Mimo app, up to 1080p30) to a laptop.
- Each laptop runs OBS: main camera full screen, side camera as a corner window, and **the Job 2 overlay as a Browser Source**. It streams one YouTube live per court (ultra-low latency, embedding allowed).
- The organiser pastes the 4 links into Job 3's screen.

## Rules that must hold
- Server changes are **new migrations only**, with RLS, guards and an SQL test. Revoke private helpers.
- Phone-first, 44 px targets, contrast ≥ 4.5:1, accessible labels (the robot finds things by role and label), no overflow at 320 px.
- Fictional names only in demo and sample data.
- No secrets in the client. The YouTube key goes in a Supabase secret.
- **Freeze:** on event day, from the start of play until the organiser says it's over, no `club-ref`, migration, DNS or domain change and no load test.
- Deploy per `CLAUDE.md`: push, write the sha to `pqclub/club-ref`, push `pqclub`, then deploy and robot green.

## Hand back to Vineeth (by 26 Nov night)
- A plain-words list of what works, with links: Live page, the overlay link for each court, the organiser screen, and the TV.
- A 5-step "set up OBS with the overlay" note for the laptop crew.
- Anything not done, and why.
