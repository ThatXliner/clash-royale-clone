# Full linked melee-area signature scope

## Result and evidence boundary

The complete pinned signature for comparison card `26000011` resolves to exactly three rows: one card row (9 fields), one troop-deployment row (81 fields), and one summoned-character row (289 fields). The exact extracted values, including every stored zero, `false`, and `null`, are in [pinned-linked-rows.json](pinned-linked-rows.json). The fetch-and-join query is reproducible with [extract_pinned_linked_signature.py](extract_pinned_linked_signature.py).

This is a raw datamine signature, not a claim that its values are authoritative behavior. The local [source ledger](../../../reference/stats/SOURCES.md) rates roster identity and cost highly, while character constants are medium-high as snapshot data and remain unverified per field. The local normalized record retains QUESTION flags for every combat field. This scope makes no full-role, gameplay-parity, or historical-calibration claim.

## Pinned source and hashes

All source URLs below address commit [`54fdef52c5086393b085f57faeeab8ef86b28160`](https://github.com/RoyaleAPI/cr-api-data/commit/54fdef52c5086393b085f57faeeab8ef86b28160), dated **2023-02-18 11:25:16 UTC**. No live branch data was used. The rows came from the standalone source files; the combined `cards_stats.json` file was also fetched to verify its duplicate troop and character rows match exactly.

| Pinned source file | Rows / groups | Bytes | Git blob SHA | Raw SHA-256 |
| --- | ---: | ---: | --- | --- |
| [`cards.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards.json) | 112 | 41,785 | `9a26927d54fbf358138e10d2f5bb5519e6f8602e` | `312574f75ada2ff5ad605e1eb122c3b620d1163c5a675d67cd9e64122b3d6946` |
| [`cards_stats_troop.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json) | 93 | 261,572 | `2fc9257051c37521f0ca2ad4a1931686ef94842b` | `a6e044cb510ec280dacfd54e546558276e5f40d50fbd16f47f3ff16126add33a` |
| [`cards_stats_characters.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json) | 113 | 1,156,641 | `a86a93da5b27a27ae891cfa3c67b13b7f3b2080e` | `37734d1508584e43851395c01b2d10046667eb6dc27daef37e5df56e74f933ac` |
| [`cards_stats_projectile.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json) | 79 | 137,874 | `091987427e84379a4c1d0ebacc1ce1fecd2d0364` | `c883516f54f6c17ee77c15cf484b01da9ded22602214c3b0d42b1ab823bd3197` |
| [`cards_stats_character_buff.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_character_buff.json) | 38 | 75,549 | `68ce48cb8a2087f48f2d24d4a8a36cc210fd2e62` | `20da44c09a3e51c06b97291530f6b8fee909c57d2b5c7a7c64adf1721e0999f0` |
| [`cards_stats.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats.json) | 433 across 6 groups | 2,795,170 | `0098d94065703fdb81a7ee98255ce5652c358b5e` | `5a75c35e37b895a2c64223d4050f08008d8722531af248ac9fd251e9390f5e95` |

The combined groups are `troop` 93, `building` 62, `spell` 48, `projectile` 79, `characters` 113, and `character_buff` 38. The standalone `troop` and `character` matches equal the combined-file rows field-for-field. The scope contains only these three selected raw rows, not the upstream datasets.

## Link resolution

| Edge | Raw join | Result |
| --- | --- | --- |
| Card → troop | Unique `cards.json` row by `id=26000011`; unique troop row by matching `key`, independently matching `name` | One troop row. |
| Troop → character | Troop `summon_character="Valkyrie"`; character matches that `name`, the card `key`, and `id=26000011` | One character row. |
| Character row's `summon_character` | Its stored value is also `"Valkyrie"`; exact name/key/id join | Resolves to the same character row; no additional row. |
| Additional projectile, ability, passive, buff, spawn, death-spawn, charge, jump, or dash row | All relationship-like fields are preserved in the extracted rows and were checked against the pinned projectile and character-buff tables. | No additional non-null link resolved. No separate ability/passive table appears among the six `cards_stats.json` groups. |

The troop row stores `summon_number=0`, `summon_radius=0`, `summon_width=0`, `summon_deploy_delay=0`, and `summon_character_level_index=0`; `summon_character_second` is `null`. The normalized project record says count 1, but the raw zero-valued field is preserved here without treating zero as a literal unit count.

This reports only the stored fields and resolved rows in this snapshot. A `null`, zero, or `false` is not evidence that the live game had no hidden behavior. In particular, the character row stores `projectile=null` and `ability=null`; troop `hero_ability` and `passive_ability` are `null`. The raw rows also include null/zero/false spawn, death, buff, charge, jump, and dash fields, as well as `multiple_targets=0` and `all_targets_hit=false`. Do not assign a runtime meaning to those values by their field names alone.

## Nondefault mechanics fields and limits

The full row is the authority for which fields were actually present. The following is a human-oriented index of nondefault mechanics-shaped fields plus default-valued flags needed to understand the signature; it is not a consumer specification.

| Area | Stored raw values | What can be said | What remains open |
| --- | --- | --- | --- |
| Health and damage | `hitpoints=900`, `hitpoints_per_level[8]=1908`; `damage=126`, `damage_per_level[8]=267` | The source ledger maps Rare tournament level 11 to index 8. These are raw level-table values. | Per-value combat corroboration and damage behavior remain QUESTION. The level-11 damage entry does not define whether an area secondary receives the same amount. |
| Movement and deployment | `speed=60`, `walking_speed_tweak_percentage=0`, `deploy_time=1000`, `deploy_delay=0`, `load_time=1400` | The ledger maps speed 60 to 1 tile/s and raw time values to milliseconds; it maps `load_time` to the normalized 1.4-second first-hit reference. | The character deployment delay is zero in this row. No additional consumer meaning is established for zero-valued tweak/delay fields or for observed first contact. |
| Contact and body parameters | `range=1200`, `minimum_range=0`, `sight_range=5500`, `collision_radius=500`, `mass=5` | Under the source ledger's raw distance convention, the first three distances encode 1.2, 0, and 5.5 tiles; `collision_radius` is a raw 500 distance value. `mass` is the raw integer 5. | Center-versus-edge checks, collision use, targeting use, formation effects, mass units, and mass behavior are unresolved. Do not substitute `collision_radius` for an inferred runtime body radius. |
| Area and target flags | `area_damage_radius=2000`, `self_as_aoe_center=true`, `attacks_ground=true`, `attacks_air=false`; direct target flags `building_target=false`, `target_only_buildings=false`, `target_only_king_tower=false`, `target_only_towers=false`, `target_only_troops=false` | The source convention encodes the raw distances as 2.0 and 1.2 tiles. The direct-attack target flags are stored as shown. | Effective area center, shape, edge inclusion, collision compensation, splash target layers, and structure/tower eligibility are not established. Direct attack flags do not settle area target layers. |
| Cap, order, and attack timing | `multiple_targets=0`, `all_targets_hit=false`, `attack_sequence=0`, `attack_state_count=0`, `attack_state_damage=0`, `retarget_after_attack=false`, `retarget_each_tick=false`, `load_after_retarget=false`; `override_attack_finish_time=true`, `attack_finish_time=100` | The source time convention encodes `attack_finish_time` as 100 ms; `hit_speed=1500` and `load_time=1400` are also stored in milliseconds. | Target cap, ordering, secondary-hit inclusion, retarget semantics, and attack-finish timing behavior are opaque here. A zero/false value is not interpreted as unlimited, excluded, or disabled behavior. |
| Other nondefault parameters | `projectile_start_radius=450`, `projectile_start_z=450`, `scale=140` | These values are present even though the character's `projectile` link is null. | Do not infer a projectile, AoE origin, collision, or visual scale consumer from these field names. |

The prior 30-field extract omitted `collision_radius`, `mass`, `attack_finish_time`, `override_attack_finish_time`, `projectile_start_radius`, `projectile_start_z`, and other stored defaults. The complete 289-field character row closes that extraction gap. The local 2019 Supercell audit still records an unresolved radius conflict: its dated note says 2.4 tiles, while this pinned 2023 row encodes 2,000. Retain both as conflicting evidence; neither selects the calibrated pre-cutoff runtime radius. See [the existing source audit](../../../reference/research/melee-splash-source-audit.md).

## Provisional shared-core seam

A generic melee-area contact slice can proceed as an explicitly versioned executable QUESTION policy, separate from card admission and historical calibration. Put a `MeleeAreaContact` reducer at the shared melee attack-resolution seam, not in projectile flight/impact. The policy should be an explicit input to the reducer, and the resulting target set, order, and policy version should be captured in the serialized attack event so replay and restore reproduce the same resolution. Deduplicate the primary target so an attack cannot accidentally apply its direct hit twice.

One workable local `melee-area-question-v1` fixture policy is an attacker-centered circular check at radius 2,000 milli-tiles, ground troop targets, one base hit per covered entity, and stable entity-id ordering. Treat every choice in that sentence as executable local behavior only: the raw center flag is a lead rather than its recovered meaning; 2.0 conflicts with the 2019 official 2.4 value; area layers, cap, secondary damage, target geometry, primary inclusion, ordering, and building/tower behavior remain unresolved. A clustered-ground fixture can place the selected target within 0.5 tile of the attacker and another ground target almost on top of it, making a qualitative secondary-contact test insensitive to the disputed center and either candidate radius. It must assert only nonzero secondary damage and deterministic replay/restore.

Keep the policy fields independently replaceable so later capture/source work can resolve center, radius, shape/boundary, area target layers, secondary damage/falloff, target cap, ordering, primary deduplication, structures/towers, and timing. The next source-backed step is full-role calibration with evidence for those choices; this scope does not admit the comparison identity, add art, or count a historical execution.

No product code, reference files, tests, builds, or gameplay runs were changed or executed. The only new files are this builder-scope artifact and its raw-row/query receipts.
