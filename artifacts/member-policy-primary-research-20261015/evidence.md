# Character member-policy primary-source check

Read-only research against accepted repository HEAD `d4189db53037872065dfb057d77f3d8da9355660` (2026-10-15). I read `reference/stats/SOURCES.md`, the relevant `PLAN.md` rows, and the committed CARDS-020K / GAME-001CHS scope notes with `git show HEAD:`. No product code, stats, plan rows, or shared indexes were changed. No tests or gameplay/browser runs were made.

## Pinned raw facts and current gate

The repository pins RoyaleAPI constants commit [`54fdef52c5086393b085f57faeeab8ef86b28160`](https://github.com/RoyaleAPI/cr-api-data/commit/54fdef52c5086393b085f57faeeab8ef86b28160), dated 2023-02-18. The local source ledger calls character constants a datamine snapshot and says raw times are milliseconds and distances are thousandths of a tile. Its 020K scope records `AngryBarbarian` as `speed=90`, `walking_speed_tweak_percentage=-20`, character `deploy_delay=400`, `collision_radius=500`, and `mass=4`; the same four non-base fields appear on the pinned `Barbarian` and `RageBarbarian` rows. These are raw-export facts, not consumer semantics.

`PLAN.md` still marks GAME-001CHS QUESTION, GAME-001CHR BLOCKED, and CARDS-020K BLOCKED. The ordinary `Barbarians` and `Elite Barbarians` normalized rows retain the same 11 `unverified_fields` (HP, damage, hit cadence, first hit, deploy time, range, sight, movement values, targets, and count); this research does not corroborate or change those flags.

## New official evidence

- **Mass, qualitative only — Supercell, 2019-04-01.** The [official balance note](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-update-coming-4-1-2/) says Giant Skeleton “Mass increased 15 -> 18 (harder to move/push).” This is pre-cutoff evidence that Supercell used a balance stat named Mass and described an increase as making a troop harder to move or push. It narrows the field's likely qualitative role, but does not provide the raw-export crosswalk, units, formula, thresholds, or behavior for value `4`. Keep mass `4` unresolved for execution; do not invent a pushback scale.

- **Elite Barbarian startup, field binding unresolved — Supercell, 2017-04-19.** The [official balance note](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-coming-3/) says Elite Barbarians' “initial attack comes 0.1sec slower.” This confirms that initial-attack timing was a separately discussed mechanic for the card. It does not name the character `deploy_delay` field, identify its event boundary, or link the historical 0.1-second adjustment to the pinned 2023 value `400`; it cannot justify equating that value with first hit, spawn, readiness, or animation.

- **Member spacing only — Supercell, 2020-06-02.** The [official Italian release note](https://supercell.com/en/games/clashroyale/it/blog/release-notes/modifiche-di-bilanciamento-della-stagione-12/) says cards with two or more troops deploy with “0,1 secondi l’una dall’altra” and lists Elite Barbarians. This supports the troop-level `summon_deploy_delay=100` as a 100 ms gap between members. It says nothing about the separate character `deploy_delay=400` or the first member's onset. This evidence was already reflected in the committed scope and does not change that gate.

- **Collision-radius terminology is post-cutoff.** A [Supercell note dated 2026-05-04](https://supercell.com/en/games/clashroyale/blog/release-notes/may-balance-changes-2026/) reports Giant Skeleton Collision Radius `1 tile -> 0.75 tiles`. It is outside the required pre-March-2023 version and does not connect the 2023 raw field `collision_radius=500` to contact, path spacing, targeting, formation, or a historical tile conversion. I found no pre-cutoff official definition in the bounded official-site searches; do not use this 2026 change to resolve the pinned value.

## Disposition

The 100 ms member interval remains the only resolved runtime boundary. The 2019 Mass note adds a qualitative clue (larger mass means harder to move/push), but leaves `mass=4` behavior and the field-to-export mapping insufficiently specified for a numeric runtime rule. The 2017 initial-attack note does not bind to `deploy_delay=400`. The `walking_speed_tweak_percentage=-20` baseline/effect and `collision_radius=500` consumer/use remain undefined by dated pre-cutoff primary evidence. The 2026 collision-radius note is explicitly out of scope.

Accordingly GAME-001CHS remains QUESTION, GAME-001CHR and CARDS-020K remain blocked, and no existing normalized card or per-field confidence flag should be promoted from this evidence. No fan-wiki interpretation was used. The bounded official-source searches found the 2017, 2019, and 2020 notes above plus the out-of-cutoff 2026 collision-radius note; they did not find a primary consumer or definition for the raw walk tweak, character delay, or 2023 collision-radius field.
