# Rationale

## Problem

A chain hop must be a real LiveBattle contact, yet three existing owners apply health: BattleCombat for units, CrownTowerBattle for crown towers, and LiveBattle.#damageStructure() for custom buildings. LiveBattle.#advance() already owns the shared host tick and clone/adopt transaction, while its projectile runtime records host identities and refuses QUESTION mechanics. The exact versioned host QUESTION receipt is therefore the only opt-in; it executes the existing provisional fixture values while all eleven fields remain QUESTION and the playable roster stays unchanged.

The directly requested host pin is 1a72b361a608745b066a05b140aac87566dad3f5. The supporting report/addendum cite an earlier pin, but the supplied grounding note says host ownership was rechecked against 1a72; this sketch follows the requested pin for code shape and the addendum for the explicit policy decision.

## Usage (caller's view)

A test builds the existing Stormkite host witness and projectile profile manifest, asks the exact policy factory for the one versioned chain QUESTION receipt, then passes it as an optional LiveBattle policy. Ordinary LiveBattle.step()/stepMany() calls remain the only way to advance the host. A pending checkpoint restores through LiveBattle.restore(); restoring it twice creates independent branches for chunk and fork checks. The caller never constructs roots, hop ticks, health changes, or typed contacts.

## Shape

LiveBattle owns pending chains and receipts beside its existing transcript and candidate transaction. A small pure reducer parses the canonical policy and consumes a typed host view. Its pre-boundary phase returns due intents; its post-boundary phase consumes actual launch/impact events from the same host tick. LiveBattle routes each unit/tower intent through the composite battle boundary and each building intent through #damageStructure(). The reducer sees liveness and geometry snapshots, never HP mutation authority. The existing four-field projectile identity is the root for all hop records.

This is a deep private module: its one tagged transition surface hides policy validation, root matching, eligibility, target choice, hop scheduling, and state bounds. LiveBattle has one internal coordination point and retains its already-existing health routing. The explicit public surface is only a new optional policy argument and exact policy factory. The feature witness is additive and versioned; policy absence adds no serialized key or version change. Clone/adopt copies the immutable policy and candidate state together, while restore replays the operation transcript and rejects a witness that does not reproduce. This follows boundary-discipline, single ownership, and idempotent transactional state transition.

The unadopted ffdaab6299f34308776cd2568f1d9f34903ecf14 extraction moves the BattleCombat factory, not LiveBattle. Keep the chain module beside the current host owner and do not rely on pending extraction headroom. One small sibling avoids growing the near-bound kernel file and targets the unchanged source/graph caps; the full guard check belongs to implementation and was not run in this file-only sketch.

## Synthesis decision

For this candidate, shape A is the base. Shape B puts pending roots and target selection in SessionTroopProjectileRuntime, but LiveBattle still has to send a typed target projection, call it before and after the host boundary, and route every contact. A single post-boundary call is one tick late. The two-phase lower-owned runtime is possible, but it exposes a larger staged protocol without taking away the health-owner or transaction seams.

## Tradeoffs accepted

- We accept a small private reducer module and one additional serialized witness when opted in, in exchange for keeping the enormous LiveBattle kernel below its per-file source limit and preserving absent-policy bytes.
- We accept two reducer phases inside one host step, in exchange for scheduling due contacts before the only BattleTowerCombat boundary and observing new primary impacts after it.
- We accept a deterministic typed-ID tie interpretation under QUESTION, in exchange for executable results when the fixture's “stable ID” spans numeric troop/building IDs and string tower IDs.

## Alternatives considered

The lower projectile-runtime owner hides pending-hop storage, but exposes its staged target snapshot and before/after calls to LiveBattle, which must still coordinate all three real health owners. The lighter-looking single-call splice fails: the existing runtime is called after combat events, so a hop it emits for T+1 cannot enter the already-committed T+1 boundary. This alternative loses on interface depth and boundary ordering.

## Open questions and risks

Should the mixed ID tie use the proposed number-before-string typed key, or did historical behavior define another stable-ID ordering? What should happen when another host hit and a chain hit reach the same target in one boundary, or when the selected target dies during that boundary? Do moving targets preserve the selection-time circle across hop delay? Does an authoritative source later confirm targetCap counts the primary? The current fixture behaves that way, but all these values and interpretations remain QUESTION; the closed eleven-field receipt stays unchanged.

## Next implementation step

Add the exact host-policy receipt factory and strict parser, then implement the typed reducer against the existing LiveBattle pre/post boundary and verify the matrix in the sketch with the real host.

