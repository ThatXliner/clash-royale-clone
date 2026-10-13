# Ground melee-splash source audit — 2026-10-13

## Finding

The comparison-only Valkyrie row is a viable reference for a new ground melee-splash role, but it does **not** authorize an exact February 2023 splash radius. The strongest primary-source mismatch is direct: Supercell's 3 July 2019 balance note set Valkyrie's range to 1.2 tiles and area-damage radius to 2.4 tiles, while RoyaleAPI's pinned 18 February 2023 character row encodes range `1200` and area radius `2000`. The repository's normalized Valkyrie radius and range are both explicitly unverified. Keep the radius a QUESTION; do not promote either 2.0 or 2.4 as the pre-March-2023 value.

The sources do support a narrower, testable claim: Valkyrie's attack is an area-damage melee role. Supercell's dated note names her area-damage radius; the pinned card description says the damage is around her and that swarms can be cleared. Neither source settles the exact attack geometry or the per-secondary-target rules.

## Pinned raw extract and provenance

The raw publisher snapshot is [RoyaleAPI `cr-api-data` commit `54fdef52c5086393b085f57faeeab8ef86b28160`](https://github.com/RoyaleAPI/cr-api-data/commit/54fdef52c5086393b085f57faeeab8ef86b28160), committed 2023-02-18 11:25:16 UTC. The immutable source paths are [`cards_stats_characters.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json) and [`cards.json`](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards.json). GitHub reports blob IDs `a86a93da5b27a27ae891cfa3c67b13b7f3b2080e` and `9a26927d54fbf358138e10d2f5bb5519e6f8602e`, respectively.

For the raw Valkyrie row (`id: 26000011`), the extracted fields are:

```json
{
  "range": 1200,
  "area_damage_radius": 2000,
  "self_as_aoe_center": true,
  "attacks_ground": true,
  "attacks_air": false,
  "damage_per_level[8]": 267,
  "hit_speed": 1500,
  "projectile": null,
  "multiple_targets": 0,
  "all_targets_hit": false,
  "collision_radius": 500
}
```

The project source ledger says raw distance values are thousandths of a tile, which normalizes `range: 1200` to 1.2 and `area_damage_radius: 2000` to 2.0. That conversion describes the encoding; it does not prove how the live hit test applies the numbers. The complete small extraction, including the pinned card-description row and source digests, is [pinned-valkyrie-extract.json](../../artifacts/melee-splash-source-research/pinned-valkyrie-extract.json). Its generator is [extract-pinned-valkyrie.py](../../artifacts/melee-splash-source-research/extract-pinned-valkyrie.py). The extracted JSON SHA-256 is `59d2100d3b65de4ac71e0839eb319bbe91eb8531b895ec6d84b6e42d6b759c10`; the upstream raw character file SHA-256 is `37734d1508584e43851395c01b2d10046667eb6dc27daef37e5df56e74f933ac` and the raw card file SHA-256 is `312574f75ada2ff5ad605e1eb122c3b620d1163c5a675d67cd9e64122b3d6946`.

The repo's [source ledger](../stats/SOURCES.md) rates the character constants medium-high as a datamine snapshot, but requires per-value corroboration. Valkyrie's `area_damage_radius_tiles`, `range_tiles`, and `targets` are all in that card's `unverified_fields` in [`cards.json`](../stats/cards.json). Do not treat the raw values above as authoritative runtime behavior.

## Primary dated corroboration

Supercell's [3 July 2019 Season 1 balance note](https://supercell.com/en/games/clashroyale/blog/release-notes/july-1st-balance-update-2/) says the Valkyrie range changed `1 -> 1.2` and the area-damage radius changed `2 -> 2.4`. The same note says a tile is one of the Arena squares that affect placement and range. This independently confirms the units and the meaning of *range* versus *area-damage radius* for that 2019 update. It does not corroborate the pinned 2023 value of 2.0; the 2019 value cannot be carried forward across that disagreement without evidence ruling out a later change or a raw-field semantic mismatch.

Supercell's [4 February 2023 balance note](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-february-2023-2/) is dated before the cutoff and compares Knight usage with Valkyrie, but does not report Valkyrie radius, target layers, or splash resolution. It adds no corroboration for those mechanics. The pinned RoyaleAPI description is qualitative: “Tough melee fighter, deals area damage around her. Swarm or horde, no problem!” Treat this as a dated description carried by the snapshot, not as an exact collision specification.

### Chronological primary-source check

I checked Supercell-published notes for the interval after the July 2019 change through the 2023-02-18 pinned snapshot. The checked pages do not provide a dated 2.4-to-2.0 correction or define Valkyrie's hit geometry:

- [1 August 2019 game update](https://supercell.com/en/games/clashroyale/blog/release-notes/game-update-1st-august-2/): the published list describes Pass Royale, Trophy Road, UI, and performance fixes; it does not mention a Valkyrie radius change.
- [2 September 2019 Season 3 changes](https://supercell.com/en/games/clashroyale/blog/release-notes/season-3/): lists radius changes for Royal Ghost and Dark Prince, but no Valkyrie radius correction.
- [4 November 2019 Season 5 changes](https://supercell.com/en/games/clashroyale/blog/news/season-5-balance-changes-2/): lists area-radius changes for Wall Breakers and other named cards, but no Valkyrie radius correction.
- [4 August 2020 Season 14 changes](https://supercell.com/en/games/clashroyale/blog/release-notes/season-14-balance-changes/) and [6 September 2021 changes](https://supercell.com/en/games/clashroyale/blog/release-notes/summer-update-balance-changes-1-2/): their published change lists do not give a Valkyrie radius correction.
- [4 April 2022 changes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-april-2022/): the listed base Valkyrie change is hitpoints `-4%`, with no radius change stated.
- [7 December 2022 changes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-2/) and [4 February 2023 changes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-february-2023-2/): neither reports a base Valkyrie radius change; the February note only names her as a Knight comparison.

These are the specific publisher notes checked, not proof that no undocumented, in-client, or otherwise unindexed change occurred. Their silence cannot resolve the disagreement between the July 2019 official value and the February 2023 raw row. Keep that gap open; the source-confidence flags and candidate numeric values are unchanged.

## Fact, inference, and open questions

| Topic | Supported fact | Limit |
| --- | --- | --- |
| Role | The pinned description calls the attack area damage around the unit; Supercell's 2019 note explicitly lists Valkyrie's area-damage radius. | Supports area-melee behavior, not its complete current geometry. |
| Radius | The 2019 official value is 2.4 tiles after that update; the pinned 2023 raw row is `2000`, normalized to 2.0 by the project convention. | Conflict. February 2023 effective radius remains a QUESTION. |
| Melee range | Supercell states the 2019 range became 1.2 tiles; the 2023 raw row is `1200`. | Neither source says whether the engine checks center distance, edge distance, or collision-adjusted distance for a particular target. |
| Center | Raw `self_as_aoe_center: true` and the text “around her” suggest a unit-centered attack. | The raw field's runtime semantics are undocumented here; the effective center and any target-offset rule remain unverified. |
| Direct target layer | Raw flags say `attacks_ground: true`, `attacks_air: false`; the normalized record calls the direct target mode ground. | They do not establish which layers the area effect can damage. Ground-only splash is plausible, not verified. |
| Secondary damage | The raw level-11 index has `damage_per_level[8] = 267`, and the description supports damage to a swarm. | No checked primary source confirms secondary damage equals 267, the number/cap of secondary targets, or damage falloff. `multiple_targets: 0` and `all_targets_hit: false` are opaque fields here; do not infer semantics from their names. |
| Shape and boundary | A numeric area-damage radius is published. | No checked source establishes circular versus other geometry, inclusive edge behavior, collision-radius compensation, or the effective radius from the source versus the selected target. |
| Ordering | No checked source documents per-target application order or simultaneous resolution. | Any deterministic tie-break must be an explicit local rule and must not be presented as recovered game behavior. |

## Smallest source-supported test axis

The first shared-runtime test can verify **qualitative clustered ground splash and determinism**, not exact parity: configure one attack to resolve on a primary ground target placed within 0.5 tile of the attacker, then place a second ground unit almost on top of the primary. This puts the secondary inside both radius candidates whether the effect is centered on the attacker or the selected target. Assert only that the nearby unit receives some area damage and that replay/snapshot continuation gives the same result. This verifies the clustered-area path, not exact target selection or geometry. Do not assert equal secondary damage, a 2.0/2.4 boundary, air splash, tower splash, source-versus-target-centered geometry, or the game's per-target ordering from this evidence. A separate fact audit or direct controlled gameplay capture is needed before those become source-parity assertions.

This supports an original ground melee-splash card concept and a deterministic mechanics slice. Valkyrie and all raw names/data remain reference-only; this audit makes no product asset, identity, or lore claim.
