# Damage value provenance gap

The Kilnkeeper ordinary card row and source-admission receipt contain `damage: 281`, and the focused impact tests assert that exact value. The builder scope ties 281 to the pinned RoyaleAPI projectile row `chr_wizardProjectile` at commit `54fdef52c5086393b085f57faeeab8ef86b28160`, where `damage_per_level[8] = 281` (Rare tournament level 11). The runtime source-confidence policy does not close that link: `src/shared/session-troop-source-confidence-authority.js` includes `damage` among generic question fields, while its Kilnkeeper projectile-specific field list binds radius, raw speed, homing, target classes, and character area radius but omits projectile damage. Consequently `kilnkeeper.damage` is emitted as an unverified question with the default `runtime-playability-estimate-not-comparison-corpus` provenance. The executable projectile facts do not include a damage field or a binding from the catalog's `damage: 281` claim to `chr_wizardProjectile`.

Relevant evidence:

- [`scope.md`](../../cards019-scope/builder/scope.md) states the intended raw `damage_per_level[8]` value and source row.
- Candidate `src/content/cards/ordinary-projectile-splash.js` stores `damage: 281`.
- Candidate `src/content/session-troop-projectile-source-admission.js` repeats the value in the ordinary card source record, but that receipt is not a projectile-row binding.
- Candidate `src/shared/session-troop-source-confidence-authority.js` gives `damage` the generic question path and does not list projectile damage among Kilnkeeper's pinned projectile source fields.
- `tests/game-roster-troops-ordinary.test.js:342–350` accepts the generic source for `kilnkeeper.damage`; impact tests confirm the runtime applies 281, but behavior correctness does not establish source provenance.

Treat 281 as a provenance question until the canonical source receipt carries and validates the exact projectile-row fact (or the value is represented as an explicit unresolved question). This is a closure gap between the claimed authoritative value and its executable source proof, not a gameplay mismatch inferred from a low-confidence reference datum.
