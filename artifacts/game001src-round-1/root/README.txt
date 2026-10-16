Focused baseline preparation and run evidence

Static suspect to reproduce:
  tests/game-shared-runtime-integration.test.js, integratedBattleSetup()
  The setup retains Briar Band but derives QUESTION records only from body-radius
  and projectile-speed policy keys. It omits source-confidence field question
  keys required by the session validator.

Accepted source:
  checkout: /Users/me/.codex/worktrees/remaining-stagger-accepted54cc
  commit:   54cc2a017a939ce40b40c1d25544839983fadf8c
  tree:     36cdca9f88de2eec5c019c1f3d7322ecef661a99

Focused command executed once through the recorder:
  npm run test:game-shared-runtime-integration

Persisted result:
  /Users/me/.codex/worktrees/remaining-stagger-accepted54cc-recorder/baseline-20261016T003446.195257Z
  Direct npm PID: 9099
  Direct npm exit code: 1
  Node: v22.22.3; npm: 10.9.8
  Failure: roster[6].entities[0] source confidence field lacks a QUESTION record
  Location: src/shared/session-troop-source-confidence-authority.js:264
  The pre-run and post-run Git source fences both had the accepted HEAD/tree,
  empty status (including ignored entries), and empty staged/unstaged diffs.

The original prepared recorder is preserved verbatim as
record_focused_baseline.preexecution.py; it was never executed. The amended
recorder ran once under the runtime grant and wrote complete stdout/stderr,
metadata, and exact package/test/runner source copies with SHA-256. All evidence
is outside the accepted source checkout. No project source was edited.
