# CARDS-019K builder scope: ordinary mobile ranged splash

## Recommendation

Build the smallest real ordinary-projectile AoE path through `GameSession`: one original shipped ground ranged unit with one single-shot projectile that can hit ground and air enemies. Use the pinned Wizard → `chr_wizardProjectile` record only as the historical mechanics source; retain an original identity, name, art, and card text in the product. Do not copy reference assets or card identity.

No current original troop catalog entry supplies this exact mechanic. The existing ordinary projectile catalog has three single-projectile cards and all have null splash radius. The other troop radius entries are special melee effects (`bone-regent`, `stonevault`) or Scatterguard’s fan pellets, so adapting those would not test a normal impact-centered splash. The linked Wizard projectile is the narrowest pre-2023 source-backed single-shot profile: its character has no custom first shot, volley, special projectile, or multi-target attack.

The implementation boundary is `LiveBattle` in `battle-continuation-kernel.js`: a projectile impact with a QUESTION radius applies its projectile damage to each currently alive enemy troop in that radius, filtering by the source projectile’s air/ground eligibility. Resolve against the existing impact point/locked target position used by the current straight-flight model; do not add homing, interception, pierce, chaining, a second simulator, or a special-only continuation reducer. Keep same-side troops out, prevent double damage to the primary target, and leave crown-tower/external structure contact on its existing path. Persist pending-projectile radius and target-layer data so snapshot, restore, and fork replay produce identical bytes and outcomes.

The raw source says the Wizard projectile is homing. The current ordinary projectile path is a straight flight to a locked impact point; this increment must state that as an explicit runtime QUESTION/known model limit rather than claim homing parity. A separate projectile-motion piece can address homing later.

## Pinned source receipt and confidence

All source links below resolve to commit `54fdef52c5086393b085f57faeeab8ef86b28160`, the 2023-02-18 snapshot identified in `reference/stats/SOURCES.md`.

- Character row: [cards_stats_characters.json, Wizard, lines 5362–5404](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L5362-L5404). It links `projectile: "chr_wizardProjectile"`, has `multiple_projectiles: 0`, `multiple_targets: 0`, `range: 5500`, `attacks_ground: true`, `attacks_air: true`, and `area_damage_radius: 0`. Its `damage: 0` is not the unit’s attack damage: use the linked projectile row.
- Linked projectile row: [cards_stats_projectile.json, `chr_wizardProjectile`, lines 998–1039](https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json#L998-L1039). It records `damage_per_level[8] = 281` (Rare tournament level 11), `radius: 1500`, `aoe_to_air: true`, `aoe_to_ground: true`, `only_enemies: true`, and `speed: 600`, `homing: true`.
- Retrieved raw-file SHA-256 receipts: characters `37734d1508584e43851395c01b2d10046667eb6dc27daef37e5df56e74f933ac`; projectiles `c883516f54f6c17ee77c15cf484b01da9ded22602214c3b0d42b1ab823bd3197`.

Confidence is bounded. `SOURCES.md` rates the pinned datamine medium-high as a historical source but says per-card mechanics require second-source checks listed in `cards.json.unverified_fields`; this Wizard profile is not independently corroborated. The normalized comparison row has `area_damage_radius_tiles: null`, while the raw character row says `area_damage_radius: 0` and the linked projectile row says `radius: 1500`. That is a real semantic/mapping gap, not authority to certify a splash value. Keep `1500` as an explicit, source-receipted QUESTION value used by the test runtime, with a named question key and provenance in serialized setup/profile. Do not rewrite the normalized card radius as authoritative. The raw projectile speed `600` also has no documented conversion to the runtime’s `millitiles per tick`; retain speed as an explicit QUESTION and do not silently map `600` to the current runtime estimate. The source’s `homing: true` versus the current locked straight-flight model is another declared gap.

## Exact builder-owned core files

1. `src/content/cards/ordinary-projectile-squads.js` — add the one-member ordinary projectile source row under an original shipped identity.
2. `src/shared/ordinary-projectile-delivery-authority.js` — admit the exact card/component occurrence and its single-shot delivery policy.
3. `src/content/session-troop-projectile-source-admission.js` — bind the new card/component to its raw linked-projectile source receipt and bounded field values.
4. `src/content/session-troop-projectile-profiles.js` — extend exact catalog/claim counts and validate the joined profile.
5. `src/shared/session-troop-source-confidence-authority.js` — add explicit, exact provenance support for a source-question splash-radius field; preserve the unresolved status.
6. `src/content/session-troop-roster.js` — project the profile into normal setup, expose its radius as a QUESTION record, and admit the card in the editable deck pool.
7. `src/sim/battle-continuation-kernel.js` — carry radius/layer eligibility in each ordinary projectile, resolve impact-centered splash in `LiveBattle`, and include the pending/damaged facts in serialization and validation.

Existing `src/content/editable-deck.js` already routes mixed editable decks through `createEditableGameSessionSetup`; `src/rl/environment.js` already uses that setup for custom decks. Avoid editing either unless a focused test exposes a missing seam. `EDITABLE_DECK_CARD_IDS` must remain the admission boundary and normal eight-card deck size must remain unchanged. Default `PLAYABLE_CARD_IDS` setup bytes must remain byte-identical.

## Interaction tests and existing callers

Add or extend these focused suites; the benchmark is running, so this scout did not execute tests:

- `tests/game-roster-troops-projectile-profiles.test.js`: exact raw receipt/linkage and catalog admission; damage 281 is sourced through the Rare level-11 projectile row; radius and speed remain QUESTION-backed; invalid/missing source claim rejects.
- `tests/game-roster-troops-projectile.test.js`: deploy through real `GameSession`; one hit damages primary and a nearby enemy within the Q radius exactly once; a target just outside does not; ground and air victims are both eligible; same-side and dead units are excluded; projectile contact still uses the established external tower path. Cover inclusive boundary and deterministic victim order.
- `tests/editable-deck.test.js`: the new ID can be selected in a valid unique eight-card custom deck, spends elixir once, cycles once, restores with the same setup, and leaves default-eight serialized bytes unchanged.
- `tests/rl-environment.test.js`: custom deck can select/deploy the new card through normal action masks and observation, then reset/restore/replay deterministically; no RL-specific combat implementation.
- In the projectile interaction suite, compare a pending projectile and a post-impact session across serialize/restore and fork; assert exact histories/bytes and no duplicate primary damage.

Call chain: editable deck → `createEditableGameSessionSetup` → `GameSession` → `LiveBattle`; the RL custom-deck constructor calls the same editable setup. The browser editor reads the mixed editable card list, but visual presentation/art/portrait should remain a separate piece after this engine slice.

## Caps and guardrails

`LiveBattle` caps units at 1,024; the battle-combat boundary caps external entries at 1,024; the generic source catalog limits a card to 16 components; editable decks contain exactly eight unique cards. Splash victim discovery should scan the bounded live-unit collection in stable entity order at impact and produce bounded results—no unbounded per-projectile victim buffer. Keep integer millitile geometry and deterministic ordering. Preserve existing projectile IDs, histories, event caps, admission receipts, and structural validation. Do not import from `reference/`, expose real-game names, claim parity from the raw datamine, or broaden this card slice into a replacement simulator.
