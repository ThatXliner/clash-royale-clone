# GAME-001HTJC source-grounding report

**Source pin:** accepted code is `4a6e9f6171ae1042a03f7c8268863df9a97920e7`; the comparison commit `ffdaab6299f34308776cd2568f1d9f34903ecf14` is an unadopted factory extraction. Inspection used `git show` against these commits because the checkout is dirty. This is file-only grounding: no runtime, test, build, or browser verification was performed.

## Finding and recommended seam

The host ownership seam is `LiveBattle.#advance()` in `src/sim/battle-continuation-kernel.js`, with chain state owned alongside its current private `#projectileRuntime`, `#structures`, and transcript state. `LiveBattle` already coordinates the shared host tick, ordinary combat, unit/tower structure contacts, custom-building health, and canonical replay. Put chain choice and pending-hop lifecycle behind one private reducer called from that host transaction; let `LiveBattle` apply its typed contact intents through the existing health owners. Do not treat `ChainEncounter` or `SessionTroopProjectileRuntime` receipts as execution.

The existing flow is: `LiveBattle.#advance()` reads the `BattleTowerCombat` tick and pre-boundary state (`battle-continuation-kernel.js:8003-8034`); it builds structure candidates and submits boundary hits/targets to the composite host (`:8225-8256`); `BattleTowerCombat.#advance()` synchronizes that tick, previews then commits `BattleCombat` and `CrownTowerBattle`, and merges events (`:5395-5482`). Afterward the projectile runtime consumes those host events, but its contract says it cannot mint projectiles, advance time, or touch health (`:8262-8271`; see runtime header `src/sim/session-troop-projectile-runtime.js:5-14`). Unit health belongs to `BattleCombat` (`battle-continuation-kernel.js:2578-2582`, damage application `:3238-3264`); crown-tower health belongs to `CrownTowerBattle` through the composite (`:4976-4980`, `:5421-5460`); custom building health belongs to `LiveBattle.#damageStructure()` (`:8296-8305`, `:9158-9185`). A separate encounter cannot establish mutation in any of those authorities.

`BattleCombat` mints the root projectile identity once and emits it on launch/impact (`:3001-3041`, `:3095-3100`). Keep that exact four-field identity—`attackSequence`, `direction`, `projectileId`, `sourceId`—as the root for every hop receipt (`:4785-4805`; profile requirement `src/content/session-troop-projectile-profiles.js:59-77`). Add a hop ordinal/target as continuation metadata, not a replacement identity or another root projectile ID. This preserves provenance and prevents a receipt from inventing a new root.

Target representation needs a new internal discriminant. Crown towers are projected as `kind: "structure"` with their tower string in `structureId` (`:4599-4610`); custom buildings also use `kind: "structure"`, with `structureId: "building:<id>"` (`:9158-9169`). The legacy `kind` cannot tell their health owners apart. Use an explicit target type such as `unit | building | crown-tower`, retain the stable host ID, and route application to the owner described above. Keep this internal unless an existing receipt/snapshot contract requires serializing it.

## Minimal internal interface sketch

```js
// RootIdentity stays the host-minted, exact four-field value.
type RootIdentity = {
  attackSequence: number, direction: string, projectileId: number, sourceId: number
};
type Target =
  | { targetType: "unit", id: number }
  | { targetType: "building", id: number }
  | { targetType: "crown-tower", id: string };
type PendingHop = {
  root: RootIdentity, primary: Target, origin: Target, hit: Target[],
  nextHop: number, dueTick: number
};
type ChainQuestionPolicyV1 = {
  version: 1, disposition: "question", fields: /* exact admitted Q receipt */ object
};

advanceChainHost({ tick, launches, contacts, candidates, pending, policy })
  -> { intents: [{ root, hop, target, tick }], pending, history };
```

The reducer should be deterministic and return intents; it should not construct a second health system or clock. `LiveBattle` validates/routes each intent once, records the canonical host history, and clones/adopts chain state with its transaction. This is an interface sketch, not a verified implementation contract.

## Policy and source limits

`src/content/cards/special-projectiles-chain.js:25-59` marks every fixture field non-authoritative, unverified, and QUESTION. The values `damagePerHop: 192`, `hopDelayTicks: 1`, `hopRangeMillitiles: 3000`, `targetCap: 3`, selection, eligibility, and cancellation/order rules are fixtures only. Its own `ChainEncounter` documentation limits it to static candidate geometry (`:362-400`); its private `DamageSystem`, tick, candidates, history, and v1 replay are separate state (`:375-400`, `:428-495`, `:523-565`). The committed audit says the bounded pre-cutoff official-source search found no authoritative chain parameter; it expressly does not infer hop timing from first attack (`artifacts/stormkite-shared-host-gap/electro-dragon-chain-primary-audit-20261015.md:5-17,19-31`). `SOURCES.md` likewise defines `first_hit_seconds` as datamine `load_time` and `damage` as per attack/projectile/tick, not per-hop proof (`reference/stats/SOURCES.md:27-38`). Therefore all chain parameters and rule choices remain QUESTION.

The positive stormkite-to-Electro-Dragon binding and `pending-shared-host-integration` status are already recorded in the source packet and profile (`session-troop-projectile-profiles.js:449-458`); this establishes the intended profile, not completed host behavior. The existing reducer rejects scheduling when a mechanic is QUESTION (`session-troop-projectile-runtime.js:817-821`) and on projectile impact emits a receipt plus QUESTION (`:922-970`). If a bounded round needs executable provisional fixtures to prove plumbing, it must explicitly preserve their QUESTION disposition and avoid playable/source-authoritative admission. Whether the requested v1 host policy itself can execute Q fixture values while remaining non-admitted is an unresolved contract question; this report does not authorize changing the current rejection semantics.

## Persistence, ownership, and alternatives

The existing `LiveBattle` transaction clones/adopts every private mutable subsystem (`battle-continuation-kernel.js:9360-9429`); chain pending/history must join both sides or forks and failed operations can diverge. Serialization currently builds a feature-dependent snapshot and exact canonical replay witnesses (`:7438-7558`, `:7907-7998`). Add an explicit feature/version path only when the chain policy exists; when absent, preserve the old serialization bytes. Restore must validate the policy receipt, unique hit targets, typed target membership, tick causality, pending-hop consistency, bounds, and transcript witness before adoption. Test pending restore at a hop boundary, arbitrary `stepMany` chunking, and independent forks.

One alternative is to make `BattleCombat` own hop progress and emit typed external intents for `LiveBattle` to route. That gives it proximity to unit damage but not building health, and still requires `LiveBattle` to serialize and atomically coordinate cross-owner contacts. It adds cross-module coordination without removing the LiveBattle seam, so prefer private LiveBattle coordination with one reducer. `src/sim/live-battle.js:20-30` is only the facade and snapshot plan adapter; no facade change is needed unless policy admission requires it.

The candidate factory commit moves `defineBattleCombat` to `src/sim/battle-combat-runtime.js` and adds `opaque-continuation.js`; its diff is extraction plus differential/guard tests only. The accepted kernel already wires factories through lexical registration callbacks (`battle-continuation-kernel.js:9453-9477`). This extraction changes location, not authority ownership; keep it out of chain scope until the factory gate adopts it, then place the chain reducer beside whichever module owns LiveBattle's continuation.

## Bounded builder paths and evidence to require

Likely owned paths after the factory gate: the LiveBattle continuation implementation (`src/sim/battle-continuation-kernel.js` at accepted HEAD; reassess only if the extraction moves this owner), the existing profile/receipt files only if policy facts need a canonical representation (`src/content/session-troop-projectile-profiles.js`, `src/shared/session-troop-projectile-authority.js`), and the existing host projectile interaction suite (`tests/game-roster-troops-projectile.test.js` or a narrow chain-host test). Keep `ChainEncounter` as fixture/geometry coverage; do not make it the integration oracle. Avoid modifying the extracted BattleCombat factory for ownership it does not have.

Host-level tests need to drive actual `LiveBattle` with primary target plus eligible unit, custom-building, and crown-tower candidates. Assert unchanged root identity on primary and each unique hop; actual host HP changes exactly once; stable tie order and target-eligibility outcomes under an explicit Q fixture; no contact before/after the policy tick; synchronized `LiveBattle`/`BattleTowerCombat` tick; pending-hop restore and canonical bytes across one-step/chunked continuation; independent fork outcomes; and absent-policy legacy bytes. Hostile tests should reject duplicate/forged roots, duplicate targets, malformed or out-of-range ticks, unknown/wrong-type targets, and contradictory pending/history snapshots atomically. Existing generic shared-host assertions (`tests/game-roster-troops-projectile.test.js:138-188`) prove ordinary host launch/contact/health plus QUESTION receipts, not chained hop health/timing. Static sidecar assertions in `tests/special-projectiles-chain.test.js:290-359,404-449` likewise do not close this gap.

Reuse existing host tick and collection limits where appropriate. The projectile reducer already has explicit profile/pending/history/byte limits (`session-troop-projectile-runtime.js:16-20`); do not silently widen them for chain state. The graph guard follows imports and enforces root, dependency-depth, file-count, and total-source-byte limits (`scripts/nondeterminism-guard.js:853-907`); a new private module must remain within that audited graph and budget. The factory candidate is not evidence that any such guard or runtime has passed for chain integration.
