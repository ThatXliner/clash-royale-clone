# Cinder Reliquary full-signature scope — join blocked

**Disposition: BLOCKED / raw signature not closed.** The baseline tests do not provide a historical card-key binding for the synthetic Cinder Reliquary. The test that names a benchmark expressly asserts that its historical key is not Cinder's ID. I stopped before querying a candidate source row, so this packet makes no raw-field absence, numeric-parity, or historical-completeness claim.

## Boundary and source baseline

This audit is against repository commit `72ab799248c287644a60aceaf80ec61e2cde5a7c`. It is artifact-only and read-only with respect to product code, PLAN, rounds, and progress. It did not run gameplay or tests.

`reference/stats/SOURCES.md` pins the historical RoyaleAPI data to commit `54fdef52c5086393b085f57faeeab8ef86b28160`, dated 2023-02-18 (SOURCES.md lines 20–24). It says death damage and crown-tower damage multipliers are outside the common schema (line 43). It also says raw `null` values mean “not applicable/not safely expressible,” not an unverified numeric claim (line 38). These statements explain why the normalized corpus cannot fill the effect signature by itself; they do not select a raw row for Cinder.

## Identity and join evidence

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| `src/content/cards/death-effects.js:3–20` | A local catalog fixture named `cinder-reliquary` / “Cinder Reliquary”, with local ordinary building fields. | A matching historical card key or any source values for those fields. |
| `tests/death-effects.test.js:105–120` | The identity test selects the normalized `Giant Skeleton` row as `protectedBenchmark`; it asserts that row has no `death_damage` property and that `card.id === protectedBenchmark.key` is false. | A Cinder → Giant Skeleton mapping. The tested relation is explicitly a non-match. |
| `src/content/session-card-catalog.js:42,117–128` | The synthetic ID is admitted into the local session catalog and given a building-runtime projection. | A historical source join. |
| `tests/game-roster-buildings.test.js:393–430` | A local session fixture exercises Cinder death from combat contact and emits local death-effect events. | Historical identity, source-backed damage, or source-backed delivery timing. |

The repository search in the pinned baseline found no other Cinder-to-historical-key binding in `src`, `tests`, or `reference/stats/SOURCES.md`. In particular, the test-only Giant Skeleton reference is not a usable join key. No name-based guess (including a building with a seemingly similar role) is accepted as a substitute.

## Local active fields and source disposition

The following values describe the local synthetic fixture only. Since no historical row is selected, every historical provenance/confidence disposition remains **unknown / unjoined**.

| Local field group | Local record | Local consumer status | Historical source disposition |
| --- | --- | --- | --- |
| Ordinary catalog fields | `cost=4`, `count=1`, `damage=160`, `deployTimeTicks=60`, `firstHitTicks=60`, `hitSpeedTicks=120`, `hitpoints=1200`, `rangeMillitiles=4500`, `sightRangeMillitiles=5500`, `targetMode=ground`; plus synthetic identity, structure kind, stationary movement, null area radius and empty components. | Projected into a session building profile by `session-card-catalog.js:117–128`; local tests distinguish ordinary `damage=160` from death damage. | No source row, confidence flags, or numeric match assigned. These must not be presented as Cinder historical stats. |
| Death trigger | One instantaneous area-damage trigger for an effect-bearing death. | Closed local QUESTION value in `death-effects.js:30–44`; shared session tests exercise combat-damage death. | Trigger conditions, event point, and eligible source types are unjoined. |
| Death damage | `200` local units. | Closed local QUESTION record; live building policy carries it as `deathDamage`, and the session test records a local hit. | No historical damage value or scaling established. |
| Area radius | `2000` local millitiles. | Closed local QUESTION record; isolated encounter tests exercise inclusive circular overlap and local target filters. | No historical radius, center, collision expansion, or spatial rule established. |
| Crown-tower modifier | `{numerator:35, denominator:100}` local. | Closed local QUESTION record; local policy test turns 200 into a 70-damage tower intent. | No historical fraction, stage, rounding, or tower classification established. |
| Delivery timing | Local roster test emits the death-effect hit at tick 479 and the downstream damage event at tick 480. | Executable local behavior. The local profile has no source-backed delivery-delay field. | Historical delay/delivery mechanism unknown; the local one-tick transition is not source evidence. |
| Combat death versus expiry | Local question says only combat-damage deaths trigger; isolated fixture includes `expiry` and tests that it does not trigger. | Closed local QUESTION behavior in `death-effects.js` and `tests/death-effects.test.js:275–291`. | Historical trigger distinction unknown. Cinder's shared roster test covers combat death only. |
| Eligibility, ordering, chaining, source inclusion, recursion, and caps | Exact local QUESTION values are in `death-effects.js:30–51`. | Local isolated encounter consumes them; only damage/radius/tower modifier are forwarded into the live session building policy. | No historical source mappings. Their local explicitness does not make them historical facts. |
| Projectile/spawn links and other engine-facing fields | No selected source row to inspect. | Not established by the Cinder catalog's empty `components` array. | Projectile, spawn, self-center, target-filter, collision, mass, and any other active raw fields remain unknown. No `null`/zero/false absence inference is made. |

## Query and extraction record

The pinned source URLs and commit are recorded in the machine-readable receipt, but **no HTTP request or source-table selector was executed**: the required identity precondition failed. Consequently there are no source row counts, raw file hashes, linked-row artifact, or extractor result to report. This is an intentional stop, not a fetch failure or an empty-row result. The next extraction must first receive an explicit, test-backed synthetic-ID → historical-key (and, if applicable, linked building/projectile/spawn) mapping. Then it can preserve the complete ordered rows, all defaults and nulls, upstream file bytes/hash, selector counts, and each active field's local-consumer disposition.

## Actionability

- **Raw signature closed?** No.
- **Exact historical numeric facts for Cinder confirmed?** None. The local 200 damage, 2000 radius, and 35% tower modifier remain QUESTION values; the ordinary synthetic profile values also lack a proven historical join.
- **Smallest next judgable step:** establish an explicit fixture/test mapping from `cinder-reliquary` to a historical card key, or deliberately keep Cinder generic-only and choose a directly source-bound card for a historical mechanic claim. Once the mapping exists, extract and disposition the complete card/building row plus only the linked projectile/spawn rows actually referenced by its selected active pointers. No source field may be declared absent from a `null`, `false`, zero, or omitted normalized field alone.
