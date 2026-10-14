# CARDS-019K core round 2 critique

**Verdict: PASS for the bounded provisional core on immutable source `6cc8656e4f6c967868edac4bd71c87c57c6e7009`.** The clean archive SHA-256 is `0741ca7280f2d3fd42c7da9a553fc94ff712fc537d2450652afd9df266e95276`. The target behavior is original Kilnkeeper’s ordinary ranged projectile with enemy air/ground splash. This verdict does not claim full card parity; `homing: true` stays an unverified, non-authoritative QUESTION under CARDS-019H.

The actual editable-deck/GameSession path and RL adapter both deploy Kilnkeeper for five elixir with one cycle advance. In the independent GameSession AI probe, seed 0 opened Kilnkeeper in north’s hand; one `session-deployed` event was accepted at tick 0, spent 5, reduced elixir 10→5, advanced sequence 0→1, and materialized one Kilnkeeper. The RL adapter accepted its legal Kilnkeeper action (action 261, seed 1) for five elixir and advanced the south cycle once.

The actual GameSession unit fixture retained a pending source-bound projectile at tick 121 and resolved one impact at tick 124. It damaged unit IDs 4, 3, and 11 once each for 281; the primary had moved from launch position but remained within the canonical circle. The building fixture recorded one canonical external contact for `building:17`, 281 damage; the tower fixture recorded one contact for `north:lane:west`, 281 damage. The actual LiveBattle fork/restore probe matched canonical pending bytes, impact events, damaged bytes, and the next three-tick event/replay branch exactly. A separate actual planner probe moved both ground and air primary cases 1,501 millitiles outside the locked 1,500 circle: neither received direct damage, while eligible enemy air and ground victims exactly on the boundary and one in-circle building received 281 each. Outside, dead, friendly, and untargetable victims were excluded.

The pinned comparison receipt keeps `damage=281`, rare, level 11, projectile index 8, linked projectile ID, source URI/commit/hash, projectile radius 1,500, character radius 0, and raw speed 600 as non-authoritative source questions. Runtime speed 500 is separately an estimate. Pending-snapshot mutation checks rejected all 18 wrong identity/component, catalog, damage, index, linked-ID, source URI/hash/commit, QUESTION, and confidence-witness mutations. The source binding map preserves all 66 prior occurrence values and adds exactly the Kilnkeeper ordinary-projectile occurrence. The full integration audit reports digest `d7e64a47fe3fead14b3bb07f0a636dd0ddb8f4ade8d120a2c087d01e6fff7bed`, 67 supported occurrence bindings, and 62 unique IDs; it passed every audit assertion and both full selector sweeps. The kernel is 523,929 bytes against the 524,288-byte limit (359 bytes of headroom).

Default-eight canonical hashes at seeds 0 and 23 match old engine baseline `0cbd7e5c245e58aedc3598f51ad5371d7477ab9e` for setup, initial state, tick 120, replay 120, tick 240, and replay 240. Both runs report `editableMatches`, `finalMatches`, and `replayMatches` true. Shipping isolation guard, release, and host checks pass; no reference import or protected shipped identity was reported. All 510 hashed source/script/test/package files in the clean archive still match the before-run hash manifest.

Focused test results:

| Command | Result |
|---|---:|
| `node --test tests/rl-environment.test.js` | 12/12 pass |
| `node --test tests/integration-audit.test.js` | 6/6 pass |
| `npm run test:game-roster-troops-projectile-profiles` | 26/26 pass |
| `npm run test:game-roster-troops-projectile` | 6/6 pass |
| `npm run test:game-roster-troops-ordinary` | 21/21 pass |
| `npm run test:game-roster-troop-profiles` | 11/11 pass |
| `npm run test:editable-deck` | 12/12 pass |
| `npm run test:content-schema` | 20/20 pass |
| `npm run test:nondeterminism-guard` | 10/10 pass |
| `npm run test:shipping-isolation-guard` | 13/13 pass |
| `npm run test:shipping-isolation-release` | 4/4 pass |
| `npm run test:shipping-isolation-host` | 1/1 pass |

**Baseline limitation / biggest follow-up:** `npm run test:game-session` is 8/9 because the shared “all eight cards materialize” test expects all six Briar-band members after one tick but observes one (`1 !== 6`, `tests/game-session.test.js:73`). The same 8/9 failure occurs on old baseline `0cbd7e5`; the eight other GameSession tests pass on both. This is not a Kilnkeeper-specific regression, but it means the broad GameSession gate is not green. The dedicated Kilnkeeper GameSession pending/damaged restore and LiveBattle fork probes pass.

Raw TAP output, command/PID/exit receipts, custom probe source/output, candidate archive identity, and before/after source hashes are in `evidence/`. The full integration audit receipt includes its complete occurrence list. No shared source, index, HEAD, PLAN, or progress file was modified by this critique; only this critic artifact directory was written.
