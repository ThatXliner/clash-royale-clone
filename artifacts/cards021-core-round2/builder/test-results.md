# CARDS-021K round 2 test record

The private R1 parent is `9d8b542c7927b3d95f78d88ff723d088bc0a4bd0`.

| Command | Result |
|---|---|
| `node --test tests/rl-environment.test.js` before the focused fixture correction | 14/15; one new conceal/reveal test failed because its slice-based deck did not reconceal on the next stride. Full TAP retained at `rl-environment.initial.tap`. |
| `node --test --test-name-pattern='RL exposes Buried Coil conceal, reveal, reconceal, and restored QUESTION state' tests/rl-environment.test.js` after correction | 1/1 pass; 1.6 s. TAP at `rl-hidden-focused.tap`. |
| `node --test tests/rl-environment.test.js` after correction | 15/15 pass; 125.5 s. TAP at `rl-environment.final.tap`. |
| `node --test tests/cards021-integration.test.js` | 3/3 pass; TAP at `cards021-integration.final.tap`. |
| `npm run test:editable-deck` | 12/12 pass; TAP at `editable-deck.final.tap`. |
| `npm run test:game-building-policy` | 3/3 pass; TAP at `game-building-policy.final.tap`. |
| `npm run test:content-schema` | 20/20 pass; TAP at `content-schema.final.tap`. |
| `npm run test:nondeterminism-guard` | 10/10 pass; TAP at `nondeterminism-guard.final.tap`. |
| `npm run test:shipping-isolation-guard` | 13/13 pass; TAP at `shipping-isolation-guard.final.tap`. |
| `git diff --check` | pass. |

The failed test was corrected to use the exact legal eight-card seed/deck already
observed through the shared RL/GameSession path. It now observes concealment,
reveal, reconcealment, exact restore continuation, and rejects missing or
forged building profile QUESTION receipts by calling the real
`RLEnvironment.restore` boundary. The lifetime test passed in the first full
RL run, including an authenticated checkpoint at tick 1,800 and expiry at the
next processed boundary.

All selected RL and adjacent checks pass on the frozen source hashes. The
default-eight setup/session hashes match the retained R1 values for seeds 0
and 23, and the kernel remains unchanged below its existing size cap. This
does not include browser, app-shell count, full endurance, or release
qualification; those remain outside this R2 builder check.
