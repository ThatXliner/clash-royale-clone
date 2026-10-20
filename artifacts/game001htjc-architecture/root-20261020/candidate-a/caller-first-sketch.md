# LiveBattle chain continuation: candidate A

## Caller usage

The host API gets one explicit, exact QUESTION policy. The proposed factory returns the versioned policy bound to the existing Stormkite chain claim and unchanged 11-field fixture; the manifest/profile receipt alone does not enable chain execution.

~~~js
const projectileProfiles = createSessionTroopProjectileProfileManifest();
const chainPolicy = createLiveBattleChainQuestionPolicyV1(projectileProfiles);
const NORTH_POINT = { x: 3_500, y: 17_500 };
const SOUTH_POINT = { x: 3_500, y: 14_500 };
const battle = new LiveBattle(
  canonical(createSessionTroopWitness("stormkite")),
  undefined,
  undefined,
  projectileProfiles,
  chainPolicy,
);
battle.scheduleDeploy(canonical({
  cardId: "stormkite", point: NORTH_POINT, sequence: 0, side: "north", tick: 0,
}));
battle.scheduleDeploy(canonical({
  cardId: "stormkite", point: SOUTH_POINT, sequence: 1, side: "south", tick: 0,
}));
~~~

This is the proposed direct LiveBattle constructor hook, using the existing deployment API and points from the host stagger fixture. The existing host still mints the launch and primary-impact events. The call below advances exactly one shared host tick; it does not provide a chain clock or a new way to launch a projectile.

~~~js
const boundaryEvents = battle.step(); // one real BattleTowerCombat boundary
~~~

Checkpoint while a hop is pending, then fork the exact checkpoint by restoring it twice. The restored policy and chain witness are validated from the snapshot. Stepping one branch cannot mutate the other.

~~~js
const checkpoint = battle.serialize();
const restored = LiveBattle.restore(checkpoint);
const left = restored.fork();
const right = restored.fork();
const leftTick = left.step();
expect(right.serialize()).toBe(checkpoint);
const rightTicks = right.stepMany(1);
expect(leftTick).toEqual(rightTicks);
expect(left.serialize()).toBe(right.serialize());
~~~

The direct fixture uses the existing eight-card Stormkite witness for a host test only. It does not change the playable roster. With no fifth argument, the existing caller and canonical snapshot bytes are unchanged.

## Two whole-shape alternatives, drafted before choosing

### Shape A: LiveBattle owns continuation state; one pure reducer owns chain rules

LiveBattle.#advance() remains the coordinator. A small sibling module, src/sim/live-battle-chain.js, parses the exact policy and reduces typed chain state. LiveBattle owns that state beside its transaction, shared tick, structures, and event transcript. The reducer has a tagged pre/post boundary input: the pre-phase returns due typed contacts before the single BattleTowerCombat step; the post-phase consumes host launch/impact events and records the next state. Both phases receive the same host tick. The reducer sees a liveness/geometry snapshot and returns intents; it has no health store, clock, random source, or projectile-ID allocator.

The host routes unit and crown-tower intents through the existing combat boundary, and building intents through LiveBattle.#damageStructure(). The existing four-field root identity stays on every hop receipt. A typed target union selects the health owner; no chain rule branches on the ambiguous kind: "structure" projection.

### Shape B: projectile runtime owns continuation state and emits external contact intents

SessionTroopProjectileRuntime owns policy admission, pending roots, hop history, and target selection. LiveBattle supplies it the same host tick plus a typed projection of live units, custom buildings, and crown towers. Before the host boundary, the runtime returns due external contact intents. After the boundary, it consumes the actual launch/impact events and updates its pending roots. LiveBattle still routes those intents to BattleCombat, CrownTowerBattle, and #damageStructure(); the lower runtime never applies health. Policy and pending state would live in a versioned projectile-runtime witness and be copied with the existing runtime fork.

This is a complete ownership alternative, but it does not remove the host seam: LiveBattle must project three target domains, make two ordered calls into the lower runtime, and route each returned intent back through the existing health owner. A one-call extension of the current post-boundary step({events, sources, tick}) is incorrect because it returns a due hop after the boundary where the contact belongs has already committed. A correct lower-owned shape therefore exposes more staged protocol than the selected reducer and still leaves cross-owner contact and snapshot coordination in LiveBattle.

## Selected base: shape A

### Data

Alias the existing projectile identity unchanged as RootIdentity; its exact fields remain attackSequence, direction, projectileId, and sourceId:

~~~ts
type RootIdentity = ExistingProjectileIdentity;
~~~

The domain policy type closes over the exact eleven names. Values are copied from the existing factory, not defaults supplied by a caller.

~~~ts
type ChainQuestionKey =
  | "attackerCancellationRule" | "candidateDeathRule" | "damagePerHop"
  | "eventOrderRule" | "hopDelayTicks" | "hopRangeMillitiles" | "lethalHopRule"
  | "rangeRule" | "selectionRule" | "targetCap" | "targetEligibilityRule";

type ChainQuestionRecord<K extends ChainQuestionKey, V extends string | number> = Readonly<{
  key: K;
  authoritative: false;
  confidence: "unverified";
  disposition: "question";
  source: "unsourced-chained-target-attack-fixture";
  value: V;
}>;

type ChainQuestionPolicyV1 = Readonly<{
  version: 1;
  cardId: "stormkite";
  claimFamily: "chain";
  resolution: "question-bearing";
  sourceWitness: ExistingStormkiteChainClaim;
  questionReceipt: Readonly<{
    attackerCancellationRule: ChainQuestionRecord<"attackerCancellationRule", string>;
    candidateDeathRule: ChainQuestionRecord<"candidateDeathRule", string>;
    damagePerHop: ChainQuestionRecord<"damagePerHop", number>;
    eventOrderRule: ChainQuestionRecord<"eventOrderRule", string>;
    hopDelayTicks: ChainQuestionRecord<"hopDelayTicks", number>;
    hopRangeMillitiles: ChainQuestionRecord<"hopRangeMillitiles", number>;
    lethalHopRule: ChainQuestionRecord<"lethalHopRule", string>;
    rangeRule: ChainQuestionRecord<"rangeRule", string>;
    selectionRule: ChainQuestionRecord<"selectionRule", string>;
    targetCap: ChainQuestionRecord<"targetCap", number>;
    targetEligibilityRule: ChainQuestionRecord<"targetEligibilityRule", string>;
  }>;
}>;
~~~

The exact policy is a closed, canonical host receipt. Its questionReceipt has exactly the current 11 keys and exact records from createChainQuestionFixture(). sourceWitness is the existing Stormkite chain claim. resolution: "question-bearing" means this named host path may execute provisional fixture values; every field remains authoritative: false, confidence: "unverified", disposition: "question". The regular profile, unresolved profile, generic source receipt, or ChainEncounter never enables this path.

~~~ts
// Proposed content/profile factory; accepts no value overrides.
function createLiveBattleChainQuestionPolicyV1(
  projectileProfiles: SessionTroopProjectileProfileManifest,
): ChainQuestionPolicyV1 {
  throw new Error("not implemented");
  // TODO: validate the admitted claim; pair its source witness with the exact
  // no-overrides fixture; return only the closed v1 QUESTION receipt.
}
~~~

~~~ts
type ChainTarget =
  | Readonly<{ targetType: "unit"; id: number }>
  | Readonly<{ targetType: "building"; id: number }>
  | Readonly<{ targetType: "crown-tower"; id: string }>;

type CircleSnapshot = Readonly<{ position: Readonly<{ x: number; y: number }>; radius: number }>;

type PendingChain = {
  root: RootIdentity;                  // copied exactly from the host event
  origin: CircleSnapshot;               // last selected target's host snapshot
  hitTargets: readonly ChainTarget[];   // first is primary; unique by typed key
  dueTick: number;
};

type ChainHopReceipt = {
  root: RootIdentity;
  hop: number;
  target: ChainTarget;
  tick: number;
  damage: number;
  outcome: "contact" | "miss";
};

type ChainState = {
  pending: readonly PendingChain[];
  history: readonly ChainHopReceipt[];
};
~~~

targetCap counts total targets including the primary, as in the existing fixture. The next origin stores the selected target circle so a lethal hit can continue from that snapshotted circle under the explicit fixture rule. Range uses the host's integer millitile geometry and inclusive circle-edge test. The reducer scans the current host target view for each due chain; it does not keep a second target map to synchronize with health owners.

### Boundary

~~~ts
type ChainCandidate = {
  hostCombatId: number; // adapter key for projectile-impact.targetId only
  target: ChainTarget;
  alive: boolean;
  targetable: boolean;
  side: "north" | "south";
  layer: "ground" | "air";
  circle: CircleSnapshot;
};

type ChainSourceSnapshot = { sourceId: number; cardId: string; alive: boolean };

type PreparedChainBoundary = {
  tick: number;
  state: ChainState;
  candidates: readonly ChainCandidate[];
  intents: readonly ChainIntent[];
};

type ChainIntent = {
  root: RootIdentity;
  hop: number;
  target: ChainTarget;
  damage: number;
  tick: number;
};

type ChainBoundaryInput =
  | {
      phase: "before-combat";
      tick: number;                 // must equal BattleTowerCombat.state.tick
      state: ChainState;
      candidates: readonly ChainCandidate[];
    }
  | {
      phase: "after-combat";
      tick: number;                 // same tick as the pre-combat phase
      prepared: PreparedChainBoundary;
      events: readonly HostCombatEvent[];
      sources: readonly ChainSourceSnapshot[]; // post-boundary host units/metadata
      routed: readonly ChainHopReceipt[];
    };

function admitChainQuestionPolicy(
  input: ChainQuestionPolicyV1 | string | undefined,
  setup: AdmittedBattleSetup,
): ChainQuestionPolicyV1 | null {
  throw new Error("not implemented");
  // TODO: canonical-parse and exact-key check; compare source claim and all
  // Q records with the single admitted receipt; reject profile-only setup.
}

// Private sim reducer; one tagged API brackets the existing host boundary.
function reduceChainBoundary(
  policy: ChainQuestionPolicyV1,
  input: ChainBoundaryInput,
): PreparedChainBoundary | { state: ChainState; receipts: readonly ChainHopReceipt[] } {
  throw new Error("not implemented");
  // TODO: before-combat prepares due roots from this host view; after-combat
  // consumes only causal host events and routed outcomes, then commits state.
  // Cap pending/history/receipt bytes at existing 1,024 / 4,096 / 262,144 limits.
}
~~~

The after-combat source list is the already-produced host unit/metadata snapshot, not a second health authority. Prepared candidates map the host combat target ID on each impact back to a typed unit/building/crown-tower reference. The reducer consumes actual projectile-launch and projectile-impact events, keyed by the existing identity, and rejects an impact with no causal host root. It never calls step, increments tick, or mints a hop identity.

For a hop, the pre-phase selects one currently alive, targetable, unhit candidate under the exact Q receipt and returns an intent. LiveBattle applies that intent once through its existing owner and supplies the resulting typed contact receipt to the post-phase. The post-phase records it and schedules the next due tick from the same host tick. Candidate/death cancellation and no-target completion stay in the reducer; health damage stays with the host. All updates remain on the LiveBattle clone candidate, so an exception before adoption discards policy state, contacts, history, and health together.

### Module and lifecycle sketch

- src/content/session-troop-projectile-profiles.js: proposed createLiveBattleChainQuestionPolicyV1(manifest) wrapper using the current Stormkite claim and current fixture without changing any field. It must create the exact host-specific version: 1 / resolution: "question-bearing" receipt.
- src/sim/live-battle.js: accepts an optional fifth chainQuestionPolicy argument. restore() reads the additive chain witness and validates it; it does not infer opt-in from the regular projectile plan.
- src/sim/live-battle-chain.js: private policy parser and pure reducer. No health imports and no public barrel export.
- src/sim/battle-continuation-kernel.js: LiveBattle owns #chainPolicy and #chainState; #advance() brackets its one existing combat boundary with the reducer phases, then routes intents to the health owners. #runtimeClone() copies the state and #adopt() installs it with the same candidate. serialize() adds chainRuntime: { version: 1, policy, state } only when policy is present. Restore strips that additive witness before validating the existing base snapshot shape, replays the transcript with the exact policy, then compares the regenerated witness byte-for-byte. When absent, no field or base version changes, preserving legacy bytes.
- The unadopted ffda… factory extraction moves BattleCombat but leaves LiveBattle and the host boundary in the kernel. This design does not rely on that extraction's pending adoption for ownership or source-size headroom. Keep the reducer as one small sibling importing only current host geometry and the already-reachable shared projectile authority. The unchanged guard caps are 512 KiB per file, 8 MiB per graph, 512 files, and depth 64; the full graph check remains an implementation verification because this turn is file-only.

### Ordering and unresolved policy details

The closed Q selectionRule says nearest candidate, then stable ID, but does not say how a numeric unit/building ID compares with a string crown-tower ID. Use a deterministic typed stable key for execution: number IDs sort before string IDs; numbers compare numerically, strings lexically, then targetType breaks equal IDs. Keep this as a provisional interpretation under the unchanged Q receipt, never an authority claim or a twelfth policy field. Existing host ingress remains the authority for contact order within each owner. If multiple roots target the same entity in one boundary, sort receipts by host tick, the unchanged root tuple, hop ordinal, and typed target key before routing; verify that this order reproduces under restore and chunking.

Still open: whether historical data intended a different mixed-ID tie rule; ordering between chain and non-chain damage to one target at a shared host boundary; whether moving targets use their last snapshotted circle across a delayed hop; exact result when a selected target dies during that same boundary; and whether targetCap is interpreted as total targets (the current fixture's behavior) in any future authoritative source. All 11 receipt fields remain QUESTION meanwhile.

### Smallest host verification matrix (planning only)

1. Absent policy and sidecar-only setup keep the current QUESTION result, change no target HP, and produce byte-identical legacy snapshots. Exact bound policy alone drives the path.
2. Drive a real Stormkite launch/primary impact and unique hops to one unit, one custom building, and one crown tower. Assert actual owner HP changes once each and every hop carries the exact four-field root plus increasing hop ordinal.
3. Check alive/targetable/layer eligibility, dead-candidate skipping, inclusive circle edge, cap, cancellation, hop delay, mixed-kind equal-distance tie, and synchronized LiveBattle / BattleTowerCombat tick under the exact Q policy.
4. Check pending-hop restore, arbitrary stepMany chunking, independent restore forks, and failed-step rollback of state and health.
5. Reject altered/missing/extra Q fields or a mismatched source witness; reject duplicate hop targets, unknown/wrong-kind target refs, future or noncausal pending hops, and history not reproduced by replay.

Executable counterexample against shape B's tempting one-call splice: let a real primary impact land at host tick T, then extend only the current post-combat call projectileRuntime.step({ events, sources, tick: T }) to return the T+1 hop. That boundary has already run, so the returned intent cannot change unit/tower/building HP until T+2; the exact Q fixture expects the next hop at T+1. A host test that records contact tick and HP after each step() fails at T+1. Splitting the lower runtime into pre- and post-boundary calls fixes the tick but exposes the staged target-projection protocol described in shape B.

Executable forged-state counterexample: from a canonical pending-hop snapshot, replace chainRuntime.state.pending[0].hitTargets[0] with { targetType: "building", id: 9000001 }, canonicalize the JSON, and call LiveBattle.restore(forgedBytes). Restore must throw before returning a battle because the typed reference is unknown and the replayed chainRuntime differs. Assert the original live battle still serializes to its pre-forgery bytes.

