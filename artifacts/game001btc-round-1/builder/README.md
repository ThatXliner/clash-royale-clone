# GAME-001BTC builder packet

Private candidate based on accepted parent `511df9308e9d8aec0bd7cf12fdade5505da6fd79`. The production tree, package manifests, and shipped asset directories are unchanged; the only code edit is `tests/game-battle.test.js`.

The starter deployment test now follows the roster's documented Briar Band `deploymentInterval` of 100 ms / 6 simulation ticks. The initial `step(0)` materializes the first Briar member per side, so the initial full count is 20. The test checks each stagger boundary through tick 30, per-card and per-side totals, component order, deployment and spawn events, reserved stable IDs, no pending members at completion, and all 30 final IDs.

The omitted-receipt mutation removes `briar-darter.target-mode`; the asserted failure now names that exact missing source-confidence QUESTION. The generic QUESTION source is a bounded nonempty string and may differ across records; the test no longer applies a global provenance rule. Field-specific source-confidence receipts remain pinned to their documented source. A valid surrogate pair is accepted as one Unicode scalar in a generic source, while the same scalar in a field-specific receipt reaches and fails the semantic provenance check. Lone-surrogate, width, depth, and numeric hostile-input checks remain in place.

## Qualification evidence

- Accepted baseline `test:game-battle`: 8/11 pass, with the three recorded stale expectations.
- Candidate attempt 1: 10/11 pass; its partial-ID-contiguity assertion was corrected because reserved deployment IDs create gaps until all staggered members spawn. Original attempt output is retained under `candidate/`.
- Candidate attempt 2: `test:game-battle` 11/11 pass.
- Causal formation check `test:game-roster-troops-ordinary`: 25/25 pass.
- Causal admission / QUESTION check `test:game-roster-admission`: 7/7 pass.

All test runs used Node v22.22.3 and npm 10.9.8 with a clean `env -i` environment. Each run directory retains the exact argv, cwd, environment description, direct PID, process snapshot, stdout, stderr, and exit code. The run scripts and raw outputs are included for the completed checks.

The first minimal probe exited before its model code ran: Node reported `ERR_MODULE_NOT_FOUND` for `/private/tmp/src/sim/live-battle.js`. Its raw stdout/stderr, argv, cwd, environment, PID, and exit code are retained under `probes/`; the original attempt-1 script was overwritten during the import-path correction and is unavailable. No source for that attempt is reconstructed or claimed as exact, and it is not qualification evidence. The successful attempt-2 probe source and wrapper are preserved beside its raw output.

This packet records builder evidence only. It makes no critic-pass or adoption claim.

The first candidate's pre-correction test source was not archived before the partial-ID assertion was edited. Its captured output and run metadata are retained, but the exact source version is unavailable and is not reconstructed or claimed as exact.
