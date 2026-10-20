# GAME-001HTJC R2 bounded qualification

R2 remains an unadopted, isolated candidate. Its current file-list identity is `60c498731667c6e4c4d5eba1b8a8ff973d3032758d964d027a7eba19a13239d1` (160 files, 3,262,689 bytes). The production source tree is `dc8ecfa07162a1270ca7eb057e5d9f7d9624a1167b76dd7b03e928d51c94f77b` (154 files, 3,180,490 bytes). Node was `v22.22.3`; the bounded gates below used direct Node commands and isolated output/input directories.

The R1 fresh critic found a real hostile-side bug: north Stormkite's tick-149 primary contact on hostile south unit #2 was followed at tick 150 by a hop onto nearer friendly north building #5, reducing its HP from 400 to 208. R2 filters same-side candidates using each existing pending root's canonical source unit owner side, including when the caster is dead. It adds no side field to root identity, pending state, receipts, serialized chain state, or the outer snapshot.

The first R2 focused run is retained as a fixture failure, not a product failure: PID 31233 exited 1 with 10/11 tests passing. One test kept a pre-primary reference to the friendly unit while waiting 149 ticks, then compared its stale position to a pending origin from the later boundary. The test now re-reads the friendly unit, friendly building, and hostile building at the actual pre-hop boundary; it retains both “friendly is closer” assertions. That test-only correction produced candidate identity `60c498…` and test SHA-256 `001a5ef6ba7ad0ec41fac5812f8640f8ae7d094b15f36e932f671dcf32e46989`.

The corrected focused host runner passed 11/11 (PID 32901, exit 0). The separate actual host probe passed (PID 31468, exit 0): hop 2 chose hostile building #4, applying 192 damage (824→632); friendly building #5 stayed at 400. At the same pre-hop boundary, the nearer friendly unit was 2168 millitiles from the pending origin and the hostile building was 2416 millitiles away.

The private rollback harness passed (PID 34402, exit 0). Clean public `LiveBattle.step()` calls changed each real HP owner: unit 1766→1574, building 824→632, crown 3052→2860. A private fault copy forced an exception after `candidate.#advance()` and before `#adopt`; each fault left the full serialized battle, public state, and every owner HP byte unchanged. The in-place negative control exposed the mutation and failed the identical rollback assertion. This verifies the clone/adopt fault seam; it is not evidence of a natural cap failure.

The nondeterminism guard passed 10/10 (PID 35032, exit 0). The shipping-isolation guard passed 13/13 (PID 35382, exit 0), including 12/12 reference adversaries and 11/11 identity adversaries. Both isolated guard inputs used the R2 `src` fingerprint above; their source tree hashes matched before and after the runs.

The initial failed focused attempt and all successful raw outputs and process metadata remain in these capture directories:

- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T181600Z-focused/` — 10/11 fixture-geometry failure, PID 31233.
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T181800Z-hostile-probe/` — hostile-side probe, PID 31468.
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T193300Z-focused-geometryfix/` — 11/11 focused host tests, PID 32901.
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T193500Z-rollback/` — unit/building/crown rollback witnesses, PID 34402.
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T194000Z-nondeterminism/raw/` — 10/10 nondeterminism tests, PID 35032.
- `/Users/me/.codex/clash-qualification/20261020-chain-host-r2-builder/captures/attempt-20261020T194200Z-shipping-isolation/raw/` — 13/13 shipping isolation tests, PID 35382.

Every listed process exited. No full repository suite, build, browser, Blender, or endurance test ran in this qualification. The R2 code and test results remain subject to a fresh independent critic; no adoption, historical-parity, or full-engine pass is claimed.
