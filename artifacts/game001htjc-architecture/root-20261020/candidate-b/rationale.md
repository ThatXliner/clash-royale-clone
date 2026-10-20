# Candidate B — rationale

## Problem

A Stormkite chain must contact real units, custom buildings, and crown towers on `LiveBattle`'s deterministic tick while preserving each current health owner. `BattleCombat` mints the four-field projectile root; the projectile runtime records it but currently rejects QUESTION mechanics. Execution therefore needs the exact bound v1 QUESTION host policy from the addendum. A source claim, generic receipt, or sidecar fixture alone cannot opt in, and the chain cannot change playable roster admission. These constraints were checked at pinned source `1a72b361a608745b066a05b140aac87566dad3f5`; `ffdaab6` remains an unadopted factory extraction.

## Usage (caller's view)

```js
const policy = createStormkiteChainQuestionHostPolicy();
const battle = new LiveBattle(setup, troopRuntimeProfiles, statusRuntimeProfiles,
  projectileRuntimeProfiles, policy);
battle.step();
battle.stepMany(3);
```

This proposed no-argument factory is the sole opt-in and returns an opaque token, so callers cannot edit the fixture or pass a wire record. Existing `step()` calls `candidate.#advance()` once; `stepMany()` and `#advanceFromSession()` call it once per host tick before adoption. Without the token, constructor behavior and canonical snapshot bytes stay unchanged.

## Shape

Keep `#chainPolicy` and `#chainState` in `LiveBattle`, with the transaction that owns the tick and health routing. The private pure reducer exposes `prepareChainBoundary(policy, state, tick, typedCandidates)` and `settleChainBoundary(policy, state, plan, hostContacts, primaryImpacts, tick)`. Both return bounded values and have `not implemented` bodies in the sketch. `#advance()` prepares due intents from the live pre-combat graph, supplies unit/tower contacts to the existing `BattleTowerCombat` boundary, applies building contacts through `#damageStructure()` at the same tick, then settles from real contact outcomes. It never adds a step, clock, or health store.

Pending state and receipts copy the unchanged `{ attackSequence, direction, projectileId, sourceId }` root. Hop ordinals and `targetType: "unit" | "building" | "crown-tower"` are continuation metadata. The exact eleven Q records come from the existing fixture and Stormkite source witness; parsing is canonical and exact at construction/restore. No value becomes authoritative. Cross-kind ties use a tagged stable target key as a deterministic interpretation of the fixture's “stable-id” clause, while the closed `selectionRule` record stays unchanged and QUESTION.

`#runtimeClone()` and `#adopt()` carry the chain state atomically. `serialize()` includes a versioned `chainRuntime` witness only with the policy; the absent-policy shape stays byte-identical. Restore checks the exact receipt, typed unique targets, ticks, pending roots, and causal transcript before returning a battle. The chain witness reuses the projectile runtime's pending, history, and byte limits. The private module stays adjacent to `LiveBattle`; it does not depend on headroom from the unadopted extraction.

## Synthesis decision

This is my runner's base choice, not a cross-runner synthesis or adoption claim. `LiveBattle.#advance()` is the one existing call that sees the current tick, candidate graph, projectile events, composite contacts, and building writer. Keeping continuation state there makes clone/adopt and restore agree with the transaction that owns actual HP; the pure reducer hides Q selection rules.

## Tradeoffs accepted

- We accept one chain state member and a conditional snapshot witness for atomic host ownership and unchanged absent-policy bytes.
- We accept a pure prepare/settle pair around the boundary for same-tick intents and host-confirmed receipts.
- We accept a deterministic cross-kind tie convention as an executable Q interpretation, not a twelfth policy field or source claim.
- We retain the same root value in chain history for causal checking; it is not a new identity.

## Alternatives considered

A lower `SessionTroopProjectileRuntime` can own continuation and emit typed intents, but it needs prepare-before/observe-after calls, a full typed host candidate projection, and routing through the same three health owners. A single post-boundary call is too late: at a due tick it either selects from stale candidates or emits after the host advances. The repaired shape works but exposes more stages and moves state away from the transaction that applies contacts. `ChainEncounter` also loses because its private tick and `DamageSystem` do not prove host behavior.

## Open questions and risks

Does tagged cross-kind ordering match game behavior? How does the exact `eventOrderRule` map to simultaneous unit/tower contacts and direct building mutation? Which primary impact statuses start continuation, and does restore retain enough projectile evidence for consumed roots? Keep each answer QUESTION until evidence or a host policy resolves its operational assumption; none justifies changing the closed receipt.

## Next implementation step

After cross-runner synthesis, implement exact policy parsing and the pure reducer, then wire `LiveBattle.#advance()`, clone/adopt, restore, and the minimal real-host interaction matrix.
