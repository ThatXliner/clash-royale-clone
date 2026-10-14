# Shared melee-area contact foundation

## Finding

The smallest real gap is the direct-melee branch in the shared combat host. At accepted source `108dc70382d62a88854c0b65dbfd1493dbac8b2e`, `BattleCombat.#advance` acquires one target and attack sequence, then queues exactly one unit hit or emits exactly one external structure contact. The separate projectile-area reducer runs only when a projectile is due. A melee attack cannot reach it without inventing a projectile. `AreaDamageSystem` already offers deterministic geometry and target ordering, but it owns a separate health store and is used by isolated effect/building reducers; putting melee hits there would create a second combat authority.

Recommended seam: a small pure area-victim selector shared by the existing projectile splash planner and the direct-melee attack branch. The host still owns attack readiness, primary hit, health, event ordering, and unit deaths. For an explicitly opted-in melee attack, keep the existing primary direct hit once, select only distinct secondary victims, append those hits to the host's existing simultaneous damage batch, and let the current host process contacts. This is shared `BattleCombat` behavior used under `BattleTowerCombat`/`LiveBattle`/`GameSession`, not a parallel simulator or new card entry.

## Narrow provisional policy

Any first executable fixture should use an exact, versioned non-authoritative record such as `melee-area-question-v1`; its values are local runtime choices with `confidence: "question"` and `authoritative: false`. A workable bounded test policy is:

- center: attacker position; shape: circle; boundary: inclusive circle overlap using `spatial.circlesOverlap`;
- radius: 2,000 millitiles as a provisional fixture value, not historical calibration; the pinned row has 2,000 while the dated 2019 publisher note says 2.4 tiles;
- secondaries: live, targetable enemy ground troops only; no building or crown-tower secondary contacts in this first slice;
- primary: preserve the normal direct hit and exclude its entity ID from secondary selection;
- secondary damage: one base attack amount per selected victim, with this rule itself marked QUESTION; select all eligible victims within the shared host's existing bounded unit set;
- deterministic order: ascending entity ID; apply unit hits in the existing simultaneous damage window.

These are separable fields, not a reconstructed game rule. Tests should avoid the disputed edge: place the primary within 0.5 tile of the attacker and another enemy ground unit nearly on top of it. Assert one primary hit, one positive secondary hit, no duplicate IDs, enemy/live/targetable/layer filtering, stable secondary ordering, and byte-identical replay/restore/fork. Do not assert an exact radius edge, equal secondary damage as a historical fact, or structure/tower behavior. The fixture can test the explicit local policy without adding a playable identity or changing card admission.

For implementation, the narrow candidate ownership is the shared kernel plus a pure `src/sim/area-target-selection.js` helper and a closed, versioned QUESTION policy/profile record if the setup path needs to bind it. Use the helper in projectile splash without changing its current result ordering or default behavior. Keep the optional melee-area field absent on all existing units. Avoid editing card catalogs, editable choices, RL admission, artwork, or manifests in this foundation.

## Causal behavior and tests

`BattleCombat` already records each boundary command in history, includes setup plus canonical history/transcript in its snapshot, replays operations on restore, and rejects a snapshot unless replay regenerates the exact canonical serialization. `BattleTowerCombat` previews and commits the same `external-structure-contact` records so crown-tower health stays in its one existing authority; `LiveBattle` consumes `building:*` contacts into structure health once. Keep the policy/version in the authenticated setup receipt and derive area victims from the same boundary state. Do not persist an unauthenticated victim list or apply health from an effect observer.

The smallest meaningful test set should execute the actual shared `BattleCombat` attack boundary with a canonical test policy: clustered primary plus secondary, primary de-duplication, same-side/dead/untargetable/air exclusions, reversed candidate input with ascending-ID output, and direct-melee legacy setup/replay bytes unchanged when the optional policy is absent. Cut immediately before impact, then compare actual boundary events, health, replay, serialized bytes, and a fork after continuation. Reject missing/unknown policy versions and changed Q fields on restore. A later card-admission piece can add the real `GameSession`/deck journey only after it has an independently sourced local identity; that later execution must not be backfilled into historical card coverage.

## What the current evidence supports

The pinned comparison signature is complete in `pinned-linked-rows.json`: one card row (9 fields), troop row (81), and character row (289), linked from the pinned 2023-02-18 commit. Preserve the full row verbatim, including `self_as_aoe_center`, `mass`, `collision_radius`, `override_attack_finish_time`, and `attack_finish_time`; the earlier 30-field extract is incomplete. The pinned row proves those raw values/flags were present, not their runtime meaning.

`SOURCES.md` rates roster identity and cost high, but character combat constants medium-high only as a datamine snapshot and requires field-level corroboration. The dated note and pinned card description support the qualitative role of area melee damage. They do not settle effective center, the 2.0-versus-2.4 radius conflict, circle/edge/body-radius semantics, splash target layers, secondary damage/falloff, cap/order, tower/building eligibility, or attack-finish timing. `attacks_ground=true` and `attacks_air=false` describe the stored direct attack flags here; they do not establish splash layers. `collision_radius=500` is not a proven runtime body-radius value, and `mass=5` is not a collision/formation rule. `multiple_targets=0` and `all_targets_hit=false` remain opaque. The raw row has `projectile=null`; nonzero projectile-start fields do not prove a projectile link.

Thus a shared deterministic contact foundation is actionable, but neither that runtime estimate nor the raw row alone admits a full role or establishes historical parity. Full-role work still needs a reviewed consumer disposition for relevant fields in the complete signature and calibration for the listed contact policies. Keep the new runtime tests and counts separate from the 109-card historical-execution goal.

## Source-path evidence

The exact accepted source hashes, paths, line ranges, and queries are recorded in [source-evidence.json](source-evidence.json). The previous `remaining-goal-scope-1413220/scope.md` is useful for the gap framing, but its statement that only a 30-field melee extract exists is stale relative to this accepted HEAD: the newer full-signature artifact now contains the linked 289-field character row.

This is a read-only scope proposal, not an implementation or independent critique. No production source, tests, PLAN/progress, card admission, reference data, or gameplay artifacts were changed or run.
