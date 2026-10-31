# PaddleQ: developer onboarding

Written 31 Oct 2026 for a second developer joining Vineeth (owner, non-developer founder). Read this first, then `CLAUDE.md` in this
repo (commands and rules) and the latest handover in the claude.ai Project "PADDLEQ" (`claude/handover-*.md`).

## 1. What PaddleQ is
- **PaddleQ** (https://paddleq.in) is a free pickleball **tournament app for clubs** in India: clubs create tournaments, players
  enter (rules, waitlist, UPI payment *recorded*, never collected), organisers make the draw, referees score point by point on a
  court link, the desk runs the day, players follow live results and "My matches", and results export to DUPR.
- **PaddleQ admins** (Vineeth) approve clubs to host, review event listings and support clubs from the admin dashboard.
- A separate **personal app** (PICKLEQ, players' own match/training diary, offline, branch `main`/`live`) shares this repo but
  **must never contain club code**. It's out of scope for club work.

## 2. Architecture
| Part | What | Where |
|---|---|---|
| App | React 18 + Vite + TypeScript PWA, phone-first, works offline for scoring | repo `workwithvineeth/pickleq`, branch **`club-mode`**: `src/clubApp` (entry, tabs), `src/club` (logic), `src/club/screens` |
| Backends | One interface (`src/club/backend.ts`), two implementations with the **same rules**: `server.ts` (Supabase) and `demo.ts` (everything on the phone, for the admin demo and tests) | `src/club` |
| Logic | Draw, schedule, knockouts, standings and tie-breaks, late entry, withdraw, time estimate, pre-flight check | `src/club/plan.ts`, `src/club/domain/engine.ts`, `estimate.ts`, `preflight.ts` |
| Database | Supabase Postgres (project `bgaorexagktxxofdkbcm`, Mumbai, **free plan**). Row-level security on every table; anything a visitor (no account) can do goes through guarded `SECURITY DEFINER` functions | `supabase/migrations/*.sql` (never edit an old one) |
| Edge functions | `pin-sign-in` (organiser email + personal PIN), `robot-reset` (robot sandbox), `load-test` (load robot). Robot ones prove the caller with a **GitHub OIDC token**: no stored secrets | `supabase/functions/*` |
| Hosting | GitHub Pages from repo **`workwithvineeth/pqclub`**: its `club-ref` file names the pickleq commit to publish | `pqclub/.github/workflows/deploy.yml` |
| Domain | paddleq.in bought at GoDaddy, **DNS at Cloudflare** (A records → GitHub Pages, grey cloud), HTTPS by GitHub | Cloudflare dashboard |
| Email | **Brevo** SMTP (sender PaddleQ <hello@paddleq.in>) plugged into Supabase Auth; codes, not links. hello@ forwards to Vineeth's Gmail (Cloudflare Email Routing) | Supabase → Auth → SMTP |

### Who can do what (the important security model)
- **Organisers** sign in with email + password (8+, letters and numbers, leaked passwords refused). Club roles: owner, admin,
  coach (co-organiser), player. Staff = owner/admin/coach.
- **Referees** have no account: a **court link** + the tournament's **referee PIN** opens only that court's matches.
- **The desk** has no account: its own **desk link** + **desk PIN** (6 digits, never the referee PIN) opens only that tournament's
  desk (scores, moves, walkovers, late entries, withdrawals). **No phone numbers**, no other tournaments, no settings. It stops
  when the tournament is marked finished. Five wrong PINs lock a link for a while.
- **Players' phone numbers** live only in `registrations`, readable by that club's staff and the player. The **club owner's phone**
  (`club_contacts`) is readable only by PaddleQ admins and the club's owner/admins.
- **Visitors** see public results (names and scores only) and the events board.

## 3. Run it locally
```bash
git clone https://github.com/workwithvineeth/pickleq && cd pickleq && git checkout club-mode
npm ci
npm run check            # typecheck + lint + ~330 unit tests; prints "All OK…" or only the failures
npm run build:club       # the PaddleQ app → dist/club
npx vite preview --mode club --outDir dist/club --port 4173   # open http://localhost:4173/pickleq/club/preview/#/demo
```
The local build talks to the real Supabase project (publishable key in `.env.club`, safe to be public). Use **`#/demo`** to try
everything on your phone without touching real data (the demo is for PaddleQ admins; locally, with no server reachable, it opens).

## 4. Tests (all must pass before a deploy)
- **Unit tests:** `npm run check`.
- **Database checks:** `supabase/tests/*.sql` (each runs in a rolled-back transaction; any row with "FAIL" fails). In CI they run
  on a fresh local Supabase built from the migrations. Without Docker: `bash scripts/local-db/reset.sh` then
  `DB_URL="postgresql://postgres@localhost:54322/postgres?host=/tmp" bash scripts/db-tests.sh` (needs PostgreSQL 16).
- **Robot (Playwright, Android Chrome + iPhone Safari):** `e2e/tests/*.spec.ts`. Locally:
  `cd e2e && npm ci && PQ_BASE=http://localhost:4173/pickleq/club/preview/ npx playwright test --project=android`.
  Server tests run only in GitHub Actions (they reset the robot's sandbox club through `robot-reset`).
- **Load robot:** `e2e/load/load.ts`, run from pqclub → Actions → **Load test** (up to 20 tournaments at once, 5 → 10 → 20;
  refuses while a real tournament is on; always deletes what it made). Report in the run summary.
- **Design audit:** every screen at 390 and 320 px, light and dark: no overflow, tap targets ≥ 44 px, contrast ≥ 4.5:1, brand
  colours only (`claude/brand-guide.md`).

## 5. Deploy
1. Commit to `club-mode` (author `Vineeth <349021697+workwithvineeth@users.noreply.github.com>`), `git fetch origin main && git merge origin/main`, push.
2. **Club checks** CI (pickleq → Actions) must be green. On failure it opens a `club-checks` issue.
3. Database changes: a **new** migration file, applied to the real project (Supabase dashboard SQL editor, the Supabase CLI
   `supabase db push`, or the Supabase connector) with the name in its first line (e.g. `club_mode_20_fk_indexes`).
4. Write the commit sha into `pqclub/club-ref` and push pqclub `main` → **Build and publish** → **PQ Club robot** must be green
   (on failure: a `robot` issue with the failed tests).

## 6. The freeze rule
While a real tournament is running (and from 2:30 pm on its day until the organiser says it's over): **no deploys, no migrations,
no DNS or domain changes, no load test.** Data work (entries, draw, accounts) is fine. The load robot enforces its part itself.

## 7. Accounts and who owns them
| Service | Owner | Access for a second developer |
|---|---|---|
| GitHub `workwithvineeth/pickleq`, `workwithvineeth/pqclub` | Vineeth | Collaborator (Write) |
| Supabase org "workwithvineeth's Org" (free plan) | Vineeth | Member, **Developer** role |
| Cloudflare (DNS, email routing for paddleq.in) | Vineeth | Only if needed: member, DNS-only role |
| Brevo (email sender) | Vineeth | Only if needed: user with limited rights |
| GoDaddy (domain registration) | Vineeth | Not needed |
| PaddleQ app | Vineeth is platform admin | Admin → Admins → add their email after they sign up |
| claude.ai Project "PADDLEQ" (handovers, decisions) | Vineeth | Shared if his plan allows; docs are mirrored in this repo's `docs/` |

Never share passwords or keys in chat: everyone uses their own login. The only key in the repo is Supabase's **publishable** key.

## 8. Where things are decided
- Product and design decisions: claude.ai Project docs (`claude/brand-guide.md`, `claude/club-requirements.md`,
  `claude/milestones.md`, `claude/final-report-*.md`).
- Planned next: instant live results with Supabase Realtime (broadcast per tournament; see `claude/reminders.md`), privacy
  policy + delete-my-data, Play Store wrapper, Supabase Pro before charging (backups, no pausing, leaked-password check).
