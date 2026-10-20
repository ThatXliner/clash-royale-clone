# Game-audio fixture diagnosis and focused validation

The failure is in the test fixture’s setup contract, not evidence of an audio runtime regression. I validated this on fresh external snapshots of both candidate 57baa0e6df0ea646abae3c155c05002e97336072 and accepted origin/main 59d9fda9093b058cd3025a804835629b0552eeef, then ran the proposed one-file fixture correction on a separate candidate snapshot. No files, HEAD, or index in the dirty source checkout were changed. No broad npm test or browser run was started.

## Focused run results

- Unmodified candidate: node tests/game-audio-runtime-runner.js game-audio-runtime exited 1 with the same five failures shown in the original qualification log. Cases 1, 4, 6, and 9 reject Briar’s mismatched source-confidence QUESTION values; case 2 rejects zero for a positive-integer confidence field. The other six cases pass.
- Unmodified origin/main: the same focused command exited 1 with the same five failing cases and messages. This confirms the fixture is invalid against the accepted baseline’s admission contract; it is not merely a candidate-only runtime change.
- Corrected external candidate copy: the same focused command exited 0; all 11 tests passed. The correction is in proposed.patch and changes only tests/game-audio-runtime.test.js.
- Each run used Node v22.22.3. The three runner PIDs (1301, 1482, 1570) were absent after wait. The runner uses spawnSync for the test process, so child completion precedes runner exit.
- Raw logs: unmodified-focused.log, main-focused.log, corrected-focused.log. Exit codes and process-absence records accompany each log. Their SHA-256 hashes are in run-pins.txt.

The corrected run passed the assertions for ordered deploy, attack, launch, impact, and damage cues; exact-once repeated rendering; stationary movement suppression; direct-versus-restored replay and cue equality; positive locomotion cues after real displacement; accelerated cue bounds and silent rebase; terminal tower, crown, and match-end cues; disposal and zero active voices. The other audio runtime, restart, mute/gain, and hostile-admission checks also passed. The assertion bodies were not removed or weakened.

## Why the fixture fails

In the immutable test source, acceleratedRoster overwrites all listed numeric stats on every card/entity (tests/game-audio-runtime.test.js:26-48), then sessionSetup pairs that roster with freshly generated questions from the canonical, unmodified roster (lines 51-67). The playable-roster order puts briar-band at roster[6] (src/content/playable-roster.js:8-17). The projection attaches source-confidence policy to Briar entities (lines 204-245), and createPlayableRosterQuestionRecords emits those QUESTION values from a fresh canonical roster (lines 296-318). Admission encodes each policy-bound estimate, compares it with its QUESTION value, and rejects divergence (src/shared/session-troop-source-confidence-authority.js:252-277). The stationary helper also writes movement zero to Briar, while the same authority requires positive integers for that tracked field (authority lines 204-215).

These failures happen in GameSession setup before those tests reach their audio assertions. The focused origin/main run confirms that the same unmodified fixture fails there too. The candidate kernel differs from origin/main, but both checked-setup paths call the same source-confidence guard with the entity and question maps (candidate src/sim/battle-continuation-kernel.js:4092-4106; origin/main file lines 5939-5953).

## Correction and scope

proposed.patch leaves accelerated synthetic stats on cards without source-confidence policy, so Briar’s tracked estimates remain paired with the canonical QUESTION records. In the stationary fixture it zeros movement only where movement is not policy-tracked, explicitly chooses a matching card from the deterministic South hand, and asserts that such a card exists. The deck hand is four cards and the eight-card deck contains only one policy-bearing playable card (src/sim/deck.js:5-6, 151-158; src/content/playable-roster.js:8-17; src/shared/session-troop-source-confidence-authority.js:72-83), so the runtime run confirmed the selected hand condition for this fixed seed. The stationary setup delays the opponent’s first decision to tick 3,599, beyond the 120-tick probe; setup validation permits an interval of 3,600 and an offset below that interval (src/sim/game-opponent.js:282-284), and the controller only thinks at or after the offset (src/sim/battle-continuation-kernel.js:10157-10161). These changes preserve the original audio behavior checks and leave the admission guard intact.

Focused source search found no copy of the same synthetic roster mutation pattern in the other audio, RL, or release modules inspected: tests/audio-events.test.js, tests/audio-renderer.test.js, tests/audio-production-assets.test.js, tests/game-browser-audio.test.js, tests/rl-environment.test.js, tests/release-001b.test.js, tests/release-001b-guards.test.js, and tests/shipping-isolation-release.test.js. The browser-audio fixture uses the unmodified playable roster with its matching questions (game-browser-audio.test.js:26-45); the production-audio tests create the shipped session setup rather than mutating the playable roster (audio-production-assets.test.js:19-24). This is a focused source search, not a blanket semantic review of every test fixture.

## Pins and remaining scope

Candidate commit: 57baa0e6df0ea646abae3c155c05002e97336072.
Accepted origin/main commit: 59d9fda9093b058cd3025a804835629b0552eeef.
The unmodified candidate and main test file hashes match at f61ca9c9047130469b9e85f8c50be591c4ae54ba9555aa70a81f258828c3123a. Their playable-roster hashes match at 61107646cd9beae6871fc54360ad71a17824ea38d5588531effdef496b26b052, and their source-confidence authority hashes match at e6b82d8dbcdd480e51d880c02bfd9fc2bb71fbcc03a66b0258d852024c2c21dd. The corrected test file hash is 83f5f8f6e056f1b36252f6b608b3cfb99696095c09e8da1e148fde5397cefbde.

The independent critic has since rerun the corrected focused module on fresh candidate and accepted-main archives; both pass 11/11. The full npm suite remains unrun and is outside this focused fixture qualification.

## Canonical source citations

Line numbers refer to the exact pinned source shown, not the dirty checkout.

- Candidate tests/game-audio-runtime.test.js:26-48, 51-82, 85-103, 128-160, 213-240, 259-288, 340-360.
- Candidate src/content/playable-roster.js:8-17, 204-245, 296-318.
- Candidate src/shared/session-troop-source-confidence-authority.js:204-215, 252-277.
- Candidate src/sim/battle-continuation-kernel.js:4092-4106; accepted main src/sim/battle-continuation-kernel.js:5939-5953.
- Candidate src/sim/deck.js:5-6, 151-158.
- Candidate src/sim/game-opponent.js:282-284; candidate src/sim/battle-continuation-kernel.js:10157-10161.
- Candidate tests/game-browser-audio.test.js:26-45; tests/audio-production-assets.test.js:19-24.

## Independent focused confirmation

A separate critic repeated the corrected focused run on fresh archives, serially: candidate `57baa0e6df0ea646abae3c155c05002e97336072` passed 11/11 (exit 0, PID 2162 reaped), and accepted main `59d9fda9093b058cd3025a804835629b0552eeef` passed 11/11 (exit 0, PID 2729 reaped). Both used Node v22.22.3 and `node tests/game-audio-runtime-runner.js game-audio-runtime`. SHA-256 tree manifests show only `tests/game-audio-runtime.test.js` changed in each archive. The critic’s assertion comparison for main confirms all original assertions remain and only the new stationary-card existence guard is added. The fixed seed was independently confirmed to provide a policy-free card in South’s hand in both trees. Raw logs and full manifests are in `audio-fixture-critic-independent/` and `audio-fixture-critic-main-independent/` beneath this diagnosis directory. These focused runs do not establish that the full npm suite passes.
