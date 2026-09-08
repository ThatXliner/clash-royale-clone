# Squall catalog reuse and mechanic evidence

Inspection and execution on2026-09-07 show that four catalog exports return
byte-identical one-card arrays:

- createKnockbackSpecialCatalog defines Squall Orb.
- createInstantSpellCatalog returns createKnockbackSpecialCatalog().
- createTravelingLineSpellCatalog returns createInstantSpellCatalog().
- createReturningSpellCatalog returns createTravelingLineSpellCatalog().

The common record is an effect costing4, damage689, radius2500 and target
mode ground-and-air. `tests/spells-instant.test.js` maps that record to the
reference Fireball card. The pinned
[projectile row](https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json)
contains damage_per_level[8]=689, radius2500, pushback1000,
crown_tower_damage_percent=-70 and check_collisions=false. The existing
knockback fixture instead uses an explicitly QUESTION displacement2000.
Raw speed600 and gravity50 are not converted here into travel time.

The returning encounter explicitly labels its composition
`unsourced-returning-traveling-spell-composition`. It obtains return damage,
leg contact, turning and completion from the generic ReturnEncounter fixture.
The executed `npm test -- spells-return` passes15/15, including its first test
that labels corpus-absent policies QUESTION. This proves the generic fixture
is deterministic; it does not establish returning behavior for the mapped
card.

Consequently, catalog occurrence coverage must remain separate from card
composition coverage. Four repeated exports are four integration-test
contexts, not evidence of four sequential phases of a playable card. This
does not remove any exported occurrence from the accounting or certify a
card profile. No present evidence authorizes the returning fixture as an
executable part of Squall's card composition.

GAME-001HSQ should resolve its explicit phases/variants/contexts question from
this distinction and independently source the real card's activation,
travel, impact, displacement eligibility/order and damage policy. The generic
return fixture can remain tested without being counted as a sourced card
mechanic. Common-session admission remains unchanged until that receipt is
complete.
