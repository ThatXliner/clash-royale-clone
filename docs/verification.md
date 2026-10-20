# Verification evidence

## Published state

Release update on 2026-10-13: this snapshot includes the reviewed five-squad timing correction, an adaptive endurance workload, and the Ember Basin defensive structure. The live deployment is published through the manually dispatched [Pages workflow](https://github.com/ThatXliner/clash-royale-clone/actions/workflows/pages.yml); the landing page links its exact deployed source commit.
The published editable-deck picker has 19 choices: 17 troop choices, Squall Orb, and Ember Basin. It includes both added air swarms, Gloamwing Cluster and Coppershade Flock. The [live-source receipt](../artifacts/ship-current-round-2/builder/evidence.md) records the Pages API result, served app bundle, roster IDs, and hashes.

The editable integration for both air swarms passed independent review at `a8c39bcc`: 58/58 tests, including browser deployments, Coppershade's airborne projectile, and exact restore/replay. The later stagger review accepted the source-backed relative member interval at `796708ef622a0292cdd71fa4cf0a81c9af48b3b1`: 100 ms, or six simulation ticks, between successive members. This does not establish first-member onset, formation geometry, or historical member order; those remain questions. See the [stagger review](../artifacts/cards016-stagger-round-2/critic/verdict.md) and [air-swarm source audit](../reference/research/air-swarm-formation-source-audit.md).

## Retained endurance proof

The strict 18,000-tick Chrome run was performed on the exact `796708ef` candidate. TAP passed 2/2; the seed-zero, default-eight workload reached tick 18,000, then restarted at tick 0. It took 811,580 ms for the main workload. Initialization peaked at 197 ms under the 300 ms cap; no non-initialization long tasks were recorded under the unchanged 50 ms cap. Restore, terminal audio, restart, and resource/error checks passed. The [endurance verdict](../artifacts/game001gpr4-round-1/critic/verdict.md) and [captured run output](../artifacts/game001gpr4-round-1/critic/full-endurance.tap) contain the detailed telemetry.

That retained run covers the earlier runtime. It does not cover the five-squad timing correction in this release.

## Current release and pending work

The five-squad relative spawn interval correction passed independent review with 74/74 checks, including integration audit, determinism and shipping guards. See the [review evidence](../artifacts/cards017-stagger-round-2/critic/verdict.md).

The adaptive default-eight workload passed a strict 18,000-tick Chrome run on `5ba4002`: TAP 2/2, initialization 197 ms, and no non-initialization long tasks above the unchanged 50 ms cap. Restore, terminal cleanup and restart passed. See the [independent verdict](../artifacts/game001gpr5-round-3/critic/verdict.md). This supersedes the earlier workload shortfall at tick 13,352. The shipped `9f64011` presentation then passed its own strict 18,000-tick run: TAP 2/2, initialization 158 ms, and no measured non-initialization long tasks above the unchanged 50 ms cap. Restore, terminal and restart passed; see the [fresh verdict](../artifacts/game001gpr6-round-1/critic/verdict.md). These runs cover the default-eight workload, not every custom deck or later runtime changes. Pause/resume adds transcript records; the checked byte parity is between browser and direct sessions after both calls.

The JS/RL environment is version 2, with structure observations and an
executable mixed-deck example.
The RL wrapper rejects version-1 checkpoints.
A checkpoint's envelope version is necessary but not sufficient for restore.
`LiveBattle.restore()` and `GameSession.restore()` validate embedded setup
against current card admission and source-confidence policy, then validate
causal witnesses. A historical checkpoint can fail if its setup lacks a
policy required by the current engine. This project has no source-vintage
migration. A checkpoint that parses under another engine revision does not
prove that it behaves the same.
Keep the engine commit with each RL checkpoint for reproducibility. The [API
review](../artifacts/cards018-core-round-3/critic/verdict.md) records the
tested wrapper behavior.
Ember Basin's low-confidence profile values remain explicit questions. This release does not establish historical card parity.

First-member onset, Briar Band's historical formation geometry and internal order, and other low-confidence troop values remain unresolved.

Other card statistics, formations, and arena mechanics remain estimates or explicit `QUESTION`s. The [completion inventory](completion-inventory.md) tracks their scope. Earlier [restore paint-probe evidence](../artifacts/vis-003hr-round-2/debug/paint-probes.md) remains a separate result. This document makes no claim of full historical Clash Royale parity or complete roster coverage.
