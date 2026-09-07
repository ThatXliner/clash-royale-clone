# Tick 9600 presentation profile

The fixture replays the exact GH seed-zero setup and accepted transport commands from continuation-9600-failure.json, deduplicated by tick. The fixture is a canonical GameSession serialized snapshot; Chrome restores it through the real implementation before measurement.

Commands:

- `node artifacts/game-001gp-presentation-profile/fixture.mjs` regenerates fixture.json.
- `node artifacts/game-001gp-presentation-profile/profile.mjs` profiles the production modules.
- `PROFILE_FAST=1 node artifacts/game-001gp-presentation-profile/profile.mjs` profiles the two-file diagnostic transformation served by server.mjs. No production files are changed.

The first measured production run: cold total60.3ms (frame58.5/project1.8), warm total44.9–50.0ms (frame44.5–49.6/project0.4–0.9). The exact observed50ms symptom is reproduced, albeit strongest on the cold presentation. Full endurance evidence also records repeated51ms tasks at late presentation cadence. The harness now asserts each presentation takes at most50ms; raw results and CPU profiles retain the first measured run. Setup requires deterministic9600-tick restoration (~one minute); measured loop itself takes seconds.

CPU samples: createGameUiFrame1317.4ms; createCombatEffectsViewModel792.5ms (60%), of which validateCombatEffectFeed768.3ms; projectionSnapshot274.8ms (21%); composeGameUiFrame113.6ms (9%). Full historic feed lifecycle/schema/byte validation dominates.

Diagnostic transformation: snapshotFromState creates the same deep cloned/frozen snapshot then adds its root to a module-private WeakSet. validateCombatEffectFeed returns that exact root directly on WeakSet membership; every other input retains original validation. GameSession.projectionSnapshot retains this feed snapshot instead of cloning it (which destroys membership). The producer's live state remains detached: snapshotFromState still clones all records and recursively freezes all descendants. Restored feeds are branded only after existing full admission. No cache is keyed on tick or user fields, and live feed API behavior is unchanged.

Measured transformed run: cold total28.5ms (frame26.4/project2.1); warm total15.7–20.7ms (frame15.4–20.3).30 presentations in both runs. This supports the minimal two-file implementation scope. It does not claim full18000-tick endurance verification or final production test acceptance.

Implemented production rerun after integrating initial motion polish: all30 measured presentations pass50ms. Cold28.7ms; warm16.5–21.9ms. The latest result.json/cpu.json now represent this implemented run, while result-fast.json/cpu-fast.json retain the diagnostic transformation. Source change preserves the validated snapshot's detached frozen data and external admission path. Full endurance is the remaining acceptance gate.
