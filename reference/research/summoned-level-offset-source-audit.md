# Summoned-level offset source audit

Accessed 2026-10-13. This bounded follow-up asks whether the immutable
2023-02-18 RoyaleAPI export defines how `summon_character_level_index` and
`spawn_character_level_index` select child stat-array positions, and whether a
separate linked-projectile level-index field exists. It does not change or
certify any normalized card stats.

## Facts

The pinned [RoyaleAPI `cr-api-data` commit](https://github.com/RoyaleAPI/cr-api-data/tree/54fdef52c5086393b085f57faeeab8ef86b28160)
is dated 2023-02-18 and its complete recursive Git tree has 43 paths. The
tree contains static JSON under `docs/json`, a README, the JSON-listing
`docs/index.html`, and CSS files. A path scan found no generator, parser,
consumer, or schema candidate. The pinned [README](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/README.md)
only points readers to load JSON from the web; the pinned
[index page](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/index.html)
lists files. Neither page contains any of the three searched field names or
explains their semantics. Hashes, exact file sizes, tree inventory, and the
small extraction are in
[`pinned-schema-probe.json`](../../artifacts/summoned-level-offset-research/pinned-schema-probe.json);
reproduce with
[`probe_pinned_schema.py`](../../artifacts/summoned-level-offset-research/probe_pinned_schema.py).

The pinned [`rarities.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/rarities.json)
sets `tournament_level_index` to Common 10, Rare 8, Epic 5, Legendary 2, and
Champion 0. The pinned [`SkeletonArmy` troop row](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json#L999-L1017)
is Epic, names `Skeleton` as its summon, and has
`summon_character_level_index: 5`. The pinned [Common `Skeleton` character
row](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L2801)
has 51 HP / 51 damage at array index 5 and 81 HP / 81 damage at index 10.
The Epic direct index plus the summon field numerically lands on 10, but the
export does not say whether that addition is the intended interpretation.

Three other same-tree records have the same arithmetic pattern: Witch (Epic
index 5, spawn field 5), Tombstone (Rare index 8, spawn field 2), and
Skeleton King's graveyard spell (Champion index 0, spawn field 10) each point
to a Common skeleton row whose index-10 arrays read 81 / 81. These values and
source hashes are recorded in the receipt. They show internal consistency
among exported fields, not what the game client does with them.

Across the pinned rarity and card-stat JSON files checked by the receipt,
`projectile_level_index` occurs zero times. For example, the pinned Witch
character row links to `WitchProjectile`, whose projectile row carries its own
rarity and damage array ([character data](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L2221-L2331),
[projectile data](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json)).
The README and index provide no rule for selecting a linked projectile's array
position from the parent card's level. This source therefore supplies no
same-version consumer for either spawn offsets or linked projectile mapping.

Supercell's [Champions Update notes, 25 October 2021](https://supercell.com/en/games/clashroyale/blog/release-notes/champions-update-article/)
say, “We've now moved the cap to level 11.” This confirms the Tournament Cap
change but says nothing about child-index arithmetic. Supercell's
[13 February 2017 balance notes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-coming-1/)
say Witch can “one-shot equally leveled Skeletons.” That is an interaction
statement, not documentation of the export fields.

## Inference

The raw data is consistent with treating each spawn/summon value as an offset
added to the parent rarity's `tournament_level_index`. Under that
interpretation, Skeleton Army's member stats at Tournament Standard would be
81 / 81 from Common Skeleton array position 10, while the existing normalized
51 / 51 matches position 5. The three other examples produce the same Common
index 10. This is still an inference: neither a field name nor repeated
arithmetic consistency establishes the consuming code's semantics.

Linked projectile rows may use their own rarity index or inherit the
character/card's selected level. This audit found no exported field or
consumer that distinguishes those possibilities, so it does not settle any
linked-projectile discrepancy in the normalized table.

## Questions and limits

The exact bounded gap is a same-version consumer or schema: the pinned
repository contains only the published static data and listing documentation,
and the two official publisher notes checked here do not describe
`summon_character_level_index`, `spawn_character_level_index`, or projectile
array selection. The checked source set therefore cannot establish whether
the Skeleton Army normalized 51 / 51 is wrong, whether 81 / 81 is correct, or
how any disputed linked projectile maps to level 11. Keep those rows
unpromoted and unresolved.

One next action: obtain an authoritative consumer or schema for this exact
export version, then use its documented level-index semantics to check
Skeleton Army and the disputed linked-projectile rows against the normalized
table before changing any stats.
