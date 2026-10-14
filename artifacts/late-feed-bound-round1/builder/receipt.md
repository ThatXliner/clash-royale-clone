# GAME-001GFB builder receipt

Base: accepted `7550ca38fa3e415d337927a0c9ad34ff63637741`, isolated private checkout. Production source started at deployed `ff1025e145cbff421d624ed7d3e59b5ab5671f14`.

## Cause and change

The original recorded browser run overflowed while admitting projectile close event 3,899 at simulation tick 17,789. Immediately before it, 3,898 records occupied 1,048,484 canonical v1 bytes; the candidate added 165 bytes, producing 1,048,649 bytes, 73 above the unchanged 1,048,576-byte limit. The browser's last completed segment was tick 17,700; the reconstructed `GameSession` had committed through tick 17,715 when its next batch rolled back. These are distinct ticks.

`src/sim/combat-effect-feed.js` now keeps valid fitting v1 bytes unchanged and switches to a deterministic internal v2 wire projection only when the full v1 serialization would exceed the same 1 MiB bound. It retains each record's full payload and causal parent, derives the contiguous event ID from array position, derives the injective root ID from the open payload, and inherits child type from its authenticated parent. Public logical snapshots and `COMBAT_EFFECT_FEED_VERSION` remain v1. The 16,384-record cap and 1,048,576 UTF-8-byte cap are unchanged.

The compact parser rebuilds the expanded v1 graph through the existing lifecycle validator and rejects malformed, noncanonical, or forged wire data before returning a snapshot. Forks and serialization preserve compact mode. Failed appends remain atomic.

## Measured evidence

The exact recorded accepted-command replay reached a natural terminal at tick 18,000 with all 40 accepted commands. At terminal it contained 3,931 logical records across 843 roots. The full expanded logical snapshot was 1,056,690 UTF-8 bytes (records alone 1,056,666 bytes; SHA-256 `4bf3fb3cca1728d958c36d4a8cde15d27205d1df30933f58b44671e60651df77`). The canonical v2 feed was 520,699 UTF-8 bytes, preserving all records and fitting below the unchanged bound. Compact restore, restored serialization, normalized validation serialization, and plain expanded-snapshot serialization all matched the same canonical v2 bytes.

The run paused and resumed at the tick-300 cut, restored that cut, replayed to tick 600, and matched the original tick-600 session bytes exactly. The direct session cut is 44,513 bytes with SHA-256 `57813c849a0208478279ce036497d764537c93d796c16c9c8c98ac8b2d580ae0`. The browser's controller envelope at its own tick-300 cut was 54,012 bytes; that value includes the controller envelope, not only `GameSession.serialize()`.

The synthetic compact transition fixture retained 3,670 records while shrinking 1,049,033 expanded bytes to 581,138 wire bytes (467,895 bytes, 44.60%). The previously authorized crowded-load fixture evidence is also retained: its old 3,000-root count now fits at 808,437 bytes; the adjusted 5,000-root fixture accepts 3,889 launches and then rejects at the unchanged byte bound with 1,048,467 bytes committed. See `compact-wire-cost.log` and `crowded-fixture.log`.

## Verification

- `node --test tests/combat-effect-feed-bound.test.js tests/combat-effect-protocol.test.js`: 15/15 passed.
- `npm run test:area-damage`: 11/11 passed.
- `npm run test:nondeterminism-guard`: 10/10 passed.
- `npm run test:game-session`: 9/9 passed, including full regulation/overtime/tiebreak and terminal restore coverage.
- `npm run test:game-ui-projection`: 27/27 passed, including tick-18,000 terminal projection and Kilnkeeper projectile restore.
- Default-eight browser smoke at 900 ticks: 3/3 passed, including tick-300 restore and 600→300→600 replay, audio parity, and terminal observation.
- Kilnkeeper browser smoke at 900 ticks: 3/3 passed with the same restore/replay checks.
- `git diff --check`: passed.

The full browser 18,000-tick qualification was not run by the builder; it remains for the independent critic. `npm test` without a configured Playwright entry could not initialize in this private checkout. Retrying with the accepted checkout's Playwright entry expanded the full repository suite, which would eventually invoke the reserved full browser qualification, so it was stopped after the early foundation suites passed. The targeted suites above and the recorded 18,000-tick headless replay completed.

## Artifacts

- `causal-byte-probe.txt`, `probe-default-feed.log`, `probe-recorded-default.mjs`: original overflow and recorded replay setup.
- `headless-recorded-default.log`, `headless-recorded-default-first-pass.log`: terminal compact-feed receipt and first pass.
- `recorded-default-command-rows.json`: all 40 deduplicated accepted commands from the exact browser telemetry.
- `restore-cut-300.log`: direct tick-300 pause/resume session-cut bytes and hash.
- `compact-wire-cost.log`, `measure-compact-wire.mjs`: synthetic encoding byte costs.
- `crowded-fixture.log`, `measure-crowded-fixture.mjs`: old and adjusted crowded-load fixture measurements.
- `focused-tests.log`, `area-damage-tests.log`, `nondeterminism-guard-tests.log`, `game-session-tests.log`, `game-ui-projection-tests.log`: passing focused and adjacent suite outputs.
- `browser/default-900/` and `browser/kilnkeeper-900/`: raw browser telemetry, screenshots, summaries, and runner logs.

Production changes are limited to `src/sim/combat-effect-feed.js`, the new `tests/combat-effect-feed-bound.test.js`, and the authorized future-count adjustment in `tests/combat-effect-protocol.test.js`.
