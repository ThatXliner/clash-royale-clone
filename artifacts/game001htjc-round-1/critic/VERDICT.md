# GAME-001HTJC fresh critic verdict

## PIECE

Shared chained-projectile host continuation. Reviewed the immutable candidate commit `796557a95e6baca1747d7f5d45b97e4d8d094682` (candidate tree `0c9414f5fc9ef3fd7eeb11520e47d792ae82e78b`; pinned source tree fingerprint `c510ff4916996f6e9a182e6bdafb147c67320615`). The bounded source archive is `candidate-files/`; runtime evidence was captured under `captures/`. No product checkout or index files were changed.

## VERDICT

**FAIL.** The focused suite and required guards pass, but a fresh actual `LiveBattle` probe shows a chain hop damages a friendly structure when a farther hostile structure is also eligible. The host continuation therefore violates the existing hostile-side target eligibility invariant.

## EVIDENCE

- Focused host runner: Node `v22.22.3`, npm `10.9.8`; PID `99267`, direct exit `0`, **9/9** tests passed. Raw stdout: `captures/live-battle-chain-host/stdout.log`; argv, PID tree, allowlisted environment, and exit status: `captures/live-battle-chain-host/metadata.json`.
- Nondeterminism guard: PID `99477`, exit `0`, **10/10** passed. Raw stdout and metadata: `captures/nondeterminism-guard/`.
- Shipping isolation guard: PID `99525`, exit `0`, **13/13** passed, including the repository shipped-entry-graph check. Raw stdout and metadata: `captures/shipping-isolation-guard/`.
- Actual host hostile-side probe: PID `2185`, exit `0`. The tick-149 Stormkite primary hit hostile Mossguard unit `#2` on the south side. At hop tick `150`, the nearest eligible non-primary target was friendly Bulwark Needle structure `#5` (north, 2,085 millitiles from the primary origin); a farther hostile Bulwark Needle `#4` (south) was 2,416 millitiles away. Friendly Mossguard `#3` was also eligible at 2,168 millitiles. The actual contact selected building `#5`; its HP fell **400 → 208**, with `structure-damaged.amountApplied = 192` and `chain-hop-contact.outcome = contact`. The south and north lane crowns were 7,416 and 9,584 millitiles away, outside this hop fixture. Full raw observation: `captures/hostile-side-probe-reviewed-fixture/stdout.log`; process metadata: the matching `metadata.json`.
- Three-owner rollback harness: PID `99965`, exit `0`. For unit primary, building hop, and crown hop, clean steps reduced HP by 192 (`1766→1574`, `824→632`, `3052→2860`). Injecting a throw after cloned `candidate.#advance()` and before `this.#adopt(candidate)` preserved serialization, state, and all owner HP exactly; an in-place negative control visibly mutated each owner before throwing. Raw report: `candidate-files/private-boundary-rollback-copies/run-2026-10-20T18-30-19-616Z-99965/report.json`; stdout and process metadata: `captures/rollback-three-owners/`.
- Absent-policy bytes: PID `1273`, exit `0`. The candidate and pinned raw e35 commit `e35dda4c0225b88ddac91a56f15e81fee32c3c68` matched exact UTF-8 snapshots at construction, scheduled deployment, deployment, and ordinary unit HP loss. The ordinary-contact checkpoint is tick `148`, source `1`, target `2`, and actual HP **1766 → 1574** (delta `192`); its snapshot is 45,487 bytes, SHA-256 `c9cf3f9e946e7d2268f3dc045136c775086cca536c5d7a85ca9691d7174444f5`. Full checkpoint output: `captures/absence-policy-default-bytes/stdout.log`.
- The optional projectile-receipt comparison is separately labeled **compatibility control**, not raw-baseline evidence. Its e35 copy differs at exactly one bounded operation in `src/sim/battle-continuation-kernel.js`: `state.units.sort(...)` became `[...state.units].sort(...)` to avoid mutating the frozen array. In that control, ordinary launch tick `144` and contact tick `148` applied the same actual `192` HP delta. File-by-file hashes and the exact patch are in `compatibility-control-manifest.json`; this result is not a claim about unpatched raw e35 behavior.
- The QUESTION policy and records remain explicitly versioned/closed and no historical balance verification is claimed. The 11 fixture values remain questions; no 24th card was admitted. These facts do not offset the verified friendly-fire defect. No full `npm test`, browser, endurance, or full-candidate pass is claimed.

## BIGGESTGAP

Friendly-side units, structures, and towers enter the chain candidate projection without side identity, and the continuation selects the nearest eligible projection without applying hostile-side filtering. The fresh host probe confirms the consequence in real structure HP. The focused suite lacks this nearest-friendly-versus-farther-hostile case. It needs a product fix and a regression test before this piece can pass. The injected rollback harness is a clone/adopt seam fault; later-batch failure is separately exercised directly at the projectile runtime boundary, not by a LiveBattle integration fixture.

## Setup attempts kept separate

Two early probe fixtures were rejected by `river_excluded` deployment validation: one put a structure at `y=12000`, and another put a north structure on the inclusive river edge at `y=17000`. These are setup failures only and are not counted as candidate test failures. The final probe uses legal placements and is the verdict evidence above. An earlier run also read the chain origin after settlement; that distance report was discarded and corrected by snapshotting the pending origin before the hop.
