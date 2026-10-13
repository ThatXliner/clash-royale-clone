# GAME-001GPR5P terminal-aware regression receipt

This bounded piece makes the endurance planner stop before submitting a stale
command after a natural match end. It does not satisfy GAME-001GPR5's full
18,000-tick endurance requirement; the original default-deck workload still
ends early and fails that requirement.

The recorded Chrome failure transcript has SHA-256
`bd06ef21ccd243f48667a1ffdcb5d522613fcf03f3f3b311852dc9c8e4e90594`. Its
deterministic replay reaches a natural terminal at session tick 13,352:
north wins 2–1 by overtime sudden death at `endedAtTick` 13,351. The exact
terminal record is in `derived-checkpoint-manifest.json`; its evidence points
back to that transcript. Before this change, the browser test attempted another
physical delivery after the match ended, producing the observed 24-versus-25
input failure.

`tests/helpers/endurance-workload.js` now returns no plan for terminal state and
provides the shared full-duration continuation assertion. The browser loop
checks that assertion before planning or delivering input. A natural early end
therefore stops the loop with its actual tick and result while the required
18,000-tick target remains unchanged. The focused test verifies the captured
transcript hash and exact result, checks that terminal planning returns `null`,
and checks that the 18,000-tick continuation gate still rejects this workload.

Verification: `node --test tests/endurance-workload.test.js` passed 1/1. The
captured TAP is `endurance-workload-regression.tap` (SHA-256
`c3d8735ee9f50b195edebf98bc3f0e36cc62f68372e69841feb77dd203eb1b8a`). Syntax
checks passed for both edited test modules and the helper.

Runtime continuity: `src/sim/battle-continuation-kernel.js` has no diff from
HEAD; its working-tree and HEAD SHA-256 are both
`eab70aaddccc9b60fb52d701cf0efcf37b343dc07de79650364f35f47b7f0335` and its
size is 524,277 bytes, below the unchanged 524,288-byte guard. The browser
entry also has no diff (`3ca73736f019a65dd3d2bde8157eda4479aad2121154d5968c715cb14af52436`).
The unchanged browser limits remain 1 tick per chunk, 300 ticks per segment,
50 ms for browser long tasks, and a required 18,000-tick full run.

The calibration trials are evidence only; none is accepted as a full-duration
workload. Their complete commands, outputs, and failure logs remain in this
directory:

| Seed-zero policy trial | Actual result |
| --- | --- |
| Trigger y<17,000, deploy y=9,500 | South wins 2–0 at tick 10,800; 22 south commands and 36 north deployments. |
| Trigger y<17,000, deploy y=5,999 | South wins 3–0 at tick 6,117; 13 south commands and 17 north deployments. |
| Layer-aware, durability-first, y=5,500, no no-threat refresh | North wins 2–1 at tick 10,800; 16 south commands, 36 north deployments, 69 tower contacts, and 85/31 north/south units created. |
| Crown-adaptive y=5,500/y=9,500 | North wins 2–1 at tick 10,800; south never fell behind, so counterpush placement was not used. |
| y=7,600 and y=9,000 placement checks | Rejected as `tower_footprint`; no simulation trial was admitted. |

Earlier checkpoint-based branches are also retained with their individual
outputs. This receipt keeps the partial terminal-planning repair separate from
the still-failing 18,000-tick endurance bar.

Key raw result hashes are `4a36209411309ccbc0e889b9d12f8d36f0890d7e36e34a934c070954c81bc61a`
for the deterministic red replay, `41f75efaf4ec5b158c6e3a41bdb1311102973d57da6fc527352e775e04619ec3`
for the y=9,500 opening trial, `2aa363b63902eae222b0d9fe93f0516c5fa0e7f0ad02ac78ad984bed4481fc57`
for the y=5,999 opening trial, `988e0161709767e0cae9f3f6b8e0ae9b07897193eed0de19ad7e08e6e4071f4e`
for the durability-first opening trial, and `a586e9fc103aa2fd5499562d75d37155958d8e1d979737c220a4a0cc617efa73`
for the crown-adaptive opening trial.
