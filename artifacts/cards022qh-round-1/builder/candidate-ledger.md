# CARDS-022QH builder candidate

This packet covers the test-only Brackenwheel endurance scenario prepared from clean baseline `4e1acc7c7771453da4306fc2b605a7471d072304` in `/private/tmp/cards022qh-builder-20261015`, branch `codex/cards022qh-harness-builder-20261015`.

## Scope

Changed only the owned harness files:

- `tests/helpers/endurance-workload.js`
- `tests/endurance-workload.test.js`
- `tests/game-browser-endurance.test.js`

Added this packet under the task's unique builder artifact directory. No production, package, UI, simulation, PLAN, or reference files changed.

## Brackenwheel scenario contract

The setup comes from the existing `createEditableGameSessionSetup` API with the exact deck `brackenwheel, briar-band, coilblade, mossguard, ironroot, copperskiff, brassbolt, reedsting` and seed 2. The canonical setup is 57,809 bytes with SHA-256 `2207fce9a5a9c64ebca77acd12bae175bfcc0e05ddb94886b7354ccc50f1a15b`; the browser scenario checks that digest before mounting. It preserves all eight north legal-deployment cards and the 60-tick AI cadence.

The Node contract and `natural-seed2-session-trace.json` record the accepted GameSession path: the player hand contains Brackenwheel at slot 1; the player deploys it at world `(3500,14500)` for 4 elixir, leaving 6 and advancing the south cycle once. The unforced seed-two AI naturally deploys its own Brackenwheel at tick 0, then chooses Brassbolt at tick 60 and Briar Band at tick 180. The player's Brackenwheel records primary damage to north entity 2 and three once-each secondary damage records to entities `[4,5,6]` at event tick 234, visible at public observation tick 235.

The browser candidate uses the existing physical card-slot and arena-pointer helper for the initial Brackenwheel deployment. At the 600 tick branch it records the exact primary/secondary events and both Brackenwheel unit states; after the existing 600→300→600 browser/input/audio replay, it compares those records and states exactly. This browser path has not been executed yet.

The full unbounded custom scenario requires a natural terminal no later than tick 18,000 and exact restart from the selected custom setup (Brackenwheel remains seed 2). The restart expectation follows the existing `src/ui/game-browser-entry.js` path: for non-default decks, `restart()` reads `currentSetup` from the live serialized session and mounts `new GameSession(canonical(currentSetup))` (lines 895–910 at the frozen source revision). A bounded 900-tick run labels itself smoke-only. Default-eight full-18,000 qualification and Kilnkeeper's seed-zero selected-deck restart remain on their existing paths. The existing 50ms long-task, 300ms initialization, 40ms slice, 30,000ms segment, and 1,200,000ms run caps are unchanged.

## Checks

- Node 22.22.3 and Hermes are first on PATH. `endurance-node-contracts-final.stdout` records 8/8 passing endurance workload tests, including the frozen default snapshots and Kilnkeeper seed-zero setup. Command: `node --test tests/endurance-workload.test.js`.
- `scenario-900-node-only-candidate.stdout` records the two browser-independent audio identity and delayed long-task tests passing under `GAME_BROWSER_ENDURANCE_SCENARIO=brackenwheel GAME_BROWSER_ENDURANCE_TICKS=900`; the test-name filter excludes the actual browser endurance case. No browser, build, or full endurance run was started.
- The three owned JavaScript files pass individual `node --check` checks (`syntax-helper-candidate`, `syntax-node-contract-candidate`, `syntax-browser-candidate`). `diff-check-candidate.exit` records exit 0.
- `endurance-node-contracts.stdout`, `.stderr`, and `.exit` retain the first failed attempt (exit 1). Its only failure was a mistaken test assertion that a session's full runtime serialization equals setup JSON; the assertion was corrected to compare the accepted canonical setup subrecord, and the final suite passes.

## Files

- `natural-seed2-session-trace.json`: raw deterministic GameSession setup, deployment, spend, cycle, contact, and post-contact unit-state evidence.
- `endurance-node-contracts-final.stdout`, `.stderr`, `.exit`: final Node endurance contracts.
- `browser-node-contracts-brackenwheel-900.stdout`, `.stderr`, `.exit`: Node-only checks under the bounded scenario environment.
- `syntax-*.stdout`, `.stderr`, `.exit`: syntax-check results; the `*-candidate` checks run after the last source edits.
- `endurance-node-contracts.stdout`, `.stderr`, `.exit`: retained first failed attempt.
- `SHA256SUMS`: source and selected evidence file hashes; the manifest does not hash itself.

This is a builder candidate only. It makes no claim that the browser scenario, terminal qualification, or fresh critic has passed.
