# GAME-001HTJC evidence index

All paths below are relative to `/Users/me/.codex/clash-qualification/20261020-chain-host-r1-fresh-critic/` unless noted. `SOURCE-FENCE.json` compares all 154 candidate `src/` files against `git archive` of the exact immutable commit. The capture records retain argv, direct PID, observed process tree, stdout, stderr, allowlisted environment, and direct exit status.

| Evidence | Capture / artifact | Result |
| --- | --- | --- |
| Focused LiveBattle host suite | `captures/live-battle-chain-host/` | PID 99267, exit 0, 9/9 |
| Nondeterminism guard | `captures/nondeterminism-guard/` | PID 99477, exit 0, 10/10 |
| Shipping isolation guard | `captures/shipping-isolation-guard/` | PID 99525, exit 0, 13/13 |
| Unit/building/crown rollback and negative controls | `captures/rollback-three-owners/`; `candidate-files/private-boundary-rollback-copies/run-2026-10-20T18-30-19-616Z-99965/report.json` | PID 99965, exit 0; clone-fault exact rollback and visible in-place mutation for all three owners |
| Raw e35 absent-policy snapshots and ordinary combat HP | `captures/absence-policy-default-bytes/` | PID 1273, exit 0; byte-equal through actual unit HP loss at tick 148 |
| One-sort e35 compatibility control | `compatibility-control-manifest.json`; compatibility half of `captures/absence-policy-default-bytes/stdout.log` | Isolated control only; not raw-baseline evidence |
| Nearest-friendly versus farther-hostile actual host probe | `captures/hostile-side-probe-reviewed-fixture/`; `private-hostile-side-probe.mjs` | PID 2185, exit 0; north structure #5 received 192 damage (HP 400→208) |
| Superseded probe distance report | `captures/hostile-side-probe/` | Preserved raw; origin was sampled after settlement, so its distances are not verdict evidence |
| Rejected probe setup attempts | `captures/hostile-side-probe-nearest-friendly/`, `captures/hostile-side-probe-final/` | Preserved stderr; illegal placements rejected as `river_excluded`, not candidate failures |

Use `VERDICT.md` for the critic finding and interpretation. `PREPARED.md` records the pinned archive scope and final gate status. The private probe is a qualification artifact and is not product or test-suite source.
