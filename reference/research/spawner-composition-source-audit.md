# Spawner composition source audit — 2026-09-24

This is comparison research for the original project cards Bramble Cage and
Ember Roost. These are working analog assignments, not a source-proven alias
map. It does not import or authorize shipping reference names or data. The
pinned RoyaleAPI dump is a 2023-02-18 snapshot; `SOURCES.md` documents the
common-stat schema and confidence limits.

## Evidence

| Source analog | Pinned fields and publisher corroboration | Supported facts |
| --- | --- | --- |
| Goblin Cage → Bramble Cage | The pinned [building row](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_building.json#L8145) has `life_time: 20000`, `death_spawn_count: 1`, `death_spawn_character: GoblinBrawler`, and `death_spawn_deploy_time: 500` (raw milliseconds; death fields at [lines 8230–8243](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_building.json#L8230)). [Supercell's Dec. 2021 notes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-december-2021-2/) describe the single Goblin Brawler counter-pushing once the cage is destroyed. [Supercell's July 2019 notes](https://supercell.com/en/games/clashroyale/blog/release-notes/july-1st-balance-update-2/) record the cage lifetime increase from 15s to 20s. The pinned child character is in [cards_stats_characters.json](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L18588). | One Brawler on cage destruction; 20s lifetime; 500ms child deploy delay. The publisher describes one unit and the destruction trigger. |
| Furnace → Ember Roost | The pinned [building row](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_building.json#L4839) has `deploy_time: 1000`, `life_time: 33000`, `spawn_start_time: 0`, `spawn_interval: 0`, `spawn_number: 1`, `spawn_pause_time: 6000`, `spawn_character: FireSpirits`, `death_spawn_count: 1`, and `death_spawn_character: FireSpirits` (spawn fields at [lines 4938–4958](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_building.json#L4938)). [Supercell's Dec. 2021 notes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-december-2021-2/) corroborate a 33s lifetime, a 6s spawn rate, and one additional Fire Spirit for the death spawn. The pinned child character is in [cards_stats_characters.json](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L9954). | One Fire Spirit per periodic batch at a 6s pause, plus one Fire Spirit on death; 33s lifetime. The raw row also records a zero start-time field and a 1s deploy time. |

The local normalized stats table contains the card identities and ordinary
building stats, but not their spawn graph. `SOURCES.md` says component arrays
do not cover the full death-spawn/summon graph and lifetimes are outside the
common schema ([lines 42–43](../stats/SOURCES.md#L42)). The pinned raw rows
therefore provide useful additional evidence; their provenance should be
recorded directly if used in a session profile.

## Missing policy and current fixture differences

The raw rows do not encode the spawned unit's runtime owner or source
attribution. Same-owner propagation may be a shared GameSession rule, but it
is not stated in these per-card fields or the cited publisher notes. The raw
`spawn_start_time: 0` value is present, but the local source notes do not define
its first-delivery semantics relative to the building's 1s deployment. The
sources also do not specify the exact spawn formation/anchor, whether lifetime
expiry uses the same death-spawn path, or ordering when lifetime expiry and a
periodic batch share a tick.

The current [spawner fixture](../../src/content/cards/buildings-spawner.js#L20)
does not match these source analogs. Bramble Cage's one-child count matches,
but it uses a Thorn Runner with fixture HP 96 and an 18-tick fixture lifetime;
the source child is one Goblin Brawler and the building lifetime is 20s. Ember
Roost uses cost 5 instead of Furnace's cost 4, a 15-tick fixture lifetime
instead of 33s, three Ember Scouts on death instead of one Fire Spirit, and two
Cinderlings every 4 ticks after 3 ticks instead of one Fire Spirit per 6s
pause. The fixture's local building-health values (150 and 120) also differ
from the sourced level-11 analogs (742 and 848). These project-original child
identities need an explicit mapping to the source characters before they can
serve as source-backed aliases.

`CONTENT-011A`, `CONTENT-011P`, and `CONTENT-011D` already provide generic
placement, periodic, and death-spawn primitives; `GAME-001HBA` provides the
shared building authority seam. `BUILDING-002` validates an isolated encounter
only. The current `GAME-001HB` QUESTION is at
[PLAN.md:208](../../PLAN.md#L208).

## Recommendation

Keep both roster entries QUESTION for now. The pinned primary data supports
the main timing, count, lifetime, and spawn-identity values, so a small shared
session profile is technically actionable. Admission still needs a sourced or
explicitly accepted shared owner/source rule, a defined first-spawn boundary,
and the project-original child mapping; placement and expiry-boundary policy
must also be fixed before claiming complete parity. Preserve the raw fields as
per-field provenance and do not promote the current fixture values.
