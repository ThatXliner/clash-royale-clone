# CARDS-019H1 critic verdict

**Verdict: PASS for the bounded H1 source-flag and shared-host target-following bar.** This is not a PASS for historical homing parity, CARDS-019H2 speed calibration, or the full troop roster.

## Pinned review identity

- Candidate: `7a6bc18828675f9ec47b51e29880e7cb8fc23023` (tree `4cdefc3b5ee5a5ab5840ffc1da5f7bd9fc3a40f6`)
- H1 source: `eaed44cf29865d7fd9c1fcc54a3420733e8b9d9f`; parent: `6198883470fa48f6746974d7590168ae3011ac37`
- Detached checkout: `/tmp/cards019h1-critic-7a6bc18`; post-run HEAD/tree equal pre-run; tracked diff none.
- Shared battle kernel: 523,244 bytes of the unchanged 524,288-byte cap (1,044 bytes under).

## Why H1 passes

The pinned Wizard projectile receipt retains raw `homing: true` from `chr_wizardProjectile` at RoyaleAPI commit `54fdef52c5086393b085f57faeeab8ef86b28160`. The admitted Kilnkeeper profile carries that flag into the shared `LiveBattle`/`BattleCombat` projectile path. The measured `speed: 600` stays a raw source field; the runtime's 500 millitiles-per-tick is kept as an unverified playability estimate. `reference/stats/SOURCES.md` does not define projectile-speed units.

Ground and air pursuit were exercised through real moving units in `LiveBattle`, with an independent BigInt integer-motion and arrival/contact oracle checking every boundary. Ground (`coilblade`): 4 pursuit boundaries, 4 oracle checks, 0 mismatches, target displacement 100 millitiles, contact tick 124, three distinct live step vectors, and divergence from the locked launch-center path at tick 122. Air (`skymaul`): 6 boundaries, 6 checks, 0 mismatches, displacement 100 millitiles, contact tick 126, two distinct live step vectors, and divergence at tick 125. Each produced exactly one contact. The independent probe and full per-tick traces are in `evidence/homing-numeric-probe.{mjs,json}`.

The ordinary-troop TAP suite exercises actual target motion for both layers and verifies direct, restored, and forked continuations have matching events, replay, and serialized bytes through contact. It also exercises a spell-killed locked target (one `target_dead` fizzle, no damage), source death after launch (projectile continues to one hit), and a target crossing beyond launch-origin range (projectile stays pending and later hits the same target). Each case uses the shared host and restore/fork continuation. Source/profile/question tampering and injected snapshot motion/state are rejected; the causal history is the motion authority, so no separate mutable per-position witness is required.

Every operational homing policy is separately named and retained as `authoritative: false`, `confidence: unverified`, `disposition: question`: pursuit speed/conversion, direction update and rounding, target lock and reacquisition, target death, source death, range and bounds, contact radius and center, intermediate collision, arrival boundary, and contact ordering. The new movement helper lives under the shared sim path; there is no card-private simulator or source-confidence promotion.

The 66 non-Kilnkeeper occurrence bindings remain byte-identical; only the Kilnkeeper splash binding changes (67 total before and after). The default-eight receipts for seeds 0 and 23 are byte-identical at setup, initial, tick 120, replay 120, tick 240, and replay 240. The measured manifest pin is `ad9cf6fcd67e51fffbc00e77f44c7b2818af5d3f766436f4145048713f03cb51`. The source/test diff adds assertions and removes no test lines. No wall-clock or unseeded randomness was introduced.

## Verification evidence

All prescribed gates passed; raw TAP is preserved under `evidence/`:

| Gate | TAP |
|---|---:|
| `game-roster-troops-ordinary` | 25/25, 23,418.297 ms |
| `game-roster-troops-projectile` | 6/6, 33,088.933 ms |
| `game-roster-troops-projectile-profiles` | 26/26, 106,169.327 ms |
| `game-roster-troop-profiles` | 11/11, 137.136 ms |
| `game-roster-admission` | 7/7, 4,423.353 ms |
| `game-roster-buildings` | 10/10, 22,802.054 ms |
| `game-session` | 9/9, 77,366.898 ms |
| `rl-environment` | 12/12, 109,415.160 ms |
| `content-schema` | 20/20, 455.946 ms |
| `nondeterminism-guard` | 10/10, 1,009.260 ms |
| `shipping-isolation-guard` | 13/13, 32,324.111 ms |
| `shipping-isolation-release` | 4/4, 69,631.977 ms |
| `shipping-isolation-host` | 1/1, 13,832.037 ms |
| full `integration-audit` | 6/6, 442,139.911 ms |

The runner was PID 33653 on exec session 28674 and exited 0. The integration child chain (npm 38491 → runner 38503 → node 38504/38505) completed naturally; it was not restarted. `evidence/runs.tsv` records exit 0 for every gate.

## Biggest remaining gap

No frame-calibrated pre-March-2023 Wizard footage or engine source resolves the raw speed 600 unit, turning/rounding, or the other contact and ordering questions. Those runtime policies remain explicit QUESTIONS, so this evidence supports only deterministic shared-host H1 behavior, not historical parity.
