# Pre-Evolutions Clash Royale reference

This directory is a comparison corpus for a clone that uses original names and original art. Nothing here is intended to be copied into shipped game content.

## Contents

- `stats/cards.json` — 109 collectible cards from the last RoyaleAPI constants snapshot before March 2023, normalized to displayed tournament level 11.
- `stats/towers.json` — level-11 King and Princess Tower combat values.
- `stats/arena.json` — 18x32 playfield, approximate tower/bridge placement, deployment rules, elixir phases, and match timing.
- `stats/SCHEMA.md` — exact field meanings, units, nullability, and mixed-card behavior.
- `stats/SOURCES.md` — dated source ledger, normalization decisions, confidence, and limitations.
- `stats/validate.py` — strict schema/value validator with 10 hardcoded spot checks.
- `footage/NEEDED.md` — an 18-shot manifest for legally obtained gameplay comparison footage.

Run:

```sh
python3 reference/stats/validate.py
```

## What is trusted

- The roster cutoff is pinned to RoyaleAPI commit `54fdef52c5086393b085f57faeeab8ef86b28160` from 2023-02-18.
- The standard collectible roster count is 109 after excluding three temporary event cards.
- Names, IDs, types, rarities, elixir costs, and displayed tournament level 11 have high confidence.
- Datamine combat fields have medium-high single-source confidence and preserve raw timing/range semantics.
- Tower HP/damage/hit speed/range, 18x32 dimensions, elixir tick rates, and 3-minute + 2-minute match timing have strong independent support.
- Every non-null card mechanic that was not independently corroborated is named in that card's `unverified_fields`; approximate arena claims are likewise flagged.

## What still needs work

- No gameplay stills or clips are redistributed here. Capture or license the items in `footage/NEEDED.md`.
- Tower and bridge coordinates are screenshot-derived approximations, not collision-authoritative coordinates.
- The exact per-cell deployment masks before and after tower destruction remain to be traced from calibrated captures.
- `first_hit_seconds` is the datamine `load_time`; observed animation-to-contact timing can differ and should be checked against 60 fps footage.
- Components do not recursively enumerate every death spawn, periodic summon, shield, transform, charge/dash state, Champion ability, buff, lifetime, or crown-tower damage multiplier.
- Current wiki pages contain later balance history. The corpus intentionally prefers the pinned February 2023 dump and flags fields lacking a second historical check.

Treat `cards.json` and `towers.json` as a strong numeric baseline, `arena.json` as a mixture of strong rules and explicitly approximate geometry, and the missing footage as required before making pixel- or frame-level fidelity claims.

## Implementation guidance

Missing footage is **not a blocker** for building the core simulation. For an initial implementation, use the flagged arena coordinates, deployment boundaries, first-hit timings, projectile timings, collision sizes, and other uncertain mechanics as reasonable estimates.

Keep those values centralized and configurable so they can be tuned later without restructuring game logic. Gameplay captures become important only when calibrating visual fidelity, collision/pathing edge cases, or frame-level timing. The footage manifest is therefore a later verification checklist, not a prerequisite for starting development.
