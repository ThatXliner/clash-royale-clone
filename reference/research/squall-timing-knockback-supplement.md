# Squall Orb timing and knockback evidence

This supplement narrows the Fireball-derived Squall Orb source questions at
the pre-Evolutions cutoff. It is provenance material only: the JSON extract
and script under `artifacts/spell-source-supplement/` are not imported or
bundled by the game. The extractor re-fetches the six pinned upstream files,
checks their full SHA-256 hashes, and asserts the recorded row selectors and
cross-links.

## Primary row facts

The pinned source is RoyaleAPI `cr-api-data` commit
[`54fdef52c5086393b085f57faeeab8ef86b28160`](https://github.com/RoyaleAPI/cr-api-data/commit/54fdef52c5086393b085f57faeeab8ef86b28160),
the 2023-02-18 snapshot recorded in [SOURCES.md](../stats/SOURCES.md). In
`cards_stats_projectile.json`, selector `[0]`, `name=FireballSpell`, has
`speed=600`, `homing=false`, `gravity=50`, `pushback=1000`,
`pushback_all=false`, `radius=2500`, both air and ground enabled,
`only_enemies=true`, `only_own_troops=false`, `check_collisions=false`, and
`hide_when_delayed=false`. Its rare-level damage array has index `[8]=689`
and its crown-tower modifier is `-70`.

The full pinned [projectile file](https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json)
has SHA-256
`c883516f54f6c17ee77c15cf484b01da9ded22602214c3b0d42b1ab823bd3197`.
The raw rows and all six source hashes are recorded in
[`squall-primary-rows.json`](../../artifacts/spell-source-supplement/squall-primary-rows.json).

The aggregated `cards_stats.json` links `character_buff[26]`,
`FireballProjectile`, to `override_projectile=FireballSpell`. Its `spell`
group and the standalone `cards_stats_spell.json` contain no Fireball-named
or Fireball-keyed row. Thus this pinned table supplies a projectile record,
not a cast activation record. The projectile row has no launch origin,
activation delay, travel formula, knockback eligibility rule, or interruption
order. Its `speed`, `pushback`, and `mass` fields have no field-specific unit
definition in the raw source.

For comparison, the linked character rows record `ignore_pushback` and `mass`
as follows:

| Card / character selector | Mass | `ignore_pushback` | Link |
| --- | ---: | --- | --- |
| Knight, `characters[0]` | 6 | false | `cards.json.sc_key=Knight` |
| Giant, `characters[3]` | 18 | true | `cards.json.sc_key=Giant` |
| P.E.K.K.A, `characters[4]` | 18 | true | `cards.json.sc_key=Pekka` → character `name=Pekka` |
| Musketeer, `characters[14]` | 5 | false | `cards.json.sc_key=Musketeer` |

The cards and deployment records match selectors `[0]`, `[3]`, `[4]`, and
`[14]` respectively. P.E.K.K.A's character row has no `key`, `sc_key`, or
card ID, so its link uses the roster's `sc_key` and character name. These are
raw datamine values; they make `ignore_pushback` a plausible eligibility
input, but do not prove exactly how Fireball consumes it. The mass values do
not establish a displacement formula or threshold.

## Publisher corroboration and remaining uncertainty

Supercell's [2 August 2022 balance notes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-august-2022-2/)
set Fireball pushback from 1.8 tiles to 1 tile. This was published before
the pinned February 2023 snapshot and directly supports one tile of Fireball
pushback at the cutoff. The raw value `pushback=1000` agrees with that value;
this agreement does not establish that every raw field named `pushback` uses
a general 1000-units-per-tile convention. The same publisher note describes
instant damage and pushback qualitatively, but gives no cast-to-impact time.

The corpus normalization notes that raw distances are thousandths of a tile,
raw times are milliseconds, and character movement values map
`60 → 1 tile/second`. It does not document projectile-speed units. Therefore
`speed=600 → 10 tiles/second` is an extrapolation from the character movement
scale, not a sourced projectile conversion. Similarly, the raw character
`activation_time=0` values describe those characters; they do not establish
Fireball startup. The selected character `projectile_start_radius` and
`projectile_start_z` fields describe troop attacks and are not evidence for
the spell's launch point.

The existing [Squall catalog note](squall-catalog-contexts.md),
`special-movement-knockback.js`, and `spells-instant.js` remain useful as
runtime fixture evidence only. Their 2000-millitile displacement,
two-tick pulse/impact, caller eligibility boolean, and command/impact order
are marked QUESTION or unsourced in code; they do not become Fireball facts
because the card is mapped to those fixtures. The normalized Fireball card
continues to flag targets and radius in `unverified_fields`.

## Explicit runtime estimate for a later profile

If a deterministic full profile is needed before stronger evidence appears,
record it as a named estimate such as `fireball-profile-estimate-v1`, outside
the authoritative source receipt:

- Use the current 60-tick/second simulation rate. Treat raw projectile speed
  600 as 10 tiles/second by reusing the movement scale only as a declared
  estimate. Set flight ticks to `ceil(distanceTiles × 6)`.
- For a concrete but unverified origin, measure distance from the casting
  player's central King Tower center to the chosen impact point. Keep cast
  activation as a separate explicit estimate; the existing two-tick value
  may be retained as a prototype default, but the source does not verify it.
- Apply the publisher-supported one-tile displacement to hostile troop
  victims selected by the estimated blast rules. Use `ignore_pushback=true`
  as the versioned immunity gate, consistent with Giant and P.E.K.K.A, and
  leave structures/towers stationary. Do not scale distance by `mass`; no
  mass-to-distance rule is evidenced.
- State boundary order and interruption behavior as runtime policy. One
  deterministic option is commands first, then impact damage/death, then
  displacement of surviving eligible troops. Neither that ordering nor
  whether a pre-impact interruption cancels the spell is established by the
  pinned row or the publisher notes.

This policy gives the runtime a concrete, replaceable estimate while keeping
activation, launch origin, speed conversion, target eligibility, and event
ordering visibly distinct from source-backed facts. The supplement does not
promote any of those estimates into the common-session evidence receipt.
