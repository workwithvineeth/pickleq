# RallyQ v2 reskin · progress log

Any session (Claude or Codex) can resume from this file. Update it and push after every step.

## Goal
Put the Arena System v2 look (final prototype + build spec, in the project files under
`rallyq/final-prototype/`) on rallyq.in by Friday night 20 Nov IST. **Reskin only**: visuals and motion.
Never change the database, scoring logic or user flows.

## Branches and deploys
- Work branch: `claude/project-thread-hdj0m3` in workwithvineeth/pickleq, started from `rallyq-live` @ 12f1cd0.
- Codex works on `codex/reskin-wiring` (branched from the work branch) and pushes small commits often.
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
- Codex · Fri 20 Nov · Task 1: added pure rally records, serving calls, current runs and level signals with tests, reusing existing replay/history helpers; pull, commit and push blocked by read-only .git metadata.
