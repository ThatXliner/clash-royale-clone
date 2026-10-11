# CARDS-016K core evidence

This round adds two original session-catalog air-swarm identities while preserving the editable deck at 16 cards. The core session source manifest now admits 55 card IDs across 60 source occurrences; the two new IDs remain rejected by both `createEditableDeckWitness` and `RLEnvironment`.

## Source record and confidence

The pinned comparison snapshot is RoyaleAPI commit [`54fdef52c5086393b085f57faeeab8ef86b28160`](https://github.com/RoyaleAPI/cr-api-data/tree/54fdef52c5086393b085f57faeeab8ef86b28160), dated 2023-02-18, as identified in `reference/stats/SOURCES.md`. The card roster entries are Bats (`26000049`, 2 elixir, Common) and Minion Horde (`26000022`, 5 elixir, Common). Their recorded troop values are:

| Original identity | Count | HP | damage | hit cadence | first hit | deploy | range | sight | speed | targets |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Gloamwing Cluster | 5 | 81 | 81 | 78 ticks | 42 ticks | 60 ticks | 1,200 | 5,500 | 2,000 | ground + air |
| Coppershade Flock | 6 | 230 | 117 | 60 ticks | 30 ticks | 60 ticks | 1,600 | 5,500 | 1,500 | ground + air |

The distance and speed values are millitiles and millitiles/second. `cards.json` marks HP, damage, attack timing, deploy time, range, sight, speed, targets, and count unverified for both source cards; these are datamine-backed comparisons, not independently corroborated facts. Card identity, elixir, and rarity are roster-backed. Coppershade’s `MinionSpit` projectile identity is source-backed by the pinned projectile/troop records and its exact source tuple; projectile speed conversion remains a QUESTION. Bats has no pinned projectile record, so Gloamwing’s melee classification is a runtime estimate and is explicitly excluded from source-backed projectile claims.

The pinned troop rows also contain `summon_radius` values of 750 (Bats) and 600 (Minion Horde) and `summon_deploy_delay` of 100 ms. The source does not establish whether that delay applies per member or to the squad as a whole, nor does this round establish the units/meaning of radius for formation parity. The existing session runtime materializes all members in one typed deployment event and uses its generic deterministic formation with the existing 300-millitile member-radius estimate. These values are not silently translated into historical stagger or formation claims; reproducing source-specific deployment timing and formation remains the largest parity gap.

Both cards carry explicit air-layer QUESTIONS; both carry body-radius QUESTIONS. Gloamwing also retains a delivery QUESTION. Coppershade’s projectile speed is a QUESTION, while its projectile delivery is admitted from the exact source claim. No source files or reference assets are bundled.

## Runtime proof

`tests/game-roster-troops-air-swarms.test.js` exercises public `GameSession` setup and commands. It checks each exact card projection, typed south deployment plus seeded north AI deployment, entity count and runtime stats, elixir spend, deck-cycle sequence, deterministic AI choice with both swarms in hand, ground/air damage interactions, and byte-exact snapshot restore and continuation with a live projectile and after a death. It also asserts the existing editable 16-card list and rejects both new identities through the editable and RL deck boundary.

## Verification

- An initial six-file run was **77/80** and exposed three stale fixture expectations: the exact integration registry omitted the already-existing ordinary-squad catalog and new Gloamwing occurrence; the projectile drift matrix expected 17 rather than 18 bound rows; and the canonical serialization fixture expected the old 67,734-character manifest. Each exact fixture was updated, with no runtime admission or assertion weakening. The original run is retained as `scoped-session-preflight.log`.
- `node --test tests/game-roster-admission.test.js tests/game-roster-troops-projectile-profiles.test.js` — **33/33 passed**, exit 0, 87,879.5 ms. This covers the strict integration occurrence registry, source authority, scalar drift rejection, exact manifest serialization, and canonical hash.
- `node --test tests/cards-swarms.test.js tests/game-roster-admission.test.js tests/game-roster-troop-profiles.test.js tests/game-roster-troops-ordinary.test.js tests/game-roster-troops-projectile-profiles.test.js tests/game-roster-troops-air-swarms.test.js` — **80/80 passed**, exit 0, 88,641.3 ms.
- Projectile profile canonical serialization — 67,953 characters; SHA-256 `086c2826bceff46d8ec96089a1a66132d5cc14d90f19f0ecc36eae7d2f60cfb2`.

Full 18,000-tick endurance was not run for this core change. Selection/UI admission is intentionally deferred to ART-016 and CARDS-016I; this evidence does not claim those flows or full pre-Evolution roster parity.

## Original lore

Gloamwings lift from the marsh reeds at dusk, following stray emberseeds along the riverbank. Five violet lights wheel together when a bell rings across the ferry docks.

Coppershades are workshop gliders that learned to hover before their makers found a way to land them. They trade tiny sparks through the mist whenever anyone disturbs their scrap-metal roost.
