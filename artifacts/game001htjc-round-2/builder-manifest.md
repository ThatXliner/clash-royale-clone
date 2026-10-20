# GAME-001HTJC R2 candidate patch manifest

R2 is a separate, uncommitted candidate copied from the immutable R1 review input. R1 remains frozen. No repository checkout, index, or main branch files were edited.

## Base and candidate identity

- R1 candidate commit: `796557a95e6baca1747d7f5d45b97e4d8d094682`
- R1 candidate tree: `0c9414f5fc9ef3fd7eeb11520e47d792ae82e78b`
- R1 pinned source-tree fingerprint: `c510ff4916996f6e9a182e6bdafb147c67320615`
- R1 independent snapshot: `/Users/me/.codex/clash-qualification/20261020-chain-host-r1-fresh-critic/candidate-files`
- R2 candidate: `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/candidate-files`
- R2 input manifest: `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/R2-INPUT-MANIFEST.json` (SHA-256 `07a516cd3b96ac86535b50c7aca61a0243ccfd16cf406ab7c7267757fc9c1602`)
- Initial copied R2 candidate identity: SHA-256 `81f7472b01c2b1962ca68f15c897db35553a00d559be32742275e83ba497f268` over sorted `relative-path NUL file-SHA256 LF` entries; 160 copied files, 3262191 bytes.
- Current R2 candidate identity after the test-fixture correction: SHA-256 `60c498731667c6e4c4d5eba1b8a8ff973d3032758d964d027a7eba19a13239d1`; 160 files, 3262689 bytes. The original input manifest remains preserved unchanged.
- Current `src` tree fingerprint: `dc8ecfa07162a1270ca7eb057e5d9f7d9624a1167b76dd7b03e928d51c94f77b` (154 files, 3180490 bytes), identical in the candidate and the isolated guard inputs.

## Changes from the frozen R1 inputs

- `src/sim/battle-continuation-kernel.js` now carries the authoritative owner side from each actual unit, building, and crown-tower projection into the transient chain-candidate projection.
- `src/sim/live-battle-chain.js` checks the transient candidate shape and resolves each pending root’s side from its existing canonical `sourceId` unit owner. This works for dead casters because the host projection retains dead unit owner records. The closed candidate schema also requires a unit target id to equal its combat-owner proxy id. Candidate selection drops same-side owners before the existing distance/proxy ordering; the pure planner test mirrors the source to the opposite side to guard against ID-based allegiance guesses. No side value was added to root identity, pending state, source receipt, serialized chain runtime, or outer snapshot schema. This is the R2 source correction for the R1 hostile-side probe, which had selected a friendly building over a farther hostile one.
- `tests/live-battle-chain-host.test.js` adds a pure planner check with nearer friendly unit/building/crown candidates and farther hostile candidates; a real host no-enemy continuation that completes without changing friendly unit/building/tower HP; and a real host positive case where closer friendly unit/building decoys are skipped and the farther hostile building owner applies 192 HP damage. The existing source-death/restore/chunk test now asserts hostile ownership for hop 2 and hop 3 on direct, split, and chunked continuations. After the first R2 focused run exposed that the test had retained a stale unit object from before the primary-contact wait, the test now re-reads friendly unit/building and hostile building owners after the primary contact and compares all positions at the same pre-hop boundary. The closeness assertions remain in place.

Only these three `src`/`tests` files differ from the R1 copied product/test inputs:

| File | Bytes | SHA-256 |
|---|---:|---|
| `src/sim/battle-continuation-kernel.js` | 458,696 | `1c4653361832a80fadc9c0cf4747284f5947a81dcff20f3aea35db748e2c7226` |
| `src/sim/live-battle-chain.js` | 30,605 | `a63f7ace1047437eecb80ce7cb6ef024a466126f9dcb35ea7bbbf8d9e42dfbe8` |
| `tests/live-battle-chain-host.test.js` | 39,375 | `001a5ef6ba7ad0ec41fac5812f8640f8ae7d094b15f36e932f671dcf32e46989` |

`package.json`, `package-lock.json`, `.nvmrc`, the 11 closed QUESTION records, source authorities, admission limits, direct-step cap, batch caps, pending/history caps, transaction guard, and the old R1 snapshot are unchanged. The actual crown candidates in the critic’s real arena probe were outside the 3,000-millitile hop reach, so crown-side filtering is asserted in the pure boundary-planner regression; the live host regressions exercise unit/building decoys and the real hostile building HP owner.

## Verification state

R2 was run with Node `v22.22.3` through bounded captured commands. The preserved initial focused attempt is a fixture-only FAIL: PID 31233, exit 1, 10/11, because the closeness assertion inspected a unit object captured before the 149-tick primary wait. The corrected focused run is PID 32901, exit 0, 11/11. The correction is limited to reading owner positions at the actual pre-hop boundary; it does not remove or weaken the closeness assertion.

The actual hostile-side host probe is PID 31468, exit 0: a north Stormkite's tick-149 primary hit hostile south unit #2; at tick 150, hop 2 selected hostile south building #4 and applied 192 HP (824→632), while friendly north building #5 remained at 400. The probe's nearest friendly unit was 2168 millitiles from the pending origin and the hostile building was 2416 millitiles away.

The private rollback harness is PID 34402, exit 0. Clean `LiveBattle.step()` witnesses changed unit HP 1766→1574, building HP 824→632, and crown HP 3052→2860. For each, a private fault copy throws after `candidate.#advance()` and before `#adopt`; full serialization/state/all-owner HP bytes remain unchanged. Its in-place negative control exposes the mutation and fails the same rollback assertion. This is a forced-fault control, not a natural cap/history failure.

The nondeterminism guard is PID 35032, exit 0, 10/10. The shipping-isolation guard is PID 35382, exit 0, 13/13, including 12/12 reference adversaries and 11/11 identity adversaries. The isolated guard source inputs match the R2 `src` fingerprint above before and after execution. Raw captures are preserved at:

- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T181600Z-focused/` (initial fixture failure)
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T181800Z-hostile-probe/`
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T193300Z-focused-geometryfix/`
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T193500Z-rollback/`
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T194000Z-nondeterminism/raw/`
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T194200Z-shipping-isolation/raw/`

All these process trees exited. No full suite, browser, Blender, endurance run, adoption, historical-parity, or full-engine PASS claim is made; R2 remains unadopted pending an independent fresh critic.
