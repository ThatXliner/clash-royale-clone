# Candidate B — caller-first sketch

## Usage

The host opt-in is an opaque domain capability. Calling its no-argument factory is the explicit opt-in; it returns only the exact v1 `stormkite` QUESTION policy built from the closed chain fixture and bound source claim. The caller never supplies hop values or a wire object.

```js
const chainPolicy = createStormkiteChainQuestionHostPolicy();
const battle = new LiveBattle(setup, troopRuntimeProfiles, statusRuntimeProfiles,
  projectileRuntimeProfiles, chainPolicy);

battle.step();
battle.stepMany(3);
```

Without that capability, ordinary construction and serialization stay byte-for-byte on their current path. A sidecar fixture, the profile's chain claim, or the generic projectile QUESTION receipt is not an opt-in.

These are the three existing host call sites that must continue to mean one authoritative tick per `#advance()`:

```js
// LiveBattle.step():
const candidate = this.#runtimeClone();
const events = candidate.#advance();
this.#adopt(candidate);

// LiveBattle.stepMany():
const candidate = this.#runtimeClone();
for (let count = 0; count < ticks; count += 1) {
  events.push(...candidate.#advance());
}
this.#adopt(candidate);

// LiveBattle.#advanceFromSession(): GameSession's already isolated candidate:
for (let count = 0; count < ticks; count += 1) {
  events.push(...this.#advance());
}
```

In all three paths, the chain reducer receives the tick already read from `BattleTowerCombat.state`. It never owns a clock or calls `step()`. Within `#advance()`, a due-hop plan is made from the current pre-combat host view, typed unit/tower intents join that tick's existing `BattleTowerCombat.stepBoundary(...)`, and building intents go through `LiveBattle.#damageStructure(...)` at the same tick. The reducer then settles only against the real host contact outcomes. `step()`/`stepMany()` still clone and adopt the whole candidate atomically.

## Whole-shape alternative 1 — LiveBattle owns continuation state

This is the proposed base. `LiveBattle` owns the chain policy token, pending hops, and chain transcript beside its existing projectile runtime, buildings, and host transcript. A pure private reducer owns selection, eligibility, range, hop progression, and canonical chain receipt rules. It returns typed contact intents; it never owns health or applies damage.

### Data and API

```ts
// Alias the existing BattleCombat projectile identity without adding fields.
type HostTick = ExistingBattleTick; // obtained from BattleTowerCombat.state.tick
type MillitilePoint = Readonly<{ x: number; y: number }>;
type ProjectileRootIdentity = Readonly<{
  attackSequence: number;
  direction: ExistingProjectileDirection;
  projectileId: number;
  sourceId: number;
}>;

type ChainTarget =
  | { targetType: "unit"; id: number }
  | { targetType: "building"; id: number }
  | { targetType: "crown-tower"; id: string };

type ChainCandidate = ChainTarget & {
  alive: boolean;
  targetable: boolean;
  side: "north" | "south";
  position: MillitilePoint;
  radius: number;
  layer: "ground" | "air";
};

type PendingHop = {
  identity: ProjectileRootIdentity;  // exact host root, copied unchanged
  primaryTarget: ChainTarget;
  origin: Readonly<{ position: MillitilePoint; radius: number }>;
  hitTargets: readonly ChainTarget[]; // unique by (targetType, id); includes primary per Q fixture
  nextHop: number;
  dueTick: number;                   // on the existing LiveBattle tick
};

type ChainContactIntent = {
  identity: ProjectileRootIdentity;
  hop: number;
  tick: number;
  target: ChainTarget;
  amount: number;
  origin: "chain-hop";
};
type ChainIngress = {
  externalHits: readonly ExternalUnitHit[];
  externalTowerHits: readonly ExternalTowerHit[];
  buildingContacts: readonly ChainContactIntent[];
};

type ChainState = {
  pending: readonly PendingHop[];       // <= existing projectile pending limit
  history: readonly ChainReceipt[];     // <= existing projectile history limit
};

type ChainPolicyToken = opaque;         // branded, frozen, not a wire record

type ChainBoundaryPlan = {
  contacts: readonly ChainContactIntent[];
  // Private evidence needed to settle only contacts the host actually applied.
  selected: readonly SelectedHop[];
  terminal: readonly ChainTerminal[];
};

type SelectedHop = {
  identity: ProjectileRootIdentity;
  hop: number;
  target: ChainTarget;
  originSnapshot: Readonly<{ position: MillitilePoint; radius: number }>;
};
type ChainTerminal = {
  identity: ProjectileRootIdentity;
  tick: HostTick;
  reason: "no-eligible-target" | "target-cap" | "attacker-dead-before-primary";
};
type ChainReceipt = {
  identity: ProjectileRootIdentity;
  hop: number;
  target: ChainTarget | null;
  tick: HostTick;
  outcome: "contact" | "miss" | "pending" | "complete";
};
type ChainHostContact = {
  identity: ProjectileRootIdentity;
  hop: number;
  target: ChainTarget;
  tick: HostTick;
  outcome: "contact" | "miss";
  amountApplied: number;
};
type TypedPrimaryImpact =
  | {
      identity: ProjectileRootIdentity;
      target: ChainTarget;
      tick: HostTick;
      outcome: "contact";
      targetSnapshot: Readonly<{ position: MillitilePoint; radius: number }>;
    }
  | {
      identity: ProjectileRootIdentity;
      target: ChainTarget;
      tick: HostTick;
      outcome: "target_dead" | "target_missing";
      targetSnapshot: null;
    };
type ChainReduction = { state: ChainState; events: readonly ChainReceipt[] };

function createStormkiteChainQuestionHostPolicy(): ChainPolicyToken {
  // TODO: build the exact bound v1 receipt from the closed 11-key fixture and
  // source claim; return only an opaque token.
  throw new Error("not implemented");
}

function restoreChainWitness(
  raw: CanonicalJson,
  projectileProfiles: ExistingProjectileProfiles,
): { policy: ChainPolicyToken; state: ChainState } {
  // TODO: parse canonical storage, then validate exact receipt and causal state.
  throw new Error("not implemented");
}

function prepareChainBoundary(
  policy: ChainPolicyToken,
  state: ChainState,
  tick: HostTick,
  candidates: readonly ChainCandidate[],
): ChainBoundaryPlan {
  // TODO: exact Q-policy selection; bounded and deterministic.
  throw new Error("not implemented");
}

function settleChainBoundary(
  policy: ChainPolicyToken,
  state: ChainState,
  plan: ChainBoundaryPlan,
  applied: readonly ChainHostContact[],
  primaryImpacts: readonly TypedPrimaryImpact[],
  tick: HostTick,
): ChainReduction {
  // TODO: accept host-confirmed contacts only; record roots, hops and pending work.
  throw new Error("not implemented");
}
```

`ChainPolicyToken` contains the private exact v1 receipt. Its receipt shape is the addendum's shape: `version: 1`, `cardId: "stormkite"`, `claimFamily: "chain"`, `resolution: "question-bearing"`, the canonical existing source witness, and exactly the eleven `questionReceipt` records. Each record keeps `authoritative: false`, `confidence: "unverified"`, `disposition: "question"`, the unchanged fixture source, its explicit `key`, and the exact value from `createChainQuestionFixture()`. The eleven keys are exactly `attackerCancellationRule`, `candidateDeathRule`, `damagePerHop`, `eventOrderRule`, `hopDelayTicks`, `hopRangeMillitiles`, `lethalHopRule`, `rangeRule`, `selectionRule`, `targetCap`, and `targetEligibilityRule`. This is an executable assumption receipt; it changes no field's QUESTION status and adds no playable card.

Only a private method on `LiveBattle` translates typed intents to existing health owners, so it can call the private building writer:

```ts
class LiveBattle {
  #routeChainContacts(
    contacts: readonly ChainContactIntent[],
    tick: HostTick,
  ): ChainIngress {
    // TODO: unit -> externalHits; crown-tower -> externalTowerHits;
    // return building intents for #damageStructure() at this host tick.
    throw new Error("not implemented");
  }
}
```

A chain event carries the unchanged four-field `identity`, plus `hop`, typed target, and tick. `hop` is continuation metadata, not a second root ID. `sourceId` passed into an existing damage API is only attribution; it is not treated as a replacement root.

### Host integration and storage

`src/sim/live-battle.js` exposes the no-argument policy factory and forwards the opaque token through its existing constructor. `src/sim/battle-continuation-kernel.js` keeps `#chainPolicy` and `#chainState`, calls the pure reducer around its existing `#advance()` boundary, and routes each intent through existing owners: units through `BattleCombat`/`DamageSystem`, crown towers through `CrownTowerBattle` via `BattleTowerCombat`, and custom buildings through `#damageStructure()`. A private module such as `src/sim/live-battle-chain.js` contains only policy normalization, the pure transition functions, and private snapshot parsing/formatting.

At the start of a chain-enabled tick, `#advance()` takes typed candidates from the current host state after its ordinary materialization/movement work and before its sole composite battle step. It plans due intents, supplies unit and tower hits to that same step, and applies building intents through the existing structure writer with that tick. Once the host reports actual contact/miss/damage/death outcomes, `settleChainBoundary()` commits pending hops and receipts. A failed candidate transaction discards the new state together with host HP and event changes.

`#runtimeClone()` and `#adopt()` copy/adopt the policy token and chain state. `serialize()` adds a `chainRuntime: { formatVersion: 1, policyReceipt, state }` witness only when the token exists; its exact policy receipt and pending/history state are parsed canonically by `restore()`. With no token there is no new field, no version adjustment, and no changed bytes. With the token, restore rejects an unsupported/malformed policy, altered source witness, non-unique typed targets, impossible tick ordering, a root absent from the ordinary projectile launch/contact witness, or a pending hop contradicted by its transcript before the new instance is returned.

The chain state reuses the existing projectile continuation bounds: at most 1,024 pending identities, 4,096 history records, and 262,144 serialized bytes for its private witness; it does not widen LiveBattle's existing unit, building, tick, history, graph, or snapshot bounds. Every transition sorts by current host tick and stable typed target key before publishing canonical receipts.

## Whole-shape alternative 2 — projectile runtime owns continuation and emits typed intents

This is structurally distinct: chain policy, pending hop progress, and chain history live inside `SessionTroopProjectileRuntime`; `LiveBattle` owns only the current host transaction and routes typed contacts to health. The projectile runtime already observes launch/impact identities and serializes/forks its state, so it would keep the exact host root plus continuation metadata and add a chain-specific policy sub-witness only when explicitly enabled.

```ts
type PreparedProjectileBoundary = opaque;

type ProjectileRuntimeResult = {
  receipts: readonly ProjectileReceipt[];
  chainContacts: readonly ChainContactIntent[];
};

class SessionTroopProjectileRuntime {
  constructor(
    projectileProfiles: ExistingProjectileProfiles,
    chainPolicy?: ChainPolicyToken,
  ) {
    // TODO: keep regular profile admission distinct from chain-policy opt-in.
    throw new Error("not implemented");
  }

  prepareHostBoundary(
    tick: HostTick,
    candidates: readonly ChainCandidate[],
  ): PreparedProjectileBoundary {
    // TODO: choose due contacts from runtime-owned pending state.
    throw new Error("not implemented");
  }

  observeHostBoundary(
    plan: PreparedProjectileBoundary,
    events: readonly HostCombatEvent[],
    applied: readonly ChainHostContact[],
  ): ProjectileRuntimeResult {
    // TODO: mint no roots; retain the four-field identity and settle receipts.
    throw new Error("not implemented");
  }
}
```

Here `LiveBattle.#advance()` must call `prepareHostBoundary()` before its one `BattleTowerCombat` step, translate its typed intents to the same three health paths, then call `observeHostBoundary()` after combat and building-contact processing. `#runtimeClone()`/`#adopt()` can reuse projectile runtime's current fork ownership, and the chain witness nests under the existing `projectileRuntime` snapshot string. Its absent-policy payload remains the current one. This shape keeps chain data next to projectile identity but adds a two-phase protocol and a host candidate projection containing units, crown towers, and custom buildings. The lower runtime still cannot apply health, tick time, or author contact outcomes.

## Base choice and executable counterexample

Choose alternative 1. The shared invariant is “one root, one pending-hop owner, one host tick, three existing health owners.” `LiveBattle.#advance()` is the only current call that sees the due host tick, candidate graph, projectile events, tower ingress, and building writer together. Keeping pending/hop state there makes clone/adopt and restore agree with the transaction that owns actual HP. The pure reducer keeps QUESTION selection rules out of the host loop without moving ownership. The lower-runtime shape can work only with a prepare/observe handshake around every host tick; it spreads the same host decision over a runtime and three health routes. It has a smaller snapshot diff but a shallower caller interface and more chances for the event view and intent to refer to different boundaries.

The concrete failure in the one-phase lower-owner variant is testable at a pending-hop boundary: primary contact at tick `T` creates a hop due at `T+1`; an ordinary host action kills the nearest candidate before selection at `T+1`; the fixture's Q rule says a candidate dead before selection is ineligible. A lower runtime called only after `BattleTowerCombat.stepBoundary(T+1)` either selects from stale pre-tick candidates and hits the dead target, or sees the post-step state and cannot apply the correct `T+1` contact because the host has advanced. The prepare/observe repair in alternative 2 avoids this counterexample, but is the extra protocol that makes alternative 1 the deeper shape.

```js
it("post-boundary-only chaining cannot apply a due-tick intent", () => {
  const dueTick = host.state.tick; // pending hop from the previous tick is due now
  // A second eligible target remains after this hit kills the nearest one.
  const events = host.stepBoundary({
    tick: dueTick,
    externalHits: [ordinaryHitThatKillsNearestCandidate],
    externalProjectiles: [],
    externalTowerHits: [],
    structures: [],
  });
  const late = projectileRuntime.step({
    events,
    tick: dueTick,
    candidates: readTypedCandidates(host),
  });
  expect(late.chainContacts[0].tick).toBe(dueTick);
  expect(host.state.tick).toBe(dueTick + 1);
  expect(() => host.stepBoundary({
    tick: dueTick,
    externalHits: toUnitHits(late.chainContacts),
    externalProjectiles: [],
    externalTowerHits: [],
    structures: [],
  })).toThrow("battle tower boundary is not current");
});

it("restore rejects a forged pending root without changing the source battle", () => {
  const original = pendingBattle.serialize();
  const snapshot = JSON.parse(original);
  snapshot.chainRuntime.pending[0].identity.projectileId += 1_000_000;
  expect(() => LiveBattle.restore(canonical(snapshot))).toThrow();
  expect(pendingBattle.serialize()).toBe(original);
});
```

## Smallest meaningful host test matrix

1. **Opt-in boundary:** no host policy and sidecar-only QUESTION produce no hop HP change, retain the existing generic QUESTION receipt, and serialize to the exact existing canonical bytes. The exact v1 host policy is accepted only when bound to the Stormkite chain source witness; a mutated field, missing/extra key, or unrelated profile fails before deployment.
2. **Real contact path:** use the existing eight-card host witness with Stormkite (no roster change); assert the primary and two subsequent contacts all carry the same four-field root identity, use unique typed targets, and apply damage exactly once through unit, custom-building, and crown-tower owners. Also cover the current host tick, due delay, no-target completion, and deterministic cross-kind tie case.
3. **Continuation equivalence:** pause with a hop pending; compare one-step and differently chunked `stepMany()` event/snapshot bytes, restore at that boundary, and fork twice. The restored and forked runs must agree while each fork's health and chain state remain independent.
4. **Hostile restore:** mutate a pending root's `projectileId` to an identity absent from the normal projectile witness (or alter the policy source witness). `LiveBattle.restore()` must reject before returning a battle; the original serialized value remains untouched.

Cross-kind ties require one explicit deterministic interpretation but no twelfth policy key. For v1 execution, compare squared distance first and then a canonical tagged stable key, `targetType + ":" + canonicalId`; numeric IDs compare numerically within `unit` and `building`, tower IDs compare textually within `crown-tower`, and the type tag breaks a tie across kinds. This only operationalizes the fixture's existing “stable-id” clause so identical input has identical output. The `selectionRule` record remains unchanged and QUESTION; this comparator is not a source-backed claim. Whether the game used this cross-kind ordering is unresolved and should remain so until evidence supplies a rule.

## Explicitly unresolved

- Every one of the eleven values and rules remains QUESTION, including the exact source/game meaning of range, target cap (the sidecar counts the primary among its cap, but this remains a fixture assumption), candidate eligibility/death timing, attacker cancellation, lethal-origin behavior, damage per hop, and event ordering.
- The closed `selectionRule` does not define numeric-vs-string comparison across unit/building/tower IDs. The typed-key ordering above is a deterministic implementation convention, not a new policy fact.
- The `eventOrderRule` fixture string is preserved exactly, but its mapping onto simultaneous unit/tower damage and `LiveBattle`'s direct building mutation needs a host-level ordering decision. No new field is added to conceal that gap.
- Whether the existing primary `projectile-impact` event is sufficient to start a chain on every accepted host contact status, and whether same-boundary source death cancels, must be matched to the exact fixture assumptions while preserving the QUESTION label.
- `ffdaab6` is an unadopted `BattleCombat` factory extraction. It keeps `defineLiveBattle`, `#advance()`, `#runtimeClone()`, and `#adopt()` in `battle-continuation-kernel.js`; it changes source location, not ownership. The chosen placement therefore stays by `LiveBattle` and does not rely on headroom from that unadopted change. Any new reducer must fit current graph/source budgets; the extraction offers main-kernel headroom only if separately adopted.
