# RallyQ Final Prototype · Build Spec (Arena System v2)

This spec goes with `rallyq-final-prototype.html` in this folder. The HTML is the target look and behaviour. It is one self-contained file with sample data and no backend. Open it, switch between Night/Day and Desktop/Phone at the top, and click through every screen. This spec writes down what the HTML shows so a model or developer can build it into the real app (`rallyq-live` branch, React + Vite, `src/rallyq/*`). Every name, score and photo in the prototype is sample data.

Agreed by Claude and ChatGPT over two review rounds, and approved by the founder.

---

## 1. Principles

- **Work earns trust through certainty. Show earns attention through emotion. Match DNA connects them through truth.**
- **One hero. One echo. Then silence.** Each moment gets one main motion and at most one follow-up.
- Nothing celebrates before a result is confirmed. Gold is used only for referee-confirmed results.
- Every animation can be turned off (the **Calm** toggle, plus `prefers-reduced-motion`) and no information is lost.
- Two zones:
  - **Show zone** (spectacular): Home, Event, Live, Results, Player Studio, Venue TV, share cards.
  - **Work zone** (calm, instant): Referee pad, Tournament Desk, Organiser overview, Admin. There is no dimming or celebration near controls.

## 2. Colour tokens

| Token | Night | Day | Role |
|---|---|---|---|
| Night page | `#06140D` | n/a | Base under the Night photo |
| Court Green | `#2B6E4B` | page tint | Day page colour (as on the live site) |
| Card | `#0D2218` / `#133022` | same | Solid fallbacks behind glass |
| Chalk (ink) | `#F1F4EA` | `#F1F4EA` | Text and lines |
| Muted | `#9FB4A6` | `#DDEBDF` | Secondary text |
| **Ball Green** | `#D9F24A` | `#E4F75A` | **"Now" only**: serving ball, live dot, current run, primary action |
| **Team A · Sea Glass** | `#76E0D0` | `#8CEADB` | Team A rails, Q strokes, referee pad button |
| **Team B · Tide Blue** | `#7EAEF2` | `#7EAEF2` | Team B rails, Q strokes, referee pad button |
| **Gold** | `#E8C35A` | `#E8C35A` | Confirmed results and champions only. Never on a game end or a provisional score |
| **Coral** | `#FF655C` | `#FF655C` | **"Act now"** (see below) |
| Signal | `#BDCBC6` | `#BDCBC6` | Stale and offline states. Calm, never alarming |
| Danger | `#AD2945` | `#AD2945` | Destructive actions only (delete, void a match) |

### Coral's role
Coral is still a brand colour. It means **"someone should do something"**:
- Commerce urgency: **Tickets on sale**, **4 spots left**.
- Operator alerts: Admin **Needs a look** (coral chip + coral card edge), Desk **Running behind**, Organiser launch-readiness **blockers**.
- Style: filled chip, coral background, dark text `#1A0603`. Or a 1.5 px coral inset edge on the card that needs action.
- **Never** a team colour, **never** on a score, and **never** for game point or match point (those use chalk). It is not for plain stale data either: stale is Signal grey and turns coral only when a person has to act.

## 3. Glass

| | Night | Day |
|---|---|---|
| Background | `court-night.jpg` under a dark green tint | `event-crowd-courtside.jpg` under `linear-gradient(180deg, rgba(43,110,75,.80), rgba(36,95,64,.84) 45%, rgba(24,68,45,.92))` (same as the live site) |
| Glass fill | `#081E13` at 60% | `#081E13` at 52% |
| Blur | 16 px (`backdrop-filter: blur(16px) saturate(1.2)`) | 16 px |
| Edge | `#F1F4EA` at 20%, 1 px | white at 25% |
| Top light | inset 0 1px 0 `#F1F4EA` at 10% | white at 12% |
| Shadow | `0 16px 48px rgba(0,0,0,.28)` | same |
| **Work glass** (referee, desk) | 85% fill, 20 px blur | same |

Rules: at most 3 blur layers on screen at once, never animate blur, and give a solid fallback when `backdrop-filter` is not supported. Venue TV is always Night. The Receipt and Season Book are printed on chalk paper in both modes.

## 4. Type

- **Archivo 800**, tight, for headlines.
- **Archivo condensed (stretch 62%)** for scores and numbers.
- **DM Sans** for body text, 16 px minimum on phones.
- **Fraunces** for the wordmark and the commentator line only.
- Logo: the court is the Q and the ball is the tail. Never glow, rotate or stretch it, and never make it blue.

## 5. Motion table

Shared easing: `cubic-bezier(.23,1,.32,1)` unless noted. Animate only `transform` and `opacity` on phones.

| Moment | Name | Timing | Spec | Where |
|---|---|---|---|---|
| Score change | **Count** | 110 ms ease-out | New number enters from 35% below at 40% opacity. A multi-point jump counts each step 110 ms apart. Undo enters from above. | Every scoreboard |
| Point won | **Wash** | 700 ms ease-out | Ball-green gradient sweeps the scoring row (0 → .55 → 0 opacity). | Featured boards only |
| Serve marker | **Serve Pulse** | 420 ms ease-out | Dot pops at scale .2 → 1.3 → 1. | Boards that know the server |
| Side-out | **Hand-off** | 420 ms `cubic-bezier(.45,0,.25,1)` | Ball travels in an arc to the new serving team, then Pulse. | Featured boards |
| Second server | **Server Flip** | 260 ms | Server number flips 1 → 2. | All boards |
| Run of 3+ | **Run Meter** | 260 ms | Run bar grows one step in ball green. | Featured boards |
| Scores level | **Level** | 520 ms | "Level" tag fades in. | Featured boards |
| Game point | Chalk edge | 280 ms | 2 px chalk inset on the row. | All boards |
| Match point | Chalk edge | 320 ms | Double chalk inset. | All boards |
| Game end | **Chalk hold** | 2.5 s | Chalk ring, then the next game. No gold. | Boards |
| Each rally | **Q Stroke** | 240 ms | One stroke draws around the Living Q. | Living Q |
| Undo | **Undo** | 180 ms | Last stroke and count reverse. | Everywhere |
| Confirmed result | **Gold rail** | 950 ms | Gold rail draws along the winner row after the referee confirms. | Results, TV, Live |
| Champion | **Champion Reveal** | 1200 ms | Gold reveal on the confirmed champion. | Event, Results |
| Live badge | **Breathe** | 1.8 s loop | Dot fades 1 → .3 → 1. | Live chips only |
| Stale | Stale | 180 ms | Chip changes to Signal with ◷. | Chips |
| Offline tap | Offline Receipt | 160 ms | "Offline · N queued" on the pad. | Referee pad |
| Back online | Sync | 420 ms | Every screen catches up at once. | All |
| Navigation | Page / Sheet / Tab | 220 / 300 / 150 ms | | Global |
| Referee tap | Referee Press | 120 ms | Press only. The pad has no other motion. | Referee pad |
| Bracket | Bracket Trace | 340 ms | Follow-a-team path draws. | Event |
| Desk queue | Desk Queue Slide | 340 ms | Queue reorders. | Desk |
| Studio open | **Athlete Emergence** | 680 ms portrait, 420 ms name, 70 ms stat stagger | Once per visit. | Player Studio |
| Keepsakes | Sheet Rise / Receipt Reveal / Season Book Turn | 320 / 560 / 520 ms | | Studio |
| Signature | Signature Draw | up to 900 ms | | Results, Receipt |
| TV idle | TV Idle | 800 ms | Between matches only. | Venue TV |
| Reduced motion | Fade | 150 ms | Every effect becomes a fade. | Global |

**Budget:** Count runs on every score. Wash, Pulse, Hand-off and Run Meter run only on the featured scoreboard (Live arena, TV main, Match day). They never run on court lists or cards. There are no looping glows and no auto count-ups on Home.

## 6. Components

- **Board (scoreboard)**: two team rows. Each row has a team rail (Sea/Tide), name, club, server number, game dots, run meter, tag line (Level / Game point / Match point) and the points column. The living version adds the **Living Q** next to the rows. On phones and narrow cards the Q shrinks to a 46 px badge at the top right. Quiet boards (court lists, cards) show no Q and no Wash.
- **Living Q ("The Q keeps score")**: an SVG of the RallyQ court-line Q. Each rally draws one stroke around the path: **outward in Sea for Team A, inward in Tide for Team B**, and short for side-outs. Strokes are capped at 32 per game. The ball sits with the serving team. A gold rail draws only after the referee confirms. In the centre: the rally count.
- **Match DNA strip**: one mark per rally, up for one team and down for the other, in team colours. Side-outs are short marks and the current run of 3+ is ball green. Hover to see the rally record.
- **Match Signature**: the full match drawn around the Q at a confirmed result. Used on Results, the 9:16 Match Memory and the Receipt.
- **Referee pad**: two big buttons. **Team A is Sea, Team B is Tide**, both with dark ink. The serving side gets a chalk ring and a ball dot. It shows the referee call (e.g. `7-5-2`), Undo, the honest sync state (Saved / Syncing / Offline · N queued) and a Confirm final score sheet. It uses work glass and has no motion except Press.
- **Point Receipt** (pad): "Point Asha & Lata · 8-5-1 · Undo", shown for 4 s.
- **Athlete Cover** (Player Studio): the full-bleed player photo **is** the panel, for both **My studio** (private) and **Public card**. On it: a Private/Public switch, the last-final Living Q badge, the name in huge type, DUPR and three stats (Referee-scored, Close games won, Best run). Athlete Emergence plays once per visit.
- **Public card pane**: referee-scored tournament results only, plus share cards. Practice, goals and coach notes are never public.
- **Two-Serve Turn card**: a 9:16 share card ("Two serves. Both gone. Then the run."). Only offered when, in a confirmed match, the receiving side wins against Server 1 and Server 2 in a row, followed by a scoring run.
- **The Receipt / Season Book / Club Record Book**: as in the prototype's Build notes (section 5).
- **Chips**: `live` (ball green, breathing), `stale` (Signal with ◷), `coral` (act now), `danger`, `line` (outline, e.g. "Sample data", "Referee scored"), `gold` (confirmed only).
- **Sheets**: bottom sheets on phones and centred on desktop. They never cover the sticky score or the bottom tabs.

## 7. States every screen must ship

| State | Rule |
|---|---|
| Loading | Skeleton in the final layout. Never a spinner over a score. |
| Empty | Say what will appear and the next real action. |
| Live | Ball-green breathing chip with "updated N s ago". |
| Stale (>30 s) | Signal chip with ◷, "Last updated 90 s ago". Never says Live. |
| Needs action | Coral chip and coral edge (admin, desk, readiness). |
| Offline (pad) | "Offline · N queued". Public screens say "Waiting for the court" until the server acknowledges. |
| Provisional | "Final · awaiting referee". No gold, no share, no record. |
| Confirmed | Gold rail and winner. Rewind, Signature, Memory and Receipt unlock. |
| Error | A plain sentence plus one retry. A queued tap is never lost. |
| Reduced motion | Every effect becomes a 150 ms fade. |

Phones: test at 320 and 390 px. Each screen has one hero and one primary action. Use 44 px touch targets and safe-area padding.

## 8. Screen list

| # | Screen (hash) | Zone | Build into | What it must show |
|---|---|---|---|---|
| 1 | Match day `#matchday` | Demo | (demo only) | One referee tap updates the pad, public Live and the venue TV together. Undo, offline and confirm all work. |
| 2 | Home `#home` | Show | `rallyq/home/RallyHome.tsx` | Floodlit hero photo, live glass score card, ticker, events, live courts, player card, Studio and clubs |
| 3 | Event `#event` | Show | `rallyq/event/RallyEvent.tsx` | Crowd hero. Before / During / After states, coral "spots left", follow-a-team bracket, gold only for the confirmed champion |
| 4 | Live `#live` | Show | `rallyq/live/RallyLive.tsx` | Arena board with Living Q, DNA, win chance (labelled as an estimate), other courts, up next, sticky mini score, Preview stale |
| 5 | Results `#results` | Show | `ResultsDupr` | Gold reveal, Match Signature, Rally Rewind, Match Memory share |
| 6 | Venue TV `#tv` | Show (always Night) | `rallyq/tv/RallyTV.tsx`, `tv/motion.ts` | Featured court with Living Q, court rail, broadcast breaks between matches only |
| 7 | Referee pad `#referee` | Work | `ScorePad.tsx` | Two-colour pad, Point Receipt, sync states, confirm sheet |
| 8 | Tournament Desk `#desk` | Work | `rallyq/desk/RallyDesk.tsx` | Courts drawn as courts, coral "Running behind", Decision Preview, queue reorder |
| 9 | Organiser `#overview` | Work | `rallyq/organiser/RallyOverview.tsx` | Event poster, launch readiness, coral blockers |
| 10 | Admin `#admin` | Work | `rallyq/admin/RallyAdmin.tsx` | Network pulse map, action cards, coral "Needs a look" |
| 11 | Player Studio `#studio` | Show | `rallyq/studio/*`, MyStudio | Athlete Cover (private and public), tabs Home / Events / Practice / Club, Receipt, Season Book, Two-Serve card |
| 12 | Build notes `#notes` | n/a | n/a | This spec in short form, inside the prototype |

## 9. Live image map

All photos are the ones the live rallyq.in site uses, from `public/rallyq/` on `rallyq-live`. The prototype embeds compressed copies, so the build should use the originals.

| Prototype class | Repo path (`public/rallyq/…`) | Used on |
|---|---|---|
| `ph-hero` | `photos/desktop/hero-night-rally.jpg` | Home hero |
| `ph-courtlive` | `photos/desktop/live-court-floodlights.jpg` | Live arena, event cards, Home live card |
| `ph-crowd` | `photos/desktop/event-crowd-courtside.jpg` | Event hero and the **Day background** |
| `ph-arena` | `arena-night.jpg` | Venue TV |
| `ph-champ` | `photos/desktop/social-champions.jpg` | Results champion |
| `ph-result` | `photos/desktop/social-result.jpg` | Match Memory card |
| `ph-club` | `photos/desktop/club-night.jpg` | Club cards |
| `ph-stills` | `photos/desktop/entries-still-life.jpg` | Organiser poster |
| `ph-player` | `photos/desktop/player-competitor.jpg` | Home player card, TV walkout |
| `ph-aerial` | `photos/desktop/day-court-aerial.jpg` | Event card |
| `ph-meera` | `meera.jpg` | Player Studio Athlete Cover, Two-Serve card |
| Night background | `court-night.jpg` | **Night background** |

## 10. Data rules

- **One rally record is the single source of truth.** Every animation, DNA mark, Q stroke, story line, Receipt claim and record is derived from it. Never keep separate display counters.
  `{ match_id, game, n, winner_team, outcome: point | side_out | second_server, server_team, server_no, score_before "7-5-1", score_after "8-5-1", revision, synced_at }`
- Undo writes a new revision, and every screen re-derives from the latest one.
- **Gold only when confirmed** by the referee. A game end is a chalk hold.
- **Two sources only**: Referee scored and Self-logged. Practice never touches DUPR or records. DUPR is the only rating.
- Win chance is always labelled an estimate.
- No serve stats until the pad stores the server, and no kitchen stats.
- Sample data is always marked. Entries are requests until the club confirms place and payment.
- Club co-branding: the club logo in a chalk tile, "Hosted by [Club]", and RallyQ always visible. The player and the score are always biggest.
