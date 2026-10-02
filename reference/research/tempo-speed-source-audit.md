# Tempo Field speed normalization audit

## Question

Does the pinned pre-March-2023 Tempo Field record establish a `27/20` rate
for unit movement and attack speed, or does the `135` value require a separate
normalization source?

## Pinned raw record

The project pins the February 18, 2023 spell data in
[`status-spells-cutoff.json`](./status-spells-cutoff.json). Its metadata records
the upstream URL, commit, date, and full-file SHA-256. The Rage record has:

| Raw field | Raw value |
| --- | ---: |
| `buff_fields.speed_multiplier` | 135 |
| `buff_fields.hit_speed_multiplier` | 135 |
| `buff_fields.spawn_speed_multiplier` | 135 |

These are the movement, attack-speed, and spawn-speed channels, respectively.
The record is explicitly raw-only, not an executable composition receipt.
The accompanying cutoff supplement warns that positive-buff and negative-slow
raw multiplier conventions differ, so the negative slow values cannot by
themselves define the positive Rage normalization.

The full pinned upstream spell list has no independent positive movement,
attack-speed, or spawn-speed multiplier example: its positive entries are the
Rage, Barbarian Rage, and Boost Rage variants, all with the same raw 135 values.
This is a comparison within the pinned extracted data, not primary publisher
documentation and not an independent normalization bridge.

## Publisher evidence inspected

- [What Is Rage Challenge Mode?](https://supercell.com/en/games/clashroyale/blog/news/what-is-rage-challenge-mode/), July 13, 2018: Supercell says Rage increases troop movement and attack speed, and makes buildings attack faster and summon troops sooner. It provides no percentage.
- [Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-2/), December 7, 2022: Rage is listed as “coming soon”; its announced rework adds spell damage, reduces radius, and fixes duration across levels. No speed percentage is given.
- [Clashmas Update](https://supercell.com/en/games/clashroyale/blog/release-notes/clashmas-update-2022/), December 11, 2022: the rework is announced again as part of the update, still without a speed percentage.
- [Optional Update Jan 4](https://supercell.com/en/games/clashroyale/blog/release-notes/optional-update-jan-4/), January 4, 2023: the notes mention Rage’s visual duration and card-info classification, not its speed percentage.
- [January Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/january-balance-changes/), January 4, 2024: Rage duration changes from 6 to 5.5 seconds; the note gives no speed percentage.
- [October Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/october-balance-changes-2/), October 24, 2025: Supercell describes Rage’s boost changing from 35% to 30%. This establishes a 35% pre-nerf boost at that later date, not at the project’s pre-March-2023 cutoff.

I searched Supercell’s dated Clash Royale balance/release notes for Rage with
`35%`, `boost`, `movement speed`, and `attack speed`. The official publisher
material found before the cutoff confirms which speed dimensions Rage affects,
but does not state the numeric boost. The December 2022 “coming soon” entry
also cannot on its own establish the live date of the announced rework.

## Conclusion and limit

Interpreting raw 135 as 135% of the unmodified rate yields `135/100 = 27/20`;
interpreting it as a 135% increase instead yields `235/100 = 47/20`. The later
Supercell 2025 note makes `27/20` a strong candidate interpretation, while the
2018 note confirms that movement and attack speed are both affected. However,
the sources inspected do not bridge that numeric publisher description back
to the February 2023 cutoff. Therefore `27/20` is plausible and later
publisher-corroborated, but is not established here as the source-backed
pre-cutoff normalized value. The `7/4` movement and attack values in the
isolated generic Rage fixture remain an unsourced fixture policy; neither
`7/4` nor `27/20` should be promoted as complete GAME-001HSS behavior by this
audit.

This audit does not resolve eligibility, activation delay, area-entry timing,
buff duration per entrant, refresh/re-entry behavior, reset classes, same-tick
ordering, building spawn acceleration, or damage rounding. GAME-001HSS remains
questioned and admission remains rejected until those facts and the numeric
normalization are adequately sourced.
