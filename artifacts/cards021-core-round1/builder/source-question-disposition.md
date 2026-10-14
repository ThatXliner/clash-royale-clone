# Existing Buried Coil source disposition

The existing original-product profile is admitted through
`src/content/cards/buildings-defensive.js` and projected by
`src/content/session-card-catalog.js`. Its 4-elixir identity/cost record is
high confidence. The existing defensive combat fields, including 230 damage,
60 deploy ticks, 42 first-hit ticks, 72 attack cadence, 1,152 hitpoints,
5,500 range, `air_and_ground`, and 1,800-tick lifetime, remain runtime
estimates/QUESTIONS with `authoritative: false` and `confidence: unverified`.
`src/sim/session-building-runtime.js` consumes those estimates for current
playability; that is not evidence of historical parity. RL exposes the raw
target mode and its separate lifetime QUESTION in `src/rl/environment.js`.

The source archive available to this task is
`artifacts/next-roster-role-scope/builder/source-evidence.json`, pinned to
reference revision `54fdef52c5086393b085f57faeeab8ef86b28160`. It records the
Tesla building raw row as 353 fields, `summon_character: Tesla` with no
matching character/troop row, and null direct projectile, buff, and ability
links. Tesla (`id: 27000006`, `key: tesla`) is only a proposed comparator:
the current mapping declares no Buried Coil comparator. No identity binding,
raw field, art, text, or other reference data was added to the runtime.
