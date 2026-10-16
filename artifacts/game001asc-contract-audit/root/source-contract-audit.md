# GAME-001ASC snapshot/source-vintage boundary audit

Audit basis: committed HEAD 68b20a7a26e6bee336a5c7842844c90a139347f1 only; dirty worktree ignored. File-only; no runtime or edits.

## Finding

The code supports selected historical snapshot envelope versions, but validates the embedded setup against the current source-confidence/admission contract. It does not implement source-vintage migration. The committed docs explicitly promise RL wrapper version-2 checkpoint restoration and explicitly reject wrapper version 1; they do not state that a version-2 checkpoint remains restorable across source revisions. That leaves a contract ambiguity, not a demonstrated implementation defect.

LiveBattle.restore has explicit shape branches for versions 1–38 (src/sim/battle-continuation-kernel.js:7559-7693). Before replay, every version goes through checkedSetup; only legacy structure receipts get an explicit version<=2 exception (7907-7911). The restored witnesses must be causal, and version >=2 must serialize byte-identically (7992-7998). Thus a recognized envelope version is not an admission bypass.

The outer GameSession serializer is version 2; restore accepts only version 2, recreates a session by validating its embedded setup, replays the transcript, and requires exact serialized equality (src/sim/battle-continuation-kernel.js:12429-12478, especially 12433-12443). validateSetup parses the embedded current battle setup and constructs LiveBattle (11962-12016); it does not use a source-vintage migration.

For cards in the current policy catalog, setup validation requires the policy to be present and checks its QUESTION key, field value, and source (src/sim/battle-continuation-kernel.js:5930-5952; src/shared/session-troop-source-confidence-authority.js:72-88, 252-277). Briar Band is one of those claims, and the interval is currently 100 ms / six ticks. The explicit hostile tests enforce missing/forged policy/provenance rejection (tests/game-roster-troops-air-swarms.test.js:266-294; tests/game-battle.test.js:341-355).

The packet committed at artifacts/gtc-diagnostic-packet-20261016/README.md records current public restore rejection of the exact c9 LiveBattle v2 bytes and six 2a GameSession v2 snapshots: each fails because the old embedded Briar setup lacks the now-required policy. None restored, so no equality/continuation promise was demonstrated. Its historical a8 gate failed independently, so that old gate is not evidence of successful old API compatibility. The same packet shows the status replay hashes match while full session states differ: stagger changes spawn times, materialized IDs, targets, positions, and movement/attack timing. Session replay equality is not full battle-event/state equality. PLAN.md:344 already states that sourced Briar timing intentionally changes legacy physics/snapshot baseline.

## Promises and consumers

docs/rl-api.md:172-183 says RL serialize/restore use a privileged version-2 checkpoint and describe continued observations/actions; it explicitly says version 1 has no migration. docs/verification.md:22 repeats the RL version-1 rejection. Neither doc promises cross-source-revision archives for LiveBattle or GameSession; docs/rl-api.md:185-191 also disclaims historical parity.

RLEnvironment.restore requires its wrapper version 2, then delegates to GameSession.restore and checks setup/config equality (src/rl/environment.js:336-391). Browser session restores also route through GameSession.restore (src/ui/game-browser-entry.js:495; src/ui/game-browser-loop.js:585). Internal opponent/player restore paths use LiveBattle.restore on snapshots they just generated (src/sim/game-opponent.js:461; src/sim/game-player-deploy.js:255, 396, 499).

The existing legacy tests exercise envelope/runtime compatibility using current-compatible fixtures (tests/game-troop-runtime.test.js:446-467). The status hash test regenerates six current scenarios and pins replay/snapshot hashes (tests/game-roster-troops-status.test.js:874-923); its separate restore test restores snapshots generated in the same test run (925-948). These do not promise restoration of archived setup vintages. PLAN.md:229 frames GTC as golden mismatch diagnosis and prohibits blind refresh; it is not a migration contract.

## Bounded GAME-001ASC decision

No production migration should be inferred from these failures alone. The smallest evidence-supported next step is a contract decision and a short API-doc/test clarification:

1. State that supported envelope versions preserve canonical replay only when their embedded setup passes current admission and witness validation; historical source-vintage setup compatibility is not guaranteed. Retain the explicit RL v1 rejection.
2. Add one focused regression using an archived c9/2a snapshot (or a minimized fixture derived from its exact failing field) that asserts the current policy rejection, while retaining current-format serialize/restore tests. Keep the GTC hash diagnosis separate; do not refresh hashes until the intentional stagger state change and exact outputs are reviewed.

If the product instead requires source-vintage archives to survive, make that a separately versioned migration contract. Its bounded pass bar must name the historical pins/snapshots and require accepted restore plus deterministic post-restore state/event semantics, not just equal session replay or matching envelope version. It must preserve the current strict fresh-input/source-policy boundary; ignoring absent policies or adding the current six-tick policy to old setup cannot by itself recreate historical immediate-spawn semantics. The present evidence does not establish how such migration should behave.
