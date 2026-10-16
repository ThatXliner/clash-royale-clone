# GAME-001OTC builder packet

Private candidate based on accepted parent `0cb3a13be4e498f48cc17909f0219aee50a1f12b`. The only code change is `tests/game-opponent.test.js`; no simulation, roster, statistic, package, or asset files were changed.

The accepted-source probe used a single Briar Band candidate with `thinkIntervalTicks: 1` and a seeded opening hand. At either legal north deployment point, the tick-0 AI transaction committed `north:0` with proposal, spend, and deck-cycle sequence 0; it reserved the six IDs in the admitted deployment receipt, drew `skymaul`, and changed north elixir from 10 to 7 once. The roster's Briar count remains a provisional QUESTION-backed runtime configuration; the test derives its expected count from the admitted roster and does not present that count as a historical stat claim.

The sourced member interval is 100 ms / 6 simulation ticks. Probe spawn events used the reserved IDs in component order at ticks 0, 6, 12, 18, 24, and 30: three Briar Runners followed by three Briar Darters. No further AI proposal, commit, deck cycle, or elixir spend occurred while the members spawned. The test now checks those boundaries and stable IDs on both north lanes, checks each of the eight cards at each legal north point, and compares direct execution with chunks and restore cuts before and after pending Briar spawns.

## Qualification

- `npm run test:game-opponent`: **13 passed, 0 failed, 1 skipped** (14 total; 14.29 seconds). The skip remains the existing GAME-001HC shared-history-cap skip.
- The other 11 existing passing cases remain present and passed, including transaction, combat, admission, restore, hostile-bound, and semantic negative-control coverage.
- The accepted-parent reproduction was already captured by the root task as 11 pass / 1 fail / 1 skip; this builder did not rerun that large control.
- Node v22.22.3 and npm 10.9.8 were used with a clean `env -i` environment; the runner's argv, cwd, environment, direct PID, process snapshot, stdout, stderr, and exit code are retained under `candidate/`.

The first persisted probe attempt failed before model code ran because its relative import resolved under `artifacts/src`; its executed source and raw failure metadata are preserved under `probe/`. Probe attempt 2 succeeded and its exact source, wrapper, and raw output are retained under `probe-attempt-2/`. That probe's `initialState` field was captured after its boundary loop, so it must not be interpreted as the tick-0 state. Its raw tick-0 event list contains the single spawn; the passing test directly asserts one active member after `step(0)`.

This packet records builder evidence only. No critic-pass or adoption claim is made.
