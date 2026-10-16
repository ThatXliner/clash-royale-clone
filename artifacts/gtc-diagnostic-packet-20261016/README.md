# GTC diagnostic evidence packet

This packet freezes existing runtime and source evidence for the Briar stagger compatibility investigation. It contains only selected captured outputs, exact test/probe/recorder source files, selected source objects, and raw historical snapshot inputs. It excludes full private clones/worktrees, `.git`, dependencies, caches, build output, and unrelated repository artifacts. No Node/npm/test/build/browser process ran while assembling this packet; the collector only copied and hashed existing files.

## Source identity

Runtime probes and focused gates used execution commit `5cc4d3e424661cf638c5dbea288836ef4419fcf0` (repository tree `d0fac5a0abb5690c12d83ca9118b9d72d81974e2`; `src/` subtree `01d869b32c563dac270acd4fddc7fa4d0ec207de`). The coordination head was `090d685a4fa07aa07c17618b1e18d00ecb63ff51`. The captured identity summary verifies equality of `src`, `scripts`, `package.json`, `package-lock.json`, `demo/assets`, `public/assets`, `reference`, and the four targeted game-troop-runtime / game-roster-troops-status test and runner blobs. The only `tests/` tree path differing between those commits was `tests/game-roster-troops-movement.test.js`; this packet makes no whole-tests-tree identity claim. Historical source pins are c9 `c9c818f7ac281b0e71890a2be17ce757f688b4c5`, first GTC assertion pin a8 `a8f432985a758144af6c29ff7e29174b05f8e6ee`, and status assertion pin 2a `2a5bd7a44ad3773de59e8e6dd8baaebf0ec09764`.

## Focused pin gates and probes

All six serial gates/probes ran under Node v22.22.3 and npm 10.9.8 from `/Users/me/.hermes/node/bin`, with full argv/cwd/allowlisted environment, direct PID/exit, and before/after clean source fences in each raw gate metadata file. Gate outputs and exact per-gate source copies are under `attempt2/pin-gates/`.

- Historical a8 GTC npm gate: direct PID 28334, exit 1; TAP reports 1/7 passing and 6/7 failing. The saved failures include an assertion rejection mismatch and `game session setup has an invalid shape` while constructing GameSession. This historical API/test gate did not independently reproduce a passing old golden, so its expectations are a limitation, not a separate compatibility proof.
- Historical c9 empty LiveBattle probe: direct PID 28371, exit 0; version 2, 11,618 bytes, SHA-256 `874c2b8e8642447e627e850e8511b58009e57c22e3d9d2cc42ab447b4af8429a`; 8 roster entries and 13 questions.
- Current 5cc GTC npm gate: direct PID 28385, exit 1; 6/7 passing; the exact test `game troop runtime: current v5 hostile witnesses, chunks, forks, and empty v2 bytes remain causal` fails at the pinned byte length, expected 11,618 and actual 17,731.
- Current 5cc empty LiveBattle probe: direct PID 28425, exit 0; version 2, 17,731 bytes, SHA-256 `cb92fe16188370ae2bdfa260f574d220dcc02e1cdf4aa847c861e0fca5d20d54`; 8 roster entries and 33 questions.
- Historical 2a status npm gate: direct PID 28439, exit 0; 12/12 passing.
- Current 5cc status npm gate: direct PID 28479, exit 1; 32/33 passing, with only `game roster troop status: deterministic session continuation hashes stay stable` failing its six pinned snapshots.

The empty-fixture comparator recorded 20 added Briar source-confidence policy fields across two roster entities and 20 Briar QUESTION records. Current serialization was 6,113 bytes larger. Removing only those exact named policy objects and question records from the current setup made the normalized setup and canonical snapshot match the historical setup/raw bytes exactly (11,618 bytes, the c9 hash); the comparator reported no residual snapshot diff. This is a diagnostic equality comparison, not an edit to tests or serializer output.

## Six status scenarios and their behavioral state delta

`attempt2/status-capture-runs/` preserves all six full captured historical 2a views and all six current 5cc views, plus the exact capture-only instrumentation patch, source hashes, raw outputs, and source fences. The original six hash assertions remained in both instrumented test copies. The comparator report confirms for all six cases that session replay bytes, replay objects, and replay properties match; each full GameSession state differs. Briar stagger changes state: at tick 11 one later Briar member has `spawnedAt: 6` rather than `0`, Briar members with IDs 4–7 have not been materialized in the current state, and targets/positions/movement/attack timing also differ. The replay comparison is not evidence that complete battle state or a separate full battle event feed is equal.

## Fresh constructor and archive restore controls

The attempt3 public-constructor control (PID 29026, exit 0) used the exact historical bloom-wisp captured view (SHA `fba122f18655b7391e5a1d976767bdbbe2e9c09ecc23c5f6d6a1b96b7021e6e7`, tick 11, seven units). Current `GameSession` construction rejected it with `roster[7].entities[0] source confidence policy is missing or unexpected`. This is fresh input admission only.

The attempt4 public restore control (PID 29561, exit 0) supplied exact captured historical v2 bytes to current public restore APIs: the c9 LiveBattle snapshot is 11,618 bytes with SHA `874c2b8e8642447e627e850e8511b58009e57c22e3d9d2cc42ab447b4af8429a`; six 2a GameSession snapshot bytes are preserved under `attempt4-public-restore-control/run/exact-captured-snapshots/` with input hashes in the captured manifest. `LiveBattle.restore` rejected the c9 snapshot for missing Briar source-confidence policy at `roster[6]`; all six `GameSession.restore` calls rejected at `roster[7]` for the same missing policy. None accepted, so reserialization equality and restored-state comparison were unavailable. This documents rejection of these exact old snapshots at 5cc; legacy archive migration compatibility is not proven.

## Failed sparse preflight

`attempt1-sparse-preflight/` preserves the original sparse worktree setup log, actual NUL-delimited dirty status, sparse config/list, empty index skip-flags capture, exact original pre-execution recorder source, and source-identity preflight. The log contains only `Preparing worktree (detached HEAD c9c818f7)`; the captured status shows the checkout was not clean. The later actual runs used private full shared clones at exact detached pins. No sparse flags/config/status were relaxed or rewritten in this packet.

## Provenance and integrity

`provenance/` keeps the original source manifest, blame/history notes, prelaunch/input manifests, and detailed causal summary. The preserved preparation README files are pre-execution planning records; any then-current statement that no run had happened describes only that earlier moment. The actual later outcomes are the gate metadata and raw streams indexed above.

Three historical source entries are explicitly absent in the original recorder metadata: `src/shared/session-troop-source-confidence-authority.js` at a8, c9, and 2a. These are recorded absences at those old pins; this packet does not synthesize source files for them.

`MANIFEST.json` records every packet file's source path, byte count, and SHA-256. `SHA256SUMS` hashes every other packet file. All packet files and directories are read-only after generation; the input evidence elsewhere was not modified.
