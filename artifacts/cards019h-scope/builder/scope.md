# CARDS-019H source and mechanic scope

## Recommendation

Keep full CARDS-019H at QUESTION until source or footage resolves the projectile's movement and contact details. Split the work into a source-flag integration slice (H1) and a historical calibration slice (H2). H1 is blocked on CARDS-019K reaching PASS. H1 may then be built in the shared battle engine; its completion must not be reported as full homing parity or used to move CARDS-019H to PASS.

### H1 — shared source-flag integration

Judge only this bounded behavior: the admitted pinned `homing: true` fact selects the shared-host homing path; a launched projectile retains the selected target identity and follows that entity's live position during deterministic integer-tick motion. A target that moves after launch must change the projectile's path/contact compared with the existing locked-impact-point path. A pending projectile must restore and fork with identical state, events, and bytes through the same later target motion and contact.

For execution before calibration, every policy needed to make that behavior concrete remains a separately named, explicitly unverified runtime QUESTION: pursuit speed/conversion; per-tick direction update and integer rounding; whether the launch target remains locked or can be reacquired; behavior when it dies; behavior when it moves beyond range or arena bounds; contact radius and center; intermediate collision/obstruction rules and eligible target layers; exact arrival boundary and ordering relative to troop movement and other contacts; and whether source death affects a projectile already launched. The raw homing flag supports tracking at the broad behavior level, but it supplies none of these details. Do not infer that an H1 policy has been historically calibrated.

H1 should carry the source flag from the existing ordinary-projectile admission/profile boundary into `LiveBattle`/`BattleCombat`, where projectile motion, contact, damage, and pending state are already owned. Keep the movement implementation shared there; do not add a card-private simulator or make the reducer in `session-troop-projectile-runtime.js` an owner of projectile movement. Preserve existing projectile identities and leave new optional motion fields absent from legacy/non-homing projectile records where possible.

Focused H1 verification belongs in `tests/game-roster-troops-projectile.test.js` and the profile/source receipt suite:

- Launch at a selected unit, move that unit on later boundaries, and assert the projectile follows the same live target ID and produces the declared QUESTION-policy contact rather than striking the launch-time point.
- Snapshot/restore and fork while that projectile is pending; apply identical target motion to direct, restored, and forked continuations; require exact state, event/replay, and serialization equality and exactly one contact.
- Exercise a target death and a target moving beyond its original range/bounds under explicit, named QUESTION policies. These tests establish deterministic behavior of the selected runtime model; they do not establish which outcome matches the historical game.
- Verify raw `homing: true` and its pinned provenance are admitted as a source fact while the operational motion policies remain `authoritative: false`, `confidence: unverified`, and `disposition: question`.
- Compare the old eight-card setup/session/replay hashes at seeds 0 and 23. The current CARDS-019K baseline and candidate receipts match at setup, initial state, tick 120, and tick 240; retain those values from `artifacts/cards019k-scope/builder/verification/default8-baseline.out` and `default8-candidate.out`.

### H2 — historical calibration

Collect evidence sufficient to resolve each H1 runtime QUESTION separately, then verify those rules against the reference footage or a stronger pinned source. Required questions are: the unit and conversion of raw projectile `speed`; pursuit cadence/turning and coordinate rounding; fixed-target tracking versus reacquisition/retargeting; launched-projectile behavior after target death, source death, or target leaving range/bounds; target and area contact geometry/center/layers; intermediate collision and obstruction behavior; and exact impact tick and event order relative to movement, simultaneous projectiles, damage, and death. Only H2 can close full CARDS-019H and support a historical homing-parity claim.

## Pinned source and confidence

The source is RoyaleAPI `cr-api-data` commit `54fdef52c5086393b085f57faeeab8ef86b28160`, the 2023-02-18 snapshot identified by `reference/stats/SOURCES.md`.

- Character row: [`cards_stats_characters.json`, Wizard, lines 5362–5404](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L5362-L5404). The row links `projectile: "chr_wizardProjectile"`, has `multiple_projectiles: 0`, `multiple_targets: 0`, `range: 5500`, `attacks_ground: true`, `attacks_air: true`, and `area_damage_radius: 0`. The character's `damage: 0` is not projectile damage.
- Linked projectile row: [`cards_stats_projectile.json`, `chr_wizardProjectile`, lines 998–1039](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json#L998-L1039). It has `speed: 600`, `homing: true`, `damage_per_level[8]: 281`, `radius: 1500`, `aoe_to_air: true`, `aoe_to_ground: true`, and `only_enemies: true`. It also records `hit_effect_at_projectile: false`, `check_collisions: false`, `target_to_edge: false`, and `height_from_target_radius: false`. Those are raw field values; the source ledger does not define their runtime semantics.
- The character source-file SHA-256 receipt recorded in the prior scope is `37734d1508584e43851395c01b2d10046667eb6dc27daef37e5df56e74f933ac`. The projectile file SHA-256 is `c883516f54f6c17ee77c15cf484b01da9ded22602214c3b0d42b1ab823bd3197`; the existing receipt binds it to the pinned commit and raw URI in `src/shared/ordinary-projectile-delivery-authority.js`.

`reference/stats/SOURCES.md` describes the character datamine as medium-high historically and requires per-card confidence checks; it says raw distances are thousandths of a tile and raw times milliseconds, but does not define projectile-speed units. The normalized Wizard comparison row in `reference/stats/cards.json` has `area_damage_radius_tiles: null`; it does not establish how the character's raw zero and linked projectile radius 1500 should be interpreted together. The Wizard row's unverified fields include HP, damage, hit timing, deploy time, range, sight, movement, targets, and count. Treat the raw linked-projectile values as pinned evidence, while preserving uncorroborated mapping and runtime policy as QUESTION.

The current runtime already preserves the distinction between raw source and estimates. `getOrdinaryProjectileSplashSourceFacts` records `homing: true` and `speedRaw: 600`; `session-troop-source-confidence-authority.js` exposes these as source-linked question fields. `session-troop-roster.js` supplies `projectileSpeed: 500` as a `runtime-playability-estimate-not-comparison-corpus` question value. Do not convert raw 600 to 500 millitiles/tick or promote the estimate.

## Existing runtime and reuse boundary

`LiveBattle` advances troop positions before the combat boundary (`src/sim/battle-continuation-kernel.js`, around lines 8170–8187). The shared `BattleCombat` projectile path then computes a fixed duration from launch-time positions (`travelTicks`, around lines 2170–2191), stores `origin`, `targetId`, `targetPosition`, `speed`, and `impactTick` at launch (around lines 2993–3027), and resolves only at that scheduled tick (around lines 2988–2991). Ordinary splash uses the stored `targetPosition` as impact center (around lines 3123–3141). This is the locked-point gap H1 addresses.

Pending projectiles are part of `BattleCombat` continuation state and are copied by its runtime fork; restore reconstructs state by replaying its causal history/transcript. `GameSession.restore` also replays its session transcript. H1 therefore needs any mutable projectile motion state to be included in the shared engine's continuation and validation, not hidden in the question recorder.

No existing shared homing solver was found. `src/sim/projectile.js` explicitly models static launch-time geometry and says moving/homing targets are not modeled. The reflection fixture has an integer per-tick straight-flight helper, but its `movingTargetRule` is explicitly `launch-time-position-snapshots` as a QUESTION. It is not a source for homing behavior. The source confidence and card profile already retain the raw homing flag, so the minimal source integration should extend that admitted profile into the shared engine rather than create another combat authority.
