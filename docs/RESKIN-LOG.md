# RallyQ v2 reskin · progress log

Any session (Claude or Codex) can resume from this file. Update it and push after every step.

## Goal
Put the Arena System v2 look (final prototype + build spec, in the project files under
`rallyq/final-prototype/`) on rallyq.in by Friday night 20 Nov IST. **Reskin only**: visuals and motion.
Never change the database, scoring logic or user flows.

## Branches and deploys
- Work branch: `claude/project-thread-hdj0m3` in workwithvineeth/pickleq, started from `rallyq-live` @ 12f1cd0.
- Codex works in C:\Users\vinee\Downloads\rallyq-codex on `codex/reskin-wiring`. Its sandbox cannot write .git,
  so Claude reviews each task's diff and commits + pushes it from the laptop. Task prompts: Downloads\rallyq-codex-taskN.txt, logs: rallyq-codex-taskN.log.
- Staging: workwithvineeth/rallyq-staging, file `staging-ref` = branch to show. Push main to deploy.
  https://workwithvineeth.github.io/rallyq-staging/ (paddleq-staging DB, made-up data only).
- Live: workwithvineeth/pqclub, file `club-ref` = exact pickleq commit. Today's live build: **12f1cd0**.
  Rollback = set `club-ref` back to `12f1cd0` and push pqclub main (~5 min).
- Go live only when Vineeth says "ship it". Freeze: Sat 21 Nov 2:30 pm IST (event at 3 pm).

## Rules
- Do not delete "PaddleQ Test Club (keep)" (the robot's test club).
- Repos stay public until after Saturday.
- Ship order: (1) public pages + Results, (2) scoreboard (Live/TV), (3) ref pad last.
  If the ref pad is not solid on staging by Friday evening, it stays as it is now.
- `npm test` and `npm run typecheck` must pass before each push to staging.

## Split
- Claude: visual layer (tokens, glass, photos, chips, boards, ref pad colours, Player Studio cover).
- Codex: wiring (new components to existing data, Living Q strokes from rally records,
  serve / side-out events for Hand-off and Serve Pulse). See "Codex tasks" below.

## Log (newest last, times IST)
- Fri 04:00 · Branch created from rallyq-live 12f1cd0. Log started.
- Fri 04:10 · Batch 1 (arena-v2.css: tokens, glass, photos, chips, team rails) pushed; staging deployed (51857e8).
- Fri 04:25 · Live board template (rails, server slot, tags, Living Q + DNA slots) and ref pad stylesheet (arena-v2-pad.css) pushed.
- Fri 04:35 · Robot (android, local build): 75 passed, 1 failed (shell matrix CSP check; fails the same on 12f1cd0 locally, so not ours).
- Fri 04:40 · Codex task 1 (src/rallyq/arena/rallies.ts) written, under review.
- Codex · Fri 20 Nov · Task 1: added pure rally records, serving calls, current runs and level signals with tests, reusing existing replay/history helpers; pull, commit and push blocked by read-only .git metadata.
- Codex · Fri 20 Nov · Task 2: added pure LivingQ and Dna components using the prototype geometry and rally records, with rendering tests for strokes, titles, current runs and undo; left in the working tree for Claude review.
- Codex · Fri 20 Nov · Task 3 (Live only): wired current-game rallies, Living Q, DNA, serving calls and live run/Level tags into Live values; completed sample histories (Granite 3–1 keeps its BAA ending, longest run 2), added unit coverage, and left changes for Claude review without pull, commit or push.
- Fri 05:00 · Codex tasks 2 (LivingQ/Dna) and 3 (Live wiring) reviewed and merged; Live board shows Q + DNA (sample and real).
- Fri 05:05 · Robot (android, local build 69e2bac): 75 passed, 1 failed (same pre-existing CSP shell-matrix check). TV slots added; Codex task 4 = TV values.
- 05:20 IST Fri 20 Nov: Pad 5 (arena-v2-pad5.css, switch in src/rallyq/shell/pad.ts), serving-row fill on Live/TV, chalk DNA with `.turn`, Codex task 4 (TV values) merged. Local robot 75/1/30 (same known CSP fail). LIVE: pqclub club-ref = 6b48d65 (pqclub b61e8dd), deploy green. Rollback: club-ref 12f1cd0. Out: Results winner points gold. Live robot was already red before (sandbox reset FK error on club_players).
