# Periodic-building source audit — Goblin Hut

This audit checks the December 2022 Goblin Hut rework against the pinned
pre-March-2023 building constants. Goblin Hut is an independent source example
for periodic and death-spawn fields; this is not a source-proven mapping to the
project's Bramble Cage or Ember Roost. No runtime, normalized stats, or card
identity records were changed.

## Evidence

Supercell's [7 December 2022 balance note](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-2/)
specifies three Spear Goblins per wave, 0.5 seconds between each member, a
29-second lifetime, a 10-second spawn frequency, and a published total of 12
Spear Goblins. The same note gives the prior values as one member per wave,
31 seconds, 4 seconds, and 11 total. Supercell's [December 2021 note](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-december-2021-2/)
independently records the 31-second lifetime and 4-second spawn-rate baseline.

The pinned [18 February 2023 raw row](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_building.json#L979)
agrees with the rework values: `life_time: 29000` at line 1018,
`spawn_start_time: 0`, `spawn_interval: 500`, `spawn_number: 3`, and
`spawn_pause_time: 10000` at lines 1084–1089; `spawn_character: SpearGoblin` is
at line 1091. The same row has `death_spawn_count: 3`,
`death_spawn_character: SpearGoblin`, and `death_spawn_deploy_time: 0` at lines
1103–1116. The times are milliseconds, as recorded in the local [source
ledger](../stats/SOURCES.md#L25).

The [4 October 2022 pre-rework row](https://github.com/RoyaleAPI/cr-api-data/blob/02057553d57038c47f79dc0e743d19ee938bfa3e/docs/json/cards_stats_building.json#L941)
has the old values: `life_time: 31000`, `spawn_start_time: 0`,
`spawn_interval: 0`, `spawn_number: 1`, and `spawn_pause_time: 4000`, plus the
same three-count Spear Goblin death-spawn fields. The [7 December 2022 source
snapshot](https://github.com/RoyaleAPI/cr-api-data/blob/a6dc5b3b0e4421c6b9f54b3b68722ae1a11c0da9/docs/json/cards_stats_building.json#L977)
already contains the new 29,000/500/3/10,000 values. The post-rework row is
unchanged in the pinned February snapshot.

## What the evidence supports

The count and interval facts can be represented without guessing the timer
origin: three Spear Goblins form a wave, members are 500 ms apart, the publisher
calls the wave frequency 10 seconds, and the building lifetime is 29 seconds.
The raw row separately records a three-unit Spear Goblin death-spawn branch.
This is enough to preserve the sourced values as a Goblin Hut source profile;
it does not establish a shared-session implementation or authorize using these
values for another project card.

There is a count-consistent interpretation of the publisher's total: if the
total of 12 includes the raw death-spawn branch, then the remaining nine units
are three periodic waves of three. The old 11 total similarly reconciles as
eight one-unit waves over 31 seconds at a four-second cadence plus three death
spawns. Both totals fit a zero-offset schedule measured from the start of the
building's active lifetime. This is a cross-source arithmetic inference, not
an explicit publisher definition of either the total's scope or the timer
origin.

## Questions the sources do not settle

- The raw `spawn_start_time: 0` is a field value, not a documented clock
  contract. The sources do not say whether zero is relative to card input,
  completion of the 1,000 ms deploy time, the start of lifetime, or another
  activation point. The totals are consistent with a zero-offset active-time
  schedule, but do not prove it.
- The publisher's “10 sec” frequency does not define whether the cadence is
  measured first-member to first-member or as a pause after the prior three
  members finish. The 500 ms within-wave spacing is explicit; the anchor for
  the next wave is not.
- The raw fields distinguish periodic spawning from `death_spawn_count`, but
  neither the December note nor the pinned row says whether natural lifetime
  expiry invokes that death-spawn branch, or whether destruction cancels a
  pending member/next wave. The 0 ms death-spawn deploy field does not define
  same-tick event order.
- Neither source specifies ordering when a wave, destruction, or expiry share
  an engine boundary. The repository contains no Goblin Hut reference clip to
  resolve onset, cancellation, or expiry behavior visually.

These gaps match the existing spawner audit's limits: raw rows do not state
owner/source propagation, lifetime-expiry death behavior, or boundary ordering
([spawner composition audit](spawner-composition-source-audit.md#L25)). The
local `reference/footage/NEEDED.md` is a capture manifest, not a Goblin Hut
recording.

## Concrete next step and evidence needed

For a Goblin Hut-only profile, preserve these source fields now: periodic group
size 3, within-group interval 500 ms, published frequency 10 seconds, lifetime
29 seconds, and the separate three-count Spear Goblin death-spawn record. Keep
the start anchor, cadence anchor, expiry trigger, cancellation, and same-boundary
ordering as explicit questions. Do not use this row to admit Bramble Cage or
Ember Roost: the existing [GAME-001HB record](../../PLAN.md#L230) still says
those project entries lack source-backed identities/compositions, and the
earlier audit identifies their assignments as working analogs rather than a
proven alias map.

The next evidence that would close the timing questions is either a dated
pre-March-2023 capture with the whole Hut lifecycle visible at frame rate, or
source documentation defining the raw timer fields. A useful capture must show
placement through the first wave, two later wave boundaries, a Hut destroyed
mid-wave, and an uninterrupted lifetime-expiry run. Until then, no exact event
order or shared-runtime parity claim follows from these constants.

Snapshot IDs, full-file SHA-256 hashes, byte counts, extracted row lines, and
the small raw profiles are recorded in
[`goblin-hut-source-extract.json`](../../artifacts/periodic-building-source-research/goblin-hut-source-extract.json).
The pin hash reproduces the source commit named by [SOURCES.md](../stats/SOURCES.md#L13).
