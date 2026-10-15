# Next roster/dependency audit — 2026-10-15

**Decision:** after the pending Brackenwheel melee-area piece, the best next distinct role is Aether Well’s resource-generation building. Its grant loop already has a shared GameSession execution path and an explicit, closed local QUESTION policy, so it can add a genuinely different gameplay mechanic without inventing an attack profile. That supports one executable provisional role; it does not establish historical completeness.

## Scope and current counts

Inspected committed root 3459a7cfbf07c4b6bd7401139b0ba7bcc7180c22 through git show. This report does not infer anything from dirty working-tree changes and records no runtime/test execution.

- The GAME-001HTO row in PLAN.md describes **31** accepted real sessions. That is the historical scoped acceptance.
- The current ordinary-troop fixture tests/game-roster-troops-ordinary.test.js pins **40** admitted IDs. Treat these as current inventory only; subsequent per-role receipts may add coverage, but this is not evidence that HTO’s 31-session claim became 40 or that the original 109-card goal is met.
- The editable deck is a separate surface: EDITABLE_DECK_CARD_IDS has 18 troop IDs, and EDITABLE_MIXED_DECK_CARD_IDS adds Squall Orb, Ember Basin, and Buried Coil for **21** choices. Brackenwheel is the pending 22K piece, not an accepted 22nd choice. Aether Well is session-admitted but not in the 21-choice editable set.

These counts describe different contracts. No set subtraction or historical-completeness claim is justified from them.

## Candidate comparison

| Candidate | Existing support and source scope | Assessment |
| --- | --- | --- |
| **Aether Well — resource generation** | session-card-catalog.js and game-roster-buildings.test.js admit it in the shared building/GameSession path. The real GameSession witness grants to both owners at tick 510 and compares direct stepping, chunking, and restore/replay. buildings-resource.js plus game-building-policy.test.js close local Q fields for grant amount, cadence, and lifetime; the policy also pins deployment, cap, same-tick ordering, ownership, and expiry boundaries. | **Best next role.** Resource generation is distinct from the current mixed editable roles and its runtime foundation exists. Current witness forces the north card through a legal/required-card harness, so it does not prove natural seeded-AI choice, editable custom-8 play, or JS/RL visibility. |
| **Cinder Reliquary — death effect** | Session-admitted; the shared building tests exercise its death trigger once, and GAME-001HBP records Q receipts for death damage/radius/tower modifier. | Viable alternate, but the effect remains Q and no complete raw-signature disposition was located in the inspected evidence. It is less ready as an editable role than Aether Well’s already exercised resource path. |
| **Stonevault — jump movement** | A jump fixture exists, but troop movement/session tests leave source-sensitive movement claims as QUESTION rather than allowing shared-game execution. | Useful shared-mechanic foundation if prioritizing troop coverage, but it first needs explicit jump semantics and a shared runtime policy. It is not the smallest next role. |

The previously reviewed Rascals mixed squad remains a weaker choice for this step: its melee/ranged mix depends on ID-specific delivery/timing evidence and adds less distinct mechanic coverage than resource generation.

## Aether Well: what is and is not established

The executable local Q policy specifies one resource per 510 ticks, capacity handling, deployment at tick 60, lifetime destruction at tick 4200 before a coincident grant, ownership, placement, and deterministic same-tick ordering. The GameSession test reaches the first grant for both sides and checks chunk/restore equivalence. Those are concrete local behavior contracts, not sourced historical facts.

**Owned seams:** SESSION_BUILDING_ADMITTED_IDS is populated through createResourceBuildingCatalog; session-card-catalog.js projects Aether Well as a resource profile, and GameSession routes grants into ElixirMatch. The exact existing witness is the simultaneous-two-owner Aether test in game-roster-buildings.test.js: direct stepMany(511), chunked steps [1, 59, 451], and a tick-180 snapshot restored for 331 ticks. game-building-policy.test.js includes generationAmount, generationCadenceTicks, and lifetimeTicks in its Aether policy case. The editable gate is EDITABLE_MIXED_DECK_CARD_IDS in editable-deck.js; it currently excludes Aether Well.

The local profile gives cost 6; the pinned normalized source maps cost as high-confidence, while hit points and deploy time are marked unverified. The amount/cadence/lifetime policy remains QUESTION. The normalized source row does not expose a complete behavior signature.

No complete Aether Well raw-signature scope/disposition was found in the inspected root paths (reference/research/*signature-scope* and artifacts/*full-signature-scope*). Therefore raw active-field scope is **unclosed**: this is not evidence that omitted active fields or mechanics are absent. Do not call the local profile historically complete.

## Smallest next judgable piece

Judge a single Aether Well editable-role integration under the existing closed local Q policy:

1. Admit it to a custom eight-card deck and exercise actual player and naturally selecting seeded-AI deployment through GameSession; cover spend/cycle and resource grants.
2. Expose the same card/action/state through the existing JS/RL interface.
3. Prove expiry/destruction, deterministic chunking, snapshot/restore/fork/replay, and unchanged default-eight bytes.
4. Keep cost/source confidence and every resource rule visibly Q in receipts.

That would establish one executable provisional gameplay role. Before claiming historical completeness, require a linked full raw-signature disposition that accounts for every active source field, plus adequate source evidence for the unverified stat and resource/lifetime semantics. Browser presentation is a separate integration gate. No sourced semantics are guessed here.

## Evidence paths

PLAN.md (GAME-001HTO, GAME-001HBP, CARDS-018K, CARDS-021K, CARDS-022K); tests/game-roster-troops-ordinary.test.js; src/content/session-troop-roster.js; src/content/editable-deck.js; src/content/session-card-catalog.js; src/content/cards/buildings-resource.js; tests/game-roster-buildings.test.js; tests/game-building-policy.test.js; reference/stats/cards.json; reference/stats/SOURCES.md; artifacts/remaining-roster-actionability-audit-20261015/evidence.md; artifacts/melee-area-full-signature-scope/builder/scope.md.
