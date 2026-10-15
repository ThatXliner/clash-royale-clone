# Shared combat factory extraction — builder record

Baseline: accepted main 7f41167c2429eec637dbb7c5f838fa3b404ab4d2.

The defineBattleCombat(registerCompact) factory moved from src/sim/battle-continuation-kernel.js into src/sim/battle-combat-runtime.js. The moved factory body is 75,228 bytes and is byte-identical to the accepted-main body after removing the single export keyword needed for the kernel import. Its clone, deepFreeze, canonicalization, validation helpers, constants, runtime-instance WeakSet, and preview-receipt WeakMap remain inside the factory.

The complete opaque-continuation helper, including assertOpaqueContinuationHandle and its bootstrap invariant, moved once into src/sim/opaque-continuation.js. Its implementation is byte-identical to accepted main after removing the single export keyword on opaqueContinuation. Each factory invocation still creates its own WeakMap and registers its own issue/resolve callbacks.

The factory's referenced import closure is:

- AttackCycle from attack-cycle.js; DamageSystem from damage.js
- MAX_SPATIAL_MILLITILES, validateCircle, and validatePosition from spatial.js; retainOrAcquireTarget from targeting.js
- appendCombatEffectChild, appendCombatEffectProjectileRoot, appendCombatEffectStructureContacts, combatEffectRootId, combatEffectFeedSnapshot, createCombatEffectFeed, and serializeCombatEffectFeed from combat-effect-feed.js
- appendSpellAreaImpact and checkedAreaImpact from spell-area-impact.js
- checkedCombatSpawn as checkedSpawn, checkedCombatUnit as checkedUnit, copyCombatUnitFields, and planOrdinaryProjectileSplashImpact from ordinary-projectile-splash.js
- canonicalMeleeAreaSetup, exactMeleeAreaSetup, and planMeleeUnitAttack from area-target-selection.js
- advanceOrdinaryProjectileQueue, ordinaryProjectileImpactTargetStatus, ordinaryProjectileTargetInRange, ordinaryProjectileTravelTicks, and resolveOrdinaryProjectileHomingTarget from ordinary-projectile-homing.js

The kernel still imports several of those same names because its tower and live-battle factories use them too. No import from the new runtime points back to the kernel. The combat registry, current-tick and structure-contact callback assignments, defineBattleTowers call, and public battle-combat.js facade match accepted main byte-for-byte.

The nondeterminism guard inventory now lists the two new simulation modules. tests/battle-combat-baseline-differential.test.js stages accepted-main source for the baseline kernel and these adapters at their original paths:

- src/sim/battle-combat.js
- src/sim/game-session.js
- src/sim/live-battle.js

No adapter import path is rewritten. Their original relative imports continue to resolve to the staged accepted-main kernel. Every other source module in the temporary `src` tree is a symlink to this checkout, so baseline and candidate receipt adapters share the same canonical module identities and brands. The baseline kernel is changed only in the temporary copy, where `defineBattleCombat` gets an `export` keyword so the test can inspect that factory's callback scopes; its accepted source bytes are hash-checked first.

The qualification test does not use `git show` or assume Git history is present. Run it with `SHARED_COMBAT_BASELINE_ROOT` pointing at an immutable accepted-main 7f41167 source checkout or archive, for example `SHARED_COMBAT_BASELINE_ROOT=/path/to/accepted-main node --test tests/battle-combat-baseline-differential.test.js`. It checks the fixed kernel and adapter hashes before loading that source. Without the variable, both focused qualification tests report an explicit skip naming the required environment variable; ordinary test discovery does not silently depend on a deep clone.

The differential harness fences accepted-main and extracted source with SHA-256 hashes:

| Source | SHA-256 |
| --- | --- |
| accepted `src/sim/battle-continuation-kernel.js` | `115c43146f5818c69a98120e856ddaa5d20243fced3609320d90edc7ae933bea` |
| accepted `src/sim/battle-combat.js` | `a9adf0d16359077bd0453cf2b8716e817d0a47c78073cde25a8b44a0c4ce3922` |
| accepted `src/sim/game-session.js` | `a11f43213632bcd7be3d4945846cf5dcbfaeaf4b961a32c420c590f67519daa1` |
| accepted `src/sim/live-battle.js` | `208186e8d90ba1501f563f55d42f2bb5ec5da1daaea46b96ef41c74b1a48da2a` |
| candidate `src/sim/battle-combat-runtime.js` | `cdb0e1405ddd0a768e1f79de9266dcf4da764f7c063f61d8bc05e8935b84e1f8` |
| candidate `src/sim/opaque-continuation.js` | `ca24764235cde41107e67aa8e18f1fcc09e9db9a126df0e9e68e0a53d2ab7991` |

The harness compares the accepted public combat facade with the candidate, verifies the untouched registration slice, exercises hostile/cross-factory continuation handles, iterates all current session-troop projectile receipt profiles, and compares pending-projectile restore cuts, LiveBattle.fork(), replay bytes, and tower/session serialization.

The exclusive Aether runtime window was still held during this builder pass. No Node, npm, browser, build, or test command was run; the differential harness and shipping gates remain for the critic to execute.
