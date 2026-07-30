# Reference stats schema

All files use schema version `1.0.0`. Numbers are tournament-standard level 11 values from the last RoyaleAPI constants snapshot before March 2023. A JSON `null` means the field does not apply or the source could not express it; the key is still required.

## `cards.json`

The root has exactly:

- `schema_version`: semantic schema version.
- `snapshot`: cutoff, tournament levels by rarity, and excluded non-collectible event cards.
- `cards`: 109 collectible card records.

Every card has:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | integer | Supercell card ID from the historical constants. |
| `key` | string | Stable kebab-case identifier. |
| `name` | string | Historical display name. |
| `elixir_cost` | integer | Cost, 1–10. Mirror is its deck cost, not the copied card's effective cost. |
| `rarity` | enum | `common`, `rare`, `epic`, `legendary`, or `champion`. |
| `type` | enum | `troop`, `building`, or `spell`. |
| `tournament_level` | integer | Displayed card level; always 11 in this corpus. |
| `hitpoints` | integer/null | Primary deployed entity HP. |
| `damage` | integer/null | Primary damage per attack, projectile, or periodic tick. See `notes` for multi-wave effects. |
| `hit_speed_seconds` | number/null | Time between attacks. |
| `first_hit_seconds` | number/null | Historical `load_time`, normalized from ms. Treat this as a timing reference, not a guaranteed animation-frame measurement. |
| `deploy_time_seconds` | number/null | Primary entity deploy time. |
| `range_tiles` | number/null | Attack range. |
| `sight_range_tiles` | number/null | Acquisition/sight range. |
| `movement_speed_tiles_per_second` | number/null | Numeric movement rate; raw datamine speed divided by 60. |
| `movement_speed` | enum/null | `stationary`, `slow`, `medium`, `fast`, `very_fast`, or `custom`. |
| `targets` | enum | `none`, `ground`, `air`, `air_and_ground`, or `buildings`. |
| `count` | positive integer | Initial unit count; spells use 1. Spawned components are detailed separately. |
| `area_damage_radius_tiles` | number/null | Primary splash/effect radius. |
| `components` | array | Primary and secondary entities for mixed-unit/spawn spells. |
| `unverified_fields` | string array | Every non-null mechanic field that was not independently corroborated against a second historical source. |
| `notes` | string array | Semantics that prevent a number from being misread. |

Component records have exactly `name`, `role`, `count`, and the same combat/movement fields from `hitpoints` through `area_damage_radius_tiles`. `role` is `primary`, `secondary`, `spawn`, or `spawn_over_duration`.

For mixed cards, top-level combat values describe the first/primary component and `count` is the sum of initial primary and secondary entities. For example, Rascals exposes the Rascal Boy at top level and lists one Boy plus two Girls in `components`.

## `towers.json`

The root contains `schema_version`, `snapshot`, and `towers`. Each tower record has `key`, `name`, `count_per_side`, `hitpoints`, `damage`, `hit_speed_seconds`, `first_hit_seconds`, `range_tiles`, `targets`, `area_damage_radius_tiles`, `activation_rule`, and `unverified_fields`.

## `arena.json`

The root contains `schema_version`, `snapshot`, `playfield`, `deployment`, `elixir`, `timing`, and `unverified_fields`. Coordinates are in tile-edge units from the southwest edge of the blue side. Half values are tile centers. Screenshot-derived positions are deliberately named `approximate_*`; do not treat them as collision-authoritative.

## Units and nullability

- Time: seconds.
- Distance and radius: arena tiles.
- HP and damage: integer level-11 game values.
- Movement: tiles per second plus a categorical label.
- `null`: not applicable or not safely extractable. It never means zero.
