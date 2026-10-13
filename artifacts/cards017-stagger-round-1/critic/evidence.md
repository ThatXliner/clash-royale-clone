# CARDS-017T critic evidence

Verdict: **FAIL** against frozen target `c981ec2444b9d2f08dacdb5c6f04ce6b5b786dfb`.

The worktree `/tmp/clash-cards017-critic` is a detached checkout at that exact commit. No runtime or test implementation files were changed. Evidence is confined to `artifacts/cards017-stagger-round-1/critic/`.

## Source bar checked

`PLAN.md` defines the five remaining source-backed squads as Thornscouts (4), Forgeguard (5), Sunthread Pair (2), Duskwing Trio (3), and mixed Briar Band (6: three Goblin runners followed by three Spear Goblin darters). The pinned `reference/stats/cards.json` counts and component-local indices match those roster sizes. Core stats remain marked unverified in that file.

The formation audit and `reference/stats/SOURCES.md` support a 100 ms interval between consecutive members from Supercell's general deployment standardization, which is six simulation ticks at this engine rate. The raw per-card `summon_deploy_delay: 100` rows found in the pinned source are specifically Bats and Minions; the five new squads are supported by the publisher-wide rule, not fabricated individualized raw-field evidence. The audit leaves coordinates, member order, orientation, collision adjustment, placement randomness, and first-member onset as QUESTIONS. The two Skeleton card exceptions remain instant.

## Automated results

| Scope | Command | Result |
| --- | --- | ---: |
| Stagger behavior | `node --test tests/cards017-stagger.test.js` | 12/12 pass |
| Ordinary/player/playable/previous-stagger/editable suites | `node --test tests/game-roster-troops-ordinary.test.js tests/game-player-deploy.test.js tests/playable-roster.test.js tests/cards016-stagger.test.js tests/game-roster-troops-air-swarms.test.js tests/editable-deck.test.js` | 60/61 pass |
| RL, determinism/shipping guards, roster admission | `node --test tests/rl-environment.test.js tests/nondeterminism-guard.test.js tests/shipping-isolation-guard.test.js tests/game-roster-admission.test.js` | 37/41 pass |

Across these three scoped suites: **109/114 pass, 5 fail**. The related-suite failure is `tests/editable-deck.test.js:338`: after one tick, the test expects two Sunthread Pair members but observes one. Its receipt still contains the full two-member squad; the first member is visible at tick 1 and the next is due six ticks later. The four roster-admission failures are fixture assumptions: the occurrence adapter expects all six Coppershade Flock bodies after its first step, and three setup helpers omit the newly-required source-confidence QUESTION records.

The natural default Briar outcome check also passed independently: `node --test --test-name-pattern='wait-only seed 2 reaches its pinned natural engine terminal after checkpoint restore' tests/rl-environment.test.js` (1/1). The passing test asserts the corrected terminal result: north wins 3–0 at engine tick 4,838 (`endedAtTick: 4,837`, `central_destroyed`), reward -1, and checkpoint-restored continuation has the exact same serialized terminal state. The former default Briar snapshot is not used as the passing criterion.

Focused stagger evidence covers all seven ordinary/swarm squads in the file: six-tick births on both sides and exact boundary restores; mixed Briar global sequencing with component-local indices; source receipt requirements and forged-interval rejection; pending-queue overflow atomicity; no premature observation/combat; and immediate Skeleton exceptions. The exact TAP output is `cards017-stagger.tap`.

## Real browser witness

`browser-witness.mjs` serves the committed `public/ui-arena-shell.html` through `tests/game-browser-journey-server.js`, launches Chrome, uses trusted mouse input to select and place Briar Band, and checks the live GameSession and DOM in both 720x1280 phone and 1440x900 desktop viewports. Both pass with no console or page errors. At simulation/UI ticks **1, 7, 13, 19, 25, 31**, the matching unit and DOM counts are **1, 2, 3, 4, 5, 6**; the first three remain Briar runners and the final three are darters. Deployment commits once for cost 3. `browser-witness.json` records all six PNG SHA-256 values and the witness details.

The first physical-input probe failed because the card slots were offscreen at document y=1121 in both a 390x844 phone and 1440x900 desktop viewport. The retained `*-selection-debug.json/.png` files show no selected card or input event. The probe was corrected to scroll the actual card slot into view and still use physical mouse input; both corrected viewports then passed. This was a probe-coordinate issue, not a relaxed input path.

`SHA256SUMS` records hashes for every retained evidence file except the manifest itself.

## Actionable gap

Update the adjacent suite fixtures to respect scheduled births: in particular, `editable-deck.test.js` must assert one born Sunthread member after the first tick and the second after six more ticks while retaining the full typed deployment receipt. The Coppershade adapter needs the same tick-aware expectation, and the three admission setup helpers need the newly-required confidence QUESTION records. No production defect was established by these failures, but the requested related suites are not green, so the round does not pass.
