# Cannon combat source audit — 2026-09-23

This is comparison research, not a shipped gameplay source. Bulwark Needle is
original project content whose provisional defensive profile uses Cannon as an
analog. No historical source establishes Bulwark's own mechanics.

The pinned [2023-02-18 RoyaleAPI building constants](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_building.json),
[linked projectile constants](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json),
and [rarity indices](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/rarities.json)
support the level-11 Cannon analog values in `reference/stats/cards.json`:
824 HP, 212 projectile damage, 0.9-second hit cycle, 1-second deploy time,
5.5-tile range and sight, and ground targeting. The pinned raw building row
reports `load_time: 0` and `load_first_hit: false`. The normalized comparison
record deliberately leaves `first_hit_seconds: null`, because those raw fields
do not establish the visible deploy-to-first-contact interval.

[Supercell's 2019 balance notes](https://supercell.com/en/games/clashroyale/blog/release-notes/july-1st-balance-update-2/)
describe a Cannon hit-speed change; the
[2021 notes](https://supercell.com/en/games/clashroyale/blog/release-notes/summer-update-balance-changes-2/)
and [2022 notes](https://supercell.com/en/games/clashroyale/blog/news/balance-changes-october-2022-2/)
document further balance changes. They do not specify the first-contact
interval for the February 2023 build or independently confirm all of the
level-11 fields above. Per `reference/stats/SOURCES.md`, the Cannon record still
flags HP, damage, deploy time, range, sight, movement, targets, and count as
unverified against a second same-cutoff source. A datamine value is evidence,
but that flag must not be silently promoted to high-confidence parity.

The current Bulwark runtime chooses `firstHitTicks: 0` while the comparison
field remains null. Its session receipt now preserves that choice as QUESTION
and the browser labels the resulting combat provisional. The in-app building
witness cannot pass its source-backed combat bar until first-hit semantics and
the other required policy fields have acceptable corroboration or calibrated
footage. The exact browser visual restore gate has already passed separately.
