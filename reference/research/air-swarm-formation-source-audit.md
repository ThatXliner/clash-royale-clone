# Air-swarm formation and stagger source audit — 2026-10-13

This is comparison research for the five- and six-member air-squad roles. It
does not change runtime behavior, authoritative stats, or confidence flags.
The historical cutoff is the February 18, 2023 RoyaleAPI snapshot already
pinned in [`SOURCES.md`](../stats/SOURCES.md#L22).

## Findings supported by sources

The pinned `cards_stats_troop.json` rows identify a five-member `Bat` summon
with `summon_radius: 750` and `summon_deploy_delay: 100`, and a six-member
`Minion` summon with `summon_radius: 600` and the same delay. See the
[pinned Bats row](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json#L4068-L4093)
and [pinned Minion Horde row](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json#L1827-L1853).
These are raw deployment-record fields, not the ordinary attack-range fields
in the separate character records.

`summon_deploy_delay: 100` means a 100 ms gap **between members**, not one
100 ms delay for the whole group. Supercell's June 2, 2020 deployment
standardization says that multi-unit cards deploy with 0.1 seconds between
troops, explicitly lists Bats, Minions, and Minion Horde, and exempts the two
skeleton cards. The precise statement appears in the publisher's
[Italian-localized release note](https://supercell.com/en/games/clashroyale/it/blog/release-notes/modifiche-di-bilanciamento-della-stagione-12/)
(paragraphs headed “STANDARDIZZAZIONE: TEMPI DI SCHIERAMENTO” and “CARTE
INTERESSATE DA QUESTO CAMBIAMENTO”); the [English publisher page](https://supercell.com/en/games/clashroyale/blog/release-notes/season-12-balance-changes-2/)
confirms the date and that troop deployment times were standardized. This
supports four 100 ms gaps for five members (400 ms from first to last) and
five gaps for six members (500 ms from first to last). It does not establish
when the first member appears relative to the card's general deployment
animation or input acceptance.

`summon_radius` is a **deployment-spread parameter**, not attack range. The
strongest direct corroboration is Supercell's December 7, 2022 note: for the
Minion Horde only, increased deploy radius increases the space between its
members and should help them surround area-damage troops ([publisher note](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-2/)). RoyaleAPI's dated
[December 2022 before/after table](https://royaleapi.com/blog/season-42-balance?lang=en#minion-horde-buff)
calls the field “Deploy Radius” and records 0 before and 0.6 after. The
RoyaleAPI raw troop record likewise moves from `summon_radius: 0` in the
[October 4, 2022 snapshot](https://github.com/RoyaleAPI/cr-api-data/blob/02057553d57038c47f79dc0e743d19ee938bfa3e/docs/json/cards_stats_troop.json#L1849-L1874)
to `600` in the [December 7, 2022 snapshot](https://github.com/RoyaleAPI/cr-api-data/blob/a6dc5b3b0e4421c6b9f54b3b68722ae1a11c0da9/docs/json/cards_stats_troop.json#L1849-L1874),
and remains `600` in the pinned February 2023 row. That history ties the raw
field to the documented spread change.

The repo's shared normalization records raw distances as thousandths of a
tile and raw times as milliseconds ([`SOURCES.md`](../stats/SOURCES.md#L25)).
For this snapshot, that convention reads the raw radii as 750 = 0.75 tile for
Bats and 600 = 0.60 tile for the six-member squad. The RoyaleAPI before/after
table independently agrees with 600 → 0.6 for the latter. Confidence is high
for the pinned raw values and the 100 ms inter-member interval; medium-high
for the `Minion Horde` radius-to-spacing interpretation and 0.6-tile display;
medium for applying the same radius meaning/unit to Bats by shared-field
convention. No source found here documents a transformation from either raw
radius into each unit's final coordinates.

## Still a QUESTION

The raw radius and stagger sources do not define the five/six unit coordinate
formula, the formation shape, anchor offset, member order, side-dependent
orientation, collision adjustment, or whether any placement randomness is
used. The June 2020 note fixes the relative interval but not the first-spawn
boundary. The December 2022 note fixes the Minion Horde spacing effect but
not its individual positions. An un-dated current wiki description or a
hand-drawn formation is not matched pre-March-2023 gameplay evidence.

The local `reference/footage/` tree currently contains only its capture
manifest, [`NEEDED.md`](../footage/NEEDED.md); it contains no squad-specific
recording or still. Therefore the exact placement/order/timing parity asked
for by `CARDS-016D` remains a QUESTION. Do not replace the generic 300-radius,
same-batch fixture with a guessed formula or claim source-backed formation
parity based only on the field name.

The next useful evidence is an authorized pre-March-2023 60 fps capture, with
the full arena and tile landmarks visible, for each squad deployed once on
each side at a fixed point in an otherwise empty lane. Preserve the frames
from card release through at least 0.6 seconds after the first member appears.
Measure each member's first visible position and frame, then repeat at a
second placement point to separate a fixed offset/shape from an anchor or
side-orientation rule. This would test first-to-last spacing as well as
formation geometry without assuming that a radius is a literal circle.

The machine-readable raw-field extracts and source-file hashes are in
[`artifacts/cards016-formation-research/raw-records.json`](../../artifacts/cards016-formation-research/raw-records.json).
