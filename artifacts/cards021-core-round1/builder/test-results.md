# Retained CARDS-021K test results

All commands ran in the private checkout from base `76e202f`. The final
integration test run followed the last integration-fixture edit.

| Command | Result |
|---|---:|
| `node --test tests/cards021-integration.test.js` | 3/3 pass, 11.2 s |
| `node --test tests/editable-deck.test.js` | 12/12 pass, 29.1 s |
| `node --test tests/rl-environment.test.js` | 13/13 pass, 136.4 s |
| `npm run test:content-schema` | 20/20 pass |
| `npm run test:nondeterminism-guard` | 10/10 pass |
| `npm run test:shipping-isolation-guard` | 13/13 pass |
| `npm run test:game-building-runtime` | 15/15 pass |
| `npm run test:game-building-policy` | 3/3 pass |
| `node --test tests/game-roster-buildings.test.js` | 10/10 pass |
| `git diff --check` | pass |

The integration test exercises actual custom-eight-card GameSession paths:
player Buried Coil placement, one 4-elixir spend/cycle/materialization, actual
seeded-AI opponent ground and air targets, the existing 230-damage runtime
contact, reveal, and two authenticated restore branches that continue to
identical event and replay bytes. A separate seeded-AI case deploys Buried
Coil as north. A player-deployed hidden coil survives an authenticated
pre-expiry restore and reaches its existing lifetime boundary. The RL test
uses a legal action-mask deployment, preserves the raw `air_and_ground`
observation value, retains the unverified lifetime QUESTION, and compares
restored continuation bytes.

## Initial focused failures retained

The first `node --test tests/editable-deck.test.js` run was 11/12. The new
profile assertion incorrectly expected `lifetimeTicks` inside
`buildingRuntime.policy.corpusFields`; that object intentionally contains the
eight corpus fields only, while lifetime has a separate QUESTION receipt. The
test was corrected to assert the eight source-confidence fields and check
lifetime separately through the RL lifetime receipt and actual expiration
continuation.

The first `node --test tests/rl-environment.test.js` run was 12/13. Its new
assertion expected normalized `ground-and-air`, but the existing public RL
observation deliberately exposes the admitted profile's raw `air_and_ground`.
The test now asserts the raw schema value; production normalization was not
added.

An exploratory seed-scout exec (session 42677, PID 65674) exited naturally
with scratch-fixture output `NOT_FOUND mossguard`, `NOT_FOUND duskwing-trio`,
and `NOT_FOUND AI buried-coil`. It was not a product test and established no
source/runtime defect. The accepted integration fixture uses canonical
IDs directly, selects starting hands through `DeckCycle`, and passes in the
final 3/3 actual GameSession test above.

The app-shell 20-card collection/portrait guard was intentionally left for
the separate presentation piece. No browser, full endurance, or 18,000-tick
performance qualification is claimed for this core candidate.
