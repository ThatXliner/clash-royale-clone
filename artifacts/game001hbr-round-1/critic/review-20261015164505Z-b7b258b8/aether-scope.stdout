# Aether Well full raw-signature scope

## Result and evidence boundary

The pinned comparison signature is one roster row and one building-constants row: 9 and 279 stored fields, respectively. Their complete ordered values, including every `null`, `false`, and numeric zero, are in [pinned-linked-rows.json](pinned-linked-rows.json). The pinned query and source-byte receipts are in [extractor.py](extractor.py) and [source-receipts.json](source-receipts.json). Only `cards.json` and `cards_stats_building.json` were retrieved; no gameplay, artwork, or other source tables were fetched.

This is a field-scope result from the pinned 2023-02-18 datamine. It records which values exist and how the rows join. It does not establish consumers, behavior, historical parity, or full-role eligibility. Zero, `false`, and `null` values are preserved as raw values and are not treated as proof that a mechanic is absent.

## Identity and join

The local resource catalog identifies its synthetic card as `aether-well` / “Aether Well.” Its corpus record marks cost 6 authoritative at high confidence and hit points / deploy time unverified. The pinned roster selects the unique `key=elixir-collector` card row (id `27000007`, type `Building`, rarity `Rare`, cost 6). The building table has no key on the selected stats row, so the extractor joins by `name_en` matching the card display name and rarity matching case-insensitively. Five building rows share that English name; exactly one shares `Rare` rarity. The selected stats row's internal name is `ElixirCollector` and its `key` is `null`.

Thus the cost and roster identity mapping have high-confidence support. The local `uncommon` rarity is the intended semantic alias for pinned `Rare`: `tests/cards-basic-melee.test.js` maps `rare` to `uncommon` in `MECHANIC_FIELDS` (with the same common-to-standard and epic-to-special normalization). Literal card identity labels are intentionally synthetic (`aether-well` / “Aether Well” locally, `elixir-collector` / “Elixir Collector” in the comparison source). The normalized local corpus marks the matched 1,070 HP and 1-second deploy values unverified, even though the pinned row contains 1,070 at its Rare level-11 index and `deploy_time=1000` ms. Keep those stat fields unverified per [SOURCES.md](../../../reference/stats/SOURCES.md).

## Resource and lifecycle fields

| Pinned raw field | Stored value | Existing local Aether Q | Scope result |
| --- | ---: | ---: | --- |
| `mana_collect_amount` | 1 | `generationAmount=1` | Same literal amount; source consumer semantics remain open. |
| `mana_generate_time_ms` | 9,000 ms | `generationCadenceTicks=510` | The repository uses 60 ticks/second, so the raw time converts numerically to 540 ticks; local Q uses 510 ticks. The raw row does not establish cadence anchor, first pulse, or timer reset behavior. |
| `life_time` | 65,000 ms | `lifetimeTicks=4,200` | At 60 ticks/second this is 3,900 ticks versus the local Q's 4,200. Expiry boundary and its ordering with generation remain unresolved. |
| `mana_generate_limit` | 0 | Local `ElixirMatch` capacity 10 | Preserve the zero literally. It does not establish unlimited output, a capacity, or how a generation limit interacts with the match cap. |
| `mana_on_death` | 1 | No resource-on-death path | A nonzero death-associated resource field is present. The local resource path only emits scheduled grants while alive; it emits no separate resource grant for combat destruction or expiry. This is a missing mechanic foundation for any full-role claim until the raw field's consumer, recipient, trigger, and payout are resolved. |
| `mana_on_death_for_opponent` | 0 | No corresponding field | Preserve the zero; its meaning and interaction with ownership remain open. |
| `deploy_time` | 1,000 ms | `deployTicks=60` | Same numeric duration under the repository's 60 ticks/second convention; source confidence is still unverified. |
| Roster `description` | Stored in full card row | Local Q emits eight periodic one-unit grants at ticks 510 through 4,080 | The pinned description separately claims eight Elixir across the lifetime. An equal local total does not settle the source's interval, death-associated field, or grant sequence. The full text is retained only in this reference artifact. |

The local session implementation anchors `age` to `placedTick`, deploys at the configured age, and grants when an alive, deployed building reaches a positive cadence multiple. Its Q policy sets same-tick command order, placement, owner-side grant, capacity, simultaneous order, expiry, and generation boundaries. The raw selected rows contain no corresponding explicit placement mask, side-ownership policy, cap/order policy, cadence anchor/reset rule, or damage-reset rule. `capturable_building=false`, `collision_radius=1000`, and zero deployment-size overrides are present as raw values; their consumers are not inferred here. The source row's `hitpoints`, level array, `damage`, and `death_damage` are retained in full; local damage/destruction does not add the raw nonzero `mana_on_death` value to the resource loop.

The timing and death fields make the current Q values unsuitable as historical calibration. They do not by themselves invalidate a narrowly labeled provisional local-Q admission. They do block calling that admission a complete Aether Well role.

## Other stored behavior-shaped fields and links

The complete 279-field row and its zero-based field-index map are in the JSON artifact. Among its other behavior-shaped values, `hitpoints=505` has `hitpoints_per_level[8]=1070`; `speed`, attack damage, attack ranges, attack flags, lifetime/deployment offsets, target restrictions, collision/placement dimensions, spawn/death-spawn fields, ability/buff/effect/projectile fields, and flags are all preserved exactly, including zero/false/null values. No absent mechanic is inferred from those defaults.

The link-name screen enumerates all fields containing `ability`, `area_object`, `buff`, `character`, `clone`, `effect`, `export_name`, `filter`, `mesh`, `projectile`, `resurrect`, or `swf`. Every structured projectile, character, effect, buff, ability, spawn, and death-spawn candidate is null or a stored default; no non-null candidate resolves to another JSON row. The three non-null `prestige_*` strings are raw visual asset references, recorded without fetching any assets. No additional linked row is required for this signature.

Counts for the selected building row are 279 total fields: 70 null, 57 false, 137 numeric zero, 8 numeric nonzero, one array, and no true values. The full row retains all those values. The roster row has 9 fields. Source files contain 112 roster rows and 62 building rows, but only the selected two rows are written to this artifact.

## Next evidence needed for a full-role decision

Resolve the resource behavior encoded by the named `mana_*` fields against independent, dated evidence or calibrated gameplay: periodic amount and interval, initial anchor and timer reset, total lifetime output, death-associated amount and recipient, expiry versus combat destruction, damage interactions, and relationship to the match cap. Then align local lifetime/cadence and ownership, placement, same-tick ordering, and cap policies with that evidence. Until then, keep those rules as explicit local QUESTION and describe any future admission as provisional.

No product code, tests, PLAN.md, round evidence, progress view, index, or reference corpus was changed. No tests or game runs were performed.
