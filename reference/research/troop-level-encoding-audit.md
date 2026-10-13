# Troop level-array encoding audit

Accessed 2026-10-13. This audit checks how the pinned 2023-02-18 source maps
`damage_per_level` and `hitpoints_per_level` array positions to Tournament
Standard level 11. It does not change `reference/stats/cards.json` or certify
per-card stats.

## Facts

Supercell's [September 2018 update](https://supercell.com/en/games/clashroyale/blog/release-notes/september-update-2/)
announces, “We've simplified card levels.” That page does not publish the
rarity offsets; its linked explanation is an X post that was unavailable to
this audit. Supercell's [Champions Update note, 25 October 2021](https://supercell.com/en/games/clashroyale/blog/release-notes/champions-update-article/)
states, “We've now moved the cap to level 11,” and “Champions will start from
level 11 when you unlock them.” The cap change applies to Global Tournaments,
Friendly Battles, Classic/Grand Challenges, and special limited-time
challenges.

The immutable [RoyaleAPI source commit](https://github.com/RoyaleAPI/cr-api-data/commit/54fdef52c5086393b085f57faeeab8ef86b28160)
contains a `tournament_level_index` field in each rarity row. Its five
collectible rarity entries are:

| Rarity | `relative_level` | `tournament_level_index` | Pinned row |
| --- | ---: | ---: | --- |
| Common | 0 | 10 | [`rarities.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/rarities.json#L2-L6) |
| Rare | 2 | 8 | [`rarities.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/rarities.json#L135-L139) |
| Epic | 5 | 5 | [`rarities.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/rarities.json#L260-L265) |
| Legendary | 8 | 2 | [`rarities.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/rarities.json#L370-L375) |
| Champion | 10 | 0 | [`rarities.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/rarities.json#L485-L490) |

The raw card roster supplies each card's rarity and `sc_key`; troop records
identify the stat-bearing character, while character rows can link to a
damage-bearing projectile. The extraction preserves those links and array
positions in [`troop-level-extract.json`](../../artifacts/troop-level-encoding-research/troop-level-extract.json).
Regenerate it with [`extract_troop_levels.py`](../../artifacts/troop-level-encoding-research/extract_troop_levels.py).
The receipt records byte counts and SHA-256 hashes for every pinned upstream
file and the normalized table.

| Card | Raw stat source and rarity | Level-11 source position and values | Existing normalized row |
| --- | --- | --- | --- |
| Knight | Character [`Knight`, Common](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L289) | index 10: HP 1766, [damage 202](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L310) | 1766 / 202 |
| Dart Goblin | Character [`BlowdartGoblin`, Rare](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L12704); projectile [`BlowdartGoblinProjectile`, Rare](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json#L2235) | index 8: HP 260, projectile damage 131 | 260 / 131 |
| Skeleton Army | Epic troop row summons Common `Skeleton`; explicit [`summon_character_level_index`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json#L1015-L1017) is 5; child arrays are [here](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L2801) | Epic position 5 reads child arrays as 51 / 51; adding the explicit 5 gives candidate position 10 and 81 / 81 | 51 / 51 |
| Princess | Character [`Princess`, Legendary](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L8113); custom-first damage-bearing projectile [`PrincessProjectile`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json#L1526) | index 2: HP 261, projectile damage 169 | 261 / `null` |
| Archer Queen | Character [`ArcherQueen`, Champion](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L28963); projectile [`ArcherQueenArrow`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json#L4606) | index 0: HP 1000, projectile damage 225 | 1000 / 225 |

The relevant raw links are [`cards_stats_characters.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json),
[`cards_stats_projectile.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json),
and [`cards_stats_troop.json`, Skeleton Army row](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json#L999-L1017).
The pinned `rarities.json` rows quote the direct index field as
`"tournament_level_index": 10`, `8`, `5`, `2`, and `0` for Common through
Champion, respectively. The source also sets Skeleton Army's
`"summon_character_level_index": 5`.

Three independent rows in the same datamine exhibit the same additive child
index pattern: Witch (Epic index 5, spawn offset 5), Tombstone (Rare index 8,
spawn offset 2), and Skeleton King's `SkeletonKingGraveyard` (Champion index 0,
spawn offset 10) each point to a Common skeleton row at candidate index 10.
All three candidate child-array lookups return 81 HP and 81 damage. This is
internal consistency across different source tables; it is not an independent
engine-level confirmation of what the offset fields mean.

## Inference

For a direct character or its linked projectile, the raw field named
`tournament_level_index` is the level-11 array position for that row's rarity.
The five positions differ, so index 8 is correct for Rare only. The source
values for Knight, Dart Goblin, Princess HP, and Archer Queen match the
existing normalized rows at their rarity-specific positions.

The child-spawn rows strongly suggest the candidate rule
`parent rarity tournament index + explicit child level offset`. Skeleton Army,
Witch, Tombstone, and Skeleton King's graveyard all reach the Common level-11
array position under this rule. If the rule is the engine's meaning, the
normalized Skeleton Army member values 51 / 51 came from position 5 and omit
the offset; position 10 yields 81 / 81. The pinned repository's [README](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/README.md)
only describes loading the JSON files and provides no consumer or schema
explaining these offset fields, so this arithmetic remains an inference.

Princess's raw character row has no damage array, while its linked
`PrincessProjectile` has 169 at Legendary index 2. That makes 169 a sourced
per-projectile candidate. The normalized table's `null` may be an intentional
schema choice for Princess's custom first projectile and multi-projectile
attack; this audit does not determine whether it is a normalization defect.

## Questions and limits

- The direct per-rarity index mapping is explicit in the pinned data and is
  corroborated by the official Tournament Cap history. The pinned source does
  not document the full schema or its extraction provenance; no authoritative
  source consumer was found in that commit.
- The exact engine semantics of `summon_character_level_index` and
  `spawn_character_level_index` remain undocumented here. Keep the Skeleton
  Army 51 / 51 versus 81 / 81 conflict as a question; do not promote 81 / 81
  into the normalized table from this audit alone.
- Princess's raw projectile array supports a 169 per-projectile value at
  level 11, but the mapping from that special projectile to the common-schema
  `damage` field remains unresolved. Keep the existing `null` pending a
  corroborating consumer or gameplay fixture.

One next action: obtain an authoritative same-version consumer/schema for the
pinned `*_level_index` fields and use it to resolve the Skeleton Army child
offset and Princess custom-first projectile mapping before changing either
normalized row.
