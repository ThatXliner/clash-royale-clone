# Wayfinder → Knight: full linked raw-signature scope

## Decision

The positive test-only binding already exists. [`tests/special-movement-retarget.test.js`](../../../tests/special-movement-retarget.test.js#L187) explicitly says Wayfinder is original and Knight is its test-only corpus mapping, selects `corpus.cards.find(({ key }) => key === "knight")`, asserts the full Wayfinder definition, and compares its 14 mapped fields (lines 187–257). This packet starts from that selector; the binding is not inferred from either name or numeric-ID equality. No new mapping or test is proposed.

The bounded pinned raw signature is closed for the rows and links reachable from that comparator: one roster card (9 fields), one Common rarity row (46), one visible troop row (81), and one Knight character row (289). The exact ordered rows, every stored null/false/zero, and field indexes are in [pinned-linked-rows.json](pinned-linked-rows.json); [extract_knight_signature.py](extract_knight_signature.py) reproduces the selection. The two selected stats rows equal their corresponding `cards_stats.json` groups field-for-field. The query also screened the pinned projectile and character-buff tables; neither yielded a linked projectile or a non-null string buff link.

There is also a separate pre-existing `Mossguard` → `knight` mapping in [`tests/cards-basic-melee.test.js`](../../../tests/cards-basic-melee.test.js#L20); it judges a different ordinary-melee slice. The Wayfinder comparator is another explicit test-only use of the same comparison record, not a unique identity claim or additional full-roster admission.

This is raw-field closure, not complete historical mechanics or source-confidence closure. [`reference/stats/SOURCES.md`](../../../reference/stats/SOURCES.md) rates roster identity/cost/rarity/type high and the pinned troop/character constants medium-high as a datamine snapshot, but leaves each uncorroborated non-null mechanic in the normalized `unverified_fields` list as a question. The existing [troop-level audit](../../../reference/research/troop-level-encoding-audit.md) checks the Common index-10 lookup (Knight HP 1766 / damage 202) for internal consistency, but expressly does not certify per-card values. The existing [knockback supplement](../../../reference/research/squall-timing-knockback-supplement.md) also records Knight mass 6 but says mass does not define a displacement rule. I made no new dated-source lookup: it would not resolve the raw retarget, attack-finish, collision, or mass semantics.

## Join and full-signature ledger

The pinned snapshot is RoyaleAPI `cr-api-data` commit [`54fdef52c5086393b085f57faeeab8ef86b28160`](https://github.com/RoyaleAPI/cr-api-data/commit/54fdef52c5086393b085f57faeeab8ef86b28160), dated 2023-02-18. [`source-receipts.json`](source-receipts.json) records canonical and final raw URLs, source-file byte counts, raw SHA-256, Git blob SHA-1, table counts, selected-output SHA-256, and extractor SHA-256. Only the selected rows below were saved; no complete upstream dataset or asset was copied.

| Join | Selector and result |
| --- | --- |
| Test comparator → roster | Existing test selector `key=knight`; exactly one pinned `cards.json` row. |
| Roster → rarity | `name=Common`; exactly one row; `tournament_level_index=10`. The source ledger identifies index 10 as the Common tournament-level-11 array position. |
| Roster → troop | Unique row matching `key=knight`, English name `Knight`, rarity `Common`, and `not_visible=false`. No numeric card-ID equality is needed for this join. |
| Troop → character | Troop stores `summon_character="Knight"`; exactly one character row matches that name. The selected character also matches roster/troop key, name, rarity, and ID. ID is a cross-check, not the binding basis. |
| Standalone → combined stats | Selected troop and character rows exactly equal the combined `troop` and `characters` rows. |
| Projectile / buff | The selected troop and character `projectile` values are both `null`; the other projectile-named candidates remain in the full rows and link-field screen. No projectile row is selected. No non-null string buff-name link is present. |

Raw important values are preserved rather than semantically decoded: troop `summon_character="Knight"`, `summon_number=0`, second summon `null`/count `0`, and zero summon radius/width/delays; character `summon_character="Knight"`, `summon_number=0`, null projectile/ability/spawn-character/death-spawn-character fields, and zero spawn/death-spawn counts. Those values do not prove a unit count or prove that a behavior is absent. The character also stores `projectile_start_radius=450` and `projectile_start_z=450`; these are retained without inferring a projectile link. The name-based screen preserves non-null `prestige_swf` / `prestige_export_name*` visual references; no asset file was fetched. Exact categorical, unknown, and sentinel fields remain in the JSON and the exhaustive [field-consumer-disposition.tsv](field-consumer-disposition.tsv).

Selected-row counts (primary rows only): roster 9 fields; rarity 46 fields with 6 arrays, one `true`, five numeric zeros; troop 81 fields with 21 nulls, 15 `false`, 31 numeric zeros; character 289 fields with 68 nulls, 56 `false`, 134 numeric zeros and one `true`. The combined duplicate rows have the same 81/289 field counts and exact values.

## Comparator and source confidence

The test’s existing parity mapping has 14 fields. Its source assertions require 5 matches (`cost`, `kind`, `rarity`, `hitSpeedTicks`, and `areaDamageRadiusMillitiles`) and 9 question-backed matches (`hitpoints`, `damage`, `firstHitTicks`, `deployTimeTicks`, `rangeMillitiles`, `sightRangeMillitiles`, `movementMillitilesPerSecond`, `targetMode`, and `count`), with no authoritative failures. The detailed values, transforms, and raw-source caveats are in [comparator-field-map.tsv](comparator-field-map.tsv). This packet did not execute that test or claim a game run.

Raw-source interpretation important to a future mechanics decision:

- Common `tournament_level_index=10`; character arrays have index 10 HP 1766 and damage 202. The values agree with the normalized Knight record, but that record still flags HP and damage as unverified.
- Character `hit_speed=1200` ms corresponds to the normalized 1.2 seconds / 72 ticks, and `hit_speed_seconds` is not flagged in `unverified_fields`. The raw row is still a datamine record, not an attack-animation or retarget-order specification.
- `load_time=700` ms, `deploy_time=1000` ms, `range=1200`, `sight_range=5500`, and `speed=60` align numerically with normalized 42 ticks, 60 ticks, 1.2 tiles, 5.5 tiles, and 1 tile/s. Those normalized fields remain questions in the local card record; units/normalization do not settle first-contact or retarget semantics.
- Raw `attacks_ground=true` and `attacks_air=false` coexist with local normalized `targets="ground"`, which remains question-backed. Raw `area_damage_radius=0` differs from the normalized `null`; the existing null-to-null comparator match does not explain zero-to-null or establish area behavior.
- Raw `collision_radius=500` and `mass=6` have no mapped Wayfinder field. The retarget fixture uses a fixed attacker radius of 300 and caller-supplied candidate radii; it has no mass input or movement/collision simulation.
- Raw `override_attack_finish_time=false` and `attack_finish_time=0` are stored. The isolated `AttackCycle` accepts only deploy, first-hit, and hit-speed ticks; there is no proven meaning for these raw attack-finish fields in this consumer.

## Engine-consumer and policy boundary

The exhaustive field table records every primary raw field, its exact stored value/type, and a bounded consumer/disposition. The runtime path is only the existing test fixture: `special-movement-retarget.js` passes Wayfinder’s normalized `deployTimeTicks`, `firstHitTicks`, and `hitSpeedTicks` to `AttackCycle`; passes normalized `targetMode` and `sightRangeMillitiles` to `retainOrAcquireTarget`; checks attack reach with normalized `rangeMillitiles` plus fixed attacker radius and supplied candidate radius; and applies normalized damage on an attack-ready event. Movement is explicitly outside that encounter. Catalog properties such as HP, count, cost, movement, and area radius are not evidence of a full shared-session card execution.

The three raw retarget/attack-cycle controls are retained exactly: `retarget_each_tick=false`, `retarget_after_attack=false`, and `load_after_retarget=false`. The local policy values are separately labeled `QUESTION` with source `unsourced-retarget-attack-lifecycle-composition`. The exact current values and per-field gaps for all 24 records in [`src/content/session-troop-movement-question-authority.js`](../../../src/content/session-troop-movement-question-authority.js#L485) are listed in [retarget-question-dispositions.tsv](retarget-question-dispositions.tsv). They are all `QUESTION` under `unsourced-retarget-attack-lifecycle-composition`; their fixture values are not historical answers.

## Remaining closure and next safe action

No more raw rows are missing for this selected signature. The smallest remaining gap is the meaning of raw fields in an authoritative consumer and corroboration/calibration for the non-null common fields marked QUESTION. In particular, complete historical retarget execution still needs evidence for target eligibility and sight/attack boundaries, sticky retention versus after-attack retargeting, loss/reacquisition/reset behavior, attack cancellation/readiness priority, and same-boundary event order. Attack-finish, collision radius, and mass consumers remain unmapped; no zero/false/null sentinel should be promoted into a mechanic rule.

The next safe evidence step is a licensed, controlled Knight attack-cycle capture plus separate controlled target-loss/reacquisition transitions (or a dated authoritative schema/consumer that defines those transitions). The existing [footage source audit](../../../reference/research/footage-source-audit.md) identifies `06_knight_attack_cycle.mp4` as a needed capture and says public videos were not verified as a permitted extraction source. A lone stationary-target clip could inform cycle timing but would still not settle retarget cancellation, reacquisition, or event-order questions. Keep the current positive test-only comparator and QUESTION policy; do not add a second mapping or claim full historical Knight execution from this packet.

## Scope and verification boundary

This branch adds only this artifact packet. No product/test/PLAN/reference-corpus files were edited; no test, build, browser, gameplay, or image/source-asset fetch was run. The extractor fetched only the seven named pinned JSON files, screened selected rows and exact linked tables, and saved only selected rows. Commands, local source-file hashes, upstream receipts, and artifact checksums are recorded alongside this report.
