# CARDS-016T builder evidence

Base revision: `24a7305e6fa2ed6c3e9f3a1205e3a2c045dd008d`

The official June 2, 2020 Supercell deployment note supports a 100 ms interval between multi-unit members, including Bats and Minion Horde. At the fixed 60 Hz simulation rate, the implemented interval is six ticks. Gloamwing's five members therefore appear at ticks 0, 6, 12, 18, and 24 relative to the existing first appearance; Coppershade's six appear at 0, 6, 12, 18, 24, and 30. This implements only the newly sourced relative interval. Generic formation geometry, member order, and input-to-first-appearance onset remain questions.

The existing first member is still materialized at the current deployment boundary. Later members are recorded as deterministic `BattleCombat.scheduleSpawn` operations for `deployment.tick + memberIndex * 6`. Their IDs and movement witnesses are reserved for continuation, while active combat state and public unit projections omit them until their scheduled tick. The deployment command, elixir spend, and deck cycle remain one transaction.

## Verification

- `node --test tests/cards016-stagger.test.js tests/game-roster-troops-air-swarms.test.js tests/cards016-integration.test.js` — **16/16 passed**. The new suite checks exact spawn event ticks for both cards and both sides, no pre-birth state/target/combat exposure, restore at every one-tick cut, uneven `stepMany` chunk equivalence, future queue snapshot validation, forged tick and duplicate ID rejection, and atomic duplicate/queue-overflow rejection. Existing integration checks retain exact spend/cycle, seeded AI choices, air contacts, projectile continuation, RL visibility, and confidence QUESTION closure.
- Protected default-eight fixture: `node artifacts/cards-expansion-round-4/core-builder-round-2/default8-snapshot-runner.mjs` before and after produced byte-identical 1,132-byte output. SHA-256 for both: `cb08277710370c0ba436de3112c41b16888af1c40ee515b60ceba38d792ca4fb`.
- `node tests/nondeterminism-guard-runner.js nondeterminism-guard` — exited 0; 10/10 tests passed.
- `node tests/shipping-isolation-guard-runner.js shipping-isolation-guard` — **13/13 passed**; package targets 4/4 covered, reference adversaries 12/12 detected, and identity adversaries 11/11 detected.
- `src/sim/battle-continuation-kernel.js` is 524,275 bytes, 13 bytes below the 524,288-byte cap. Existing caps and guard policy are unchanged.

Raw stdout is preserved in `focused-tests.tap`, `nondeterminism-guard.tap`, and `shipping-isolation-guard.tap`. The post-change 1,132-byte default-eight fixture is preserved in `default-eight-snapshots.json`; its digest matches the protected pre-change output.

The interval receipt is validated as a source-backed field separate from confidence QUESTIONS. Snapshot parsing rejects a missing or forged receipt; QUESTIONS continue to close over the remaining estimates. No `reference/` material is imported into runtime code.
