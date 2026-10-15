# Emberlance → Prince: full linked raw-signature scope

## Decision

The positive test-only binding already exists. [`tests/special-movement-charge.test.js`](../../../tests/special-movement-charge.test.js#L39) restricts its comparator to corpus `key=prince` at line 42, then calls `parity(createChargeSpecialCatalog()[0], "prince")` at line 188. Its assertions expect four ordinary matches (`cost`, `kind`, `rarity`, `areaDamageRadiusMillitiles`), ten question-backed matches, and no authoritative failures. Those are existing source assertions; this packet did not run the test.

That comparison does not admit a second runtime card. The local identity is the existing original name and ID `Emberlance` / `emberlance`. The shared troop profile lists `createChargeSpecialCatalog` and `createChargeKnockbackCatalog` as two occurrences of that one ID. The movement profile likewise has one Emberlance profile with two memberships and marks runtime integration `pending-shared-host`; its composition mode is membership-only. `GAME-001HTEC` remains `BLOCKED` in [`PLAN.md`](../../../PLAN.md#L228). This packet therefore establishes raw-source closure for the selected Prince signature, not complete historical mechanics or full unique-card admission.

## Pinned source and exact joins

The extraction is pinned to RoyaleAPI `cr-api-data` commit [`54fdef52c5086393b085f57faeeab8ef86b28160`](https://github.com/RoyaleAPI/cr-api-data/commit/54fdef52c5086393b085f57faeeab8ef86b28160), dated 2023-02-18. The local provenance and confidence rules are in [`reference/stats/SOURCES.md`](../../../reference/stats/SOURCES.md). The extractor fetched seven pinned JSON tables in memory, retained only selected rows and exact duplicate rows, and recorded each raw URL, source byte count, SHA-256, Git blob SHA-1, row count, extractor hash, and output hash in [`source-receipts.json`](source-receipts.json).

The joins use the explicit comparator selector first, then source key/name/rarity relationships. The selected rows each had exactly one match:

| Row | Exact selector | Matches | Ordered fields |
| --- | --- | ---: | ---: |
| Roster | `cards.json key=prince` | 1 | 9 |
| Rarity | `rarities.json name=Epic` | 1 | 48 |
| Troop | `key=prince`, `name_en=Prince`, `rarity=Epic`, `not_visible=false` | 1 | 81 |
| Character | `key=prince`, `id=26000016`, `name=Prince`, `rarity=Epic` | 1 | 289 |

The primary ordered-field total is **427**. The corresponding standalone and combined `cards_stats.json` troop and character rows are also retained and compare exactly, adding duplicate rows of 81 and 289 fields. [`pinned-linked-rows.json`](pinned-linked-rows.json) preserves the full source field order, arrays, categorical values, strings, nulls, false values, zero values, and row indexes.

The troop and character both store `summon_character="Prince"`; each name joins to the selected character once. Their `summon_number=0` and other summon fields remain literal. The name join is not treated as a recursive spawn edge or proof of a spawn count. The selected troop/character rows have no non-null projectile-name, buff-name, ability-name, or character spawn link, so no projectile, buff, ability, or spawn row was selected. The projectile and character-buff tables were screened in memory; no artwork or effect asset was fetched. The character's `damage_effect_special="prince_charge_hit"` is retained as a raw effect-name field without resolving or fetching an asset.

## Normalized comparison and confidence

The existing comparator maps the 14 fields listed in [`comparator-field-map.tsv`](comparator-field-map.tsv). The roster identity, cost, rarity, and type fields are rated high in `SOURCES.md`. The remaining 10 compared fields are question-backed by the current normalized Prince record's `unverified_fields`: HP, damage, hit speed, first-hit timing, deploy timing, range, sight range, movement speed, target mode, and count. The corpus-level troop/character constants are medium-high as a datamine snapshot, but that group rating does not override per-card unverified flags.

The selected raw character row contains `hitpoints_per_level[5]=1920` and `damage_per_level[5]=392`; the Epic rarity row has `tournament_level_index=5`. It also stores base `hitpoints=1200`, `damage=245`, `hit_speed=1400`, `load_time=900`, `deploy_time=1000`, `range=1600`, `sight_range=5500`, `speed=60`, `attacks_ground=true`, and `attacks_air=false`. The existing comparator and source ledger do not independently certify those per-card historical values.

The raw ability-related values are kept distinct: `charge_range=300`, `charge_speed_multiplier=200`, `damage_special=490`, and `damage_per_level[5]=392`. The current plan describes the cutoff as a 3.0-tile charge range, 2× speed, and 392 bonus damage; it also records that the 3.5-tile fixture conflicts with that interpretation. This packet preserves both the raw values and that existing plan statement. It does not infer units or edge behavior from `charge_range=300`, scale `damage_special=490` by the Epic array index, or equate `damage_special` with the fixture's charged damage. The special-damage level-scaling rule and its composition with base damage remain unresolved here.

The raw `area_damage_radius=0` is preserved alongside normalized `area_damage_radius_tiles=null`; the comparator's null match does not define zero-to-null semantics. The raw `summon_number=0` is not converted to normalized count 1. No zero, false, or null sentinel in this packet is promoted to “absent,” “unlimited,” or another game rule.

## Raw field consumers and current QUESTION boundary

[`field-consumer-disposition.tsv`](field-consumer-disposition.tsv) gives every one of the 427 primary fields its source order, exact JSON value, value class, and a bounded consumer or disposition. It distinguishes normalized base-combat candidates from raw special fields, including charge arming, cancellation/reset, charged movement, damage, deploy/load timing, retargeting, attack finish, collision and mass, walking-speed tweaks, delivery links, spawning, abilities, and knockback composition. Unmapped fields remain preserved without invented consumers.

The current isolated fixtures still mark `armDistanceMillitiles=3500`, `bonusDamage=392`, and `chargedMovementMillitilesPerSecond=2000` as non-authoritative QUESTION values. [`question-dispositions.tsv`](question-dispositions.tsv) also records all 24 current charge/knockback/retarget composition values, including charge consumption and reset, target loss/reacquisition, cancellation, sight/attack boundaries, forced displacement, movement and attack ordering, and target policy. They remain `authoritative=false`, `confidence=unverified`, and `disposition=question` in the source snapshot.

Several raw fields matter to those open questions but do not close them: `retarget_each_tick=false`, `retarget_after_attack=false`, `load_after_retarget=false`; `override_attack_finish_time=false`, `attack_finish_time=0`; `collision_radius=600`, `mass=6`; `walking_speed_tweak_percentage=0`; and `ignore_pushback=true` with zero-valued pushback fields. The current isolated charge/knockback fixtures use zero radii and do not have a source-backed mapping from raw mass, collision, walking-tweak, or pushback values to shared-session movement. The raw projectile and effect-link fields do not identify a linked projectile row or establish delivery behavior.

## Duplicate and new-card accounting

The bounded test/source scan has one explicit Prince comparator selector and one comparator call. The `Prince` and `Dark Prince` strings in [`special-movement-charge-knockback.test.js`](../../../tests/special-movement-charge-knockback.test.js#L808) are protected-name checks that prevent those names from appearing in the shipped module; they are not parity bindings. `Dark Prince` has no binding in the scanned tests/source.

Other duplicate mappings were checked before counting: the old Knight source key is used by Mossguard's basic-melee comparator and Wayfinder's test-only retarget comparator, so that is one historical source key used in two isolated fixtures. Emberlance has two source exports under one local ID, and Aegis Sage is the other duplicate composition ID in the profile contract. These duplicate occurrences are not additional unique IDs. Prince's one existing comparator therefore produces **zero new unique runtime IDs** in this packet. Full unique-card admission is not established by membership or parity alone.

## Next action and scope boundary

For Emberlance, keep `GAME-001HTEC` blocked until one source-backed receipt and one shared-session execution define and verify the charge phase, exact arming boundary, cancellation/reset behavior, charged movement, special-damage scaling/application, retarget and load resets, attack/contact ordering, knockback composition, and serialized phase state. In particular, reconcile the raw `charge_range=300`, the plan's 3.0-tile interpretation, and the existing 3500-millitile QUESTION fixture without elevating confidence from this packet alone.

If the goal is another unique classic admission, this scan does not identify one: Prince already has its explicit test-only binding to the occupied Emberlance ID, while Dark Prince appears only in a protected-name scan here. A next candidate needs its own explicit comparator binding, a distinct original runtime identity, a unique source/profile occurrence, and a shared-session admission path. This packet does not choose or certify that candidate.

Only the artifact packet under `artifacts/emberlance-prince-full-raw-scope/builder/` changed in this checkout. No tests, build, browser, gameplay, screenshots, or artwork/source-asset fetch were run. The extractor did not retain whole upstream files and did not modify product code, tests, `PLAN.md`, or `reference/`.
