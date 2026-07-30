# Sources and confidence

Accessed on **2026-07-30**. This corpus is a historical reconstruction, not a claim that current live values match.

## Source ledger

| Field group | Primary source | Secondary source / check | Source date / accessed | Confidence |
| --- | --- | --- | --- | --- |
| Card roster, IDs, names, elixir, rarity, type | [RoyaleAPI `cards.json` at commit `54fdef5`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards.json) | [Clash Royale Wiki cards overview](https://clashroyale.fandom.com/wiki/Cards) and representative card pages | Snapshot 2023-02-18; accessed 2026-07-30 | High for the pinned roster; high for identity fields. |
| Tournament levels and rarity offsets | [RoyaleAPI `rarities.json` at commit `54fdef5`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/rarities.json) | [Tournament history](https://clashroyale.fandom.com/wiki/Tournament), which records the 2021 change to level 11 | Snapshot 2023-02-18; history event 2021-10-27; accessed 2026-07-30 | High. All five rarities use displayed level 11; internal indexes differ by rarity. |
| Troop HP, damage, attack timing, range, sight, speed, targets, count, splash | [RoyaleAPI character constants at commit `54fdef5`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json) plus [troop deployment records](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json) | Representative historical wiki/card-page checks only; not all 109 cards could be second-sourced at the same cutoff | Snapshot 2023-02-18; accessed 2026-07-30 | Medium-high as a datamine snapshot; per-value second-source status is in each card's `unverified_fields`. |
| Building HP, damage, attack timing, range, sight, targets, splash | [RoyaleAPI building constants at commit `54fdef5`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_building.json) and [projectiles](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json) | Representative historical pages; Cannon's 0.9 s hit speed is independently spot-checked | Snapshot 2023-02-18; accessed 2026-07-30 | Medium-high; see per-card flags. |
| Spell damage, radius, target class, spawned count | [RoyaleAPI spell constants](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_spell.json) and [projectile constants](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json) | Representative wiki pages and 2022 discussions; Fireball cost is spot-checked | Snapshot 2023-02-18; accessed 2026-07-30 | Medium. Poison, Tornado, and Earthquake store periodic damage indirectly; their per-tick values are explicitly noted and flagged where uncorroborated. |
| King and Princess Tower stats | Pinned [building](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_building.json) and [projectile](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json) constants, with level scaling corrected to the crown-tower level table | [King Tower level table](https://liquipedia.net/clashroyale/King_Tower), [Tower Princess level table](https://clashroyale.fandom.com/wiki/Tower_Princess), and [Princess Towers table mirror](https://www.clasher.us/clash-royale/card/Princess_Towers) | Datamine snapshot 2023-02-18; tables accessed 2026-07-30 | High for HP, damage, hit speed, and range. King first aim/load timing remains flagged. |
| Arena dimensions and deployment rules | [February 2023 tile-layout article with overlays](https://www.rakda3.net/clash-royale-field-tile/) | [Arenas overview](https://clashroyale.fandom.com/wiki/Arenas) and [deployment explainer](https://clashroyale.fandom.com/wiki/User_blog%3AKjx_and_lgym/How_to_play_troop_type_cards) | Article 2023-02-15, updated 2023-02-24; accessed 2026-07-30 | High for 18x32 and qualitative rules; low-medium for exact coordinate estimates. |
| Bridge/tower coordinates and footprints | Derived by counting the overlay tiles in the [February 2023 layout screenshots](https://www.rakda3.net/clash-royale-field-tile/) | Visual symmetry check against the same article's spell, ground, own-side, and destroyed-tower overlays | Screenshots/article 2023-02-15–24; derived 2026-07-30 | Low-medium. Every derived coordinate/footprint is named `approximate_*` and listed in `arena.json.unverified_fields`. |
| Elixir tick rates | [Clash Royale Wiki Elixir](https://clashroyale.fandom.com/wiki/Elixir) | [Supercell Support: Elixir](https://support.supercell.com/clash-royale/en/articles/elixir.html) for phase behavior | Historical rule in force by 2019-11-26; accessed 2026-07-30 | High for 2.8/1.4/~0.933 s. Starting elixir is not independently corroborated here and is flagged. |
| Regulation, overtime, sudden death, tiebreaker | [Clash Royale Wiki Battle](https://clashroyale.fandom.com/wiki/Battle) and the 2019 overtime rules described in community history | [November 2019 update discussion](https://www.reddit.com/r/ClashRoyale/comments/e2h8te/), recording two-minute overtime and triple elixir in its last minute | Rule change 2019-11-26; accessed 2026-07-30 | High for standard 1v1 timing at the cutoff. |

## Normalization decisions

- The source commit is the last RoyaleAPI constants commit before 2023-03-01: `54fdef52c5086393b085f57faeeab8ef86b28160`, committed 2023-02-18.
- Three temporary, non-collectible event cards in that dump were excluded: `santa-hog-rider`, `super-ice-golem`, and `super-magic-archer`. The remaining 109 cards are the collectible pre-Evolutions roster.
- Tournament standard was displayed level 11 for every rarity. The datamine's array index is Common 10, Rare 8, Epic 5, Legendary 2, and Champion 0.
- Raw distances are thousandths of a tile and raw times are milliseconds.
- Raw movement values map as 45/60/90/120 = 0.75/1/1.5/2 tiles per second = Slow/Medium/Fast/Very Fast.
- `first_hit_seconds` is the datamine `load_time`. Animation, retargeting, projectile travel, and card-specific startup can make observed first contact differ.
- For projectile buildings, damage is read from the linked projectile when the building row stores zero.
- `damage` is per attack/projectile/tick, never silently converted to an entire spell-duration total.

## Corroboration flags

`cards.json` is intentionally conservative. For every card, `unverified_fields` names each non-null mechanic value that was not corroborated against a second historical source at the same cutoff. A missing name in that array means either:

1. it is an identity/schema field directly confirmed by the roster and card overview; or
2. it is one of the hardcoded independent spot checks in `validate.py`.

This prevents a structured datamine from being mistaken for two-source verification. Null values are “not applicable/not safely expressible,” not unverified numeric claims. Tower and arena files use the same convention.

## Known limitations

- Component arrays cover initially deployed mixed units and obvious spell spawns; they are not a full recursive death-spawn/summon graph.
- Card abilities (Champion abilities, charge/dash stages, shields, death damage, ramping damage, lifetimes, buffs, and crown-tower damage multipliers) are outside the requested common schema.
- The exact deployment cell mask and collision-authoritative tower/bridge footprints need frame-calibrated gameplay capture or a more complete arena datamine.
- Current wiki pages may include later balance history. They were used only where a dated history/table supported the pre-March-2023 value.
