# Confidence boundary finding

**Concrete gap:** the low-confidence source-derived combat values are executable in the typed session roster but do not carry per-field `QUESTION` policy or source-confidence metadata into the session witness. The prose receipt labels them unverified; the runtime setup that consumes them does not.

The CARDS-016K acceptance row in `PLAN.md` requires “confidence QUESTIONS explicit.” `reference/stats/SOURCES.md` says `cards.json.unverified_fields` marks each non-null mechanic that was not corroborated and must not be mistaken for two-source verification. For both comparison cards, the runtime projection exactly matches the pinned datamine for HP, damage, hit cadence, first-hit timing, deploy time, range, sight, movement speed, target mode, and count. Those are all flagged unverified in the source rows. The probe records these matches and flags in `session-probes.json`; a match to a low-confidence datamine is not independent validation.

The session witness has only these card-specific question keys:

- Gloamwing: `gloamwing.body-radius-millitiles`, `gloamwing.delivery`, `gloamwing.layer`.
- Coppershade: `coppershade.body-radius-millitiles`, `coppershade.layer`, `coppershade.projectile-speed-millitiles-per-tick`.

Consequently, HP, damage, cadence, first-hit timing, deploy time, range, sight, movement speed, targets, and count are absent from the typed question closure for both runtime profiles. Identity, cost, type, and rarity are roster-backed; the missing confidence applies to the mechanic values, not those identity fields. Coppershade's `MinionSpit` delivery source binding is separately verified and Gloamwing delivery remains a question.

This is a confidence-contract gap, not evidence that a numeric value differs from the historical source. Keep the values as estimates/questions until the runtime witness can preserve their source confidence. Do not claim historical stat parity from the projection or the target-trade probes.
