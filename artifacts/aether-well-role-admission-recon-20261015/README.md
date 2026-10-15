# AetherWell role admission reconnaissance

Candidate: `c1d17ec2a5591e9871659dfdea9a4e9f4688ea6d`
Private checkout: `/private/tmp/aether-well-role-admission-recon-20261015`
Runtime: Node `v22.22.3`
Scope: read-only runtime/admission reconnaissance; no gameplay acceptance claim.

## Result

The next bounded source gate is AetherWell's absence from `EDITABLE_MIXED_DECK_CARD_IDS`. The current list has 21 IDs; the witnessed eight-card deck has AetherWell plus seven IDs that are all already admitted. `createEditableGameSessionSetup` and `RLEnvironment` both reject this deck with the exact same error:

```text
RangeError: mixed editable deck requires an admitted spell or structure and supported cards
```

The otherwise-identical deck with `ember-basin` in slot 0 is admitted by both APIs. Its RL observation is at tick 0 with 929 of 2,305 actions legal. The AetherWell exclusion is therefore isolated to that one list membership gate, not an unsupported troop among the other seven IDs. Exact source seam: `src/content/editable-deck.js:17-22,71-82`; RL setup calls that factory at `src/rl/environment.js:93-104`, and its structure runtime map derives from the same list at lines 24-28. App collection, replacement choices, arena message validation, and browser setup also derive from this allowlist (`src/ui/app-shell.js:12-18,355-361`; `src/ui/arena-shell-entry.js:55-79`; `src/ui/game-browser-entry.js:875`).

The canonical public `GameSession` path already admits this exact card when its roster is composed from the existing public roster/card projectors. No serialized state was edited or forged. Under seed `2`, the opening north controller decision naturally proposes AetherWell at tick 0; the public controller replay in `natural-ai-decision.json` reproduces that proposal from the exact initial observation and matches the actual GameSession route, spend, and structure-materialization event. GameSession replay does not expose its raw proposal object, so the controller proposal is separately retained and explicitly cross-checked against the committed GameSession event.

The actual player and AI deployments both cost 6 and start at 10 elixir, ending at 4. The South player command was accepted at tick 0 from hand slot 1. The North AI's opening hand was `[briar-band, mossguard, brassbolt, aether-well]`; its legal hand candidates were AetherWell, Brassbolt, Briar Band, and Mossguard, all at the ordinary center building point. The deck cycles after each deployment are in the session replay.

South AetherWell is destroyed by combat at tick 474 and its real grant is routed to South (`amountAfter: 7`). North AetherWell survives, grants at ticks 540, 1080, 1620, 2160, 2700, 3240, and 3780, then expires at tick 3900 and grants +1 to North (`amountAfter: 1`). A tick-3898 checkpoint was restored, then both branches stepped by 3; state, serialized session, and replay bytes compare exactly. The checkpoint, direct exits, grants, restored-branch exit, final state, and replay are retained in `probe-report.json`, `pre-expiry-checkpoint.json`, and the accepted/final snapshot and replay files.

Only the following runtime values have source-aligned support in the pinned evidence: cadence 540 ticks, lifetime 3900 ticks, and destruction payout amount 1. Grant amount, recipient policy, cadence anchor/reset, resource cap, and ordering policies remain QUESTION records; this probe reports what the implementation did, not source validation of those policies. Do not treat the observed combat timings or HP as authority.

## Bounded next builder scope

The source admission gap is the missing `aether-well` entry in `src/content/editable-deck.js`. However, the RL adapter needs a role-specific observation review before this is considered complete. In `src/rl/environment.js:134-166`, `publicStructure` applies `DEFENSIVE_BUILDING_QUESTIONS.lifetimeTicks` to every structure (that receipt is the 1,800-tick defensive fixture, while AetherWell's profile carries a 3,900-tick source-aligned lifetime policy) and reads `targetMode` from the runtime profile. AetherWell's resource `buildingRuntime` has no attack `targetMode`, although its source card says `targetMode: "none"`. Adding it to the allowlist alone would therefore admit RL reset, but the structure observation would carry a misleading lifetime QUESTION and an undefined target mode. The next builder should own both `src/content/editable-deck.js` and `src/rl/environment.js`, with exact regressions that preserve existing defensive observation bytes and give AetherWell explicit resource-role lifetime confidence/target semantics. `tests/editable-deck.test.js` currently hard-codes the list length 21 at line 206 and K3 owns that file until its repair is sealed; do not touch it before then. `tests/rl-environment.test.js` has the existing Ember Basin and Buried Coil structure patterns to extend. App collection/replacement choices and arena deck validation already derive from the mixed allowlist, so no separate UI source change has been demonstrated as necessary. If browser collection presentation is in scope, prove it through `tests/game-browser-deck-choice.test.js`; the shipped portrait map has no AetherWell entry, which is a separate visual follow-up.

The separate `OpponentBattleRuntime` API is not a valid proxy for this GameSession route: its setup validator probes every candidate through `LiveBattle.scheduleDeploy`, which rejects a structure as “not a materializable unit.” The public `GameSession` path instead routes the natural controller proposal through its card runtime and supports this structure. Keep future verification on the requested GameSession/RL path; do not broaden this reconnaissance into a separate opponent-runtime change.

## Reproduction and retained evidence

From the private checkout:

```sh
node artifacts/aether-well-role-admission-recon-20261015/source-bound-probe.mjs
node artifacts/aether-well-role-admission-recon-20261015/capture-natural-ai-decision.mjs
```

`natural-ai-seed-search.mjs` is retained as the bounded 0–15 / 1,200-tick-per-seed discovery harness that identified seed 2. The final capture reuses seed 2; no second seed expansion or browser/endurance suite was run.

`probe-report.json` records the exact deck and allowlist membership, API errors and positive controls, the canonical GameSession setup hash, accepted player command, tick-0 direct exits, natural deployment, resource/lifecycle events, event-time balances, tick-3898 checkpoint hash, expiry direct exits, restored-branch comparison, policy receipt summary, and final snapshot/replay hashes. The raw accepted command snapshot, pre-expiry checkpoint, final snapshot, final replay, and public projection are retained alongside it. `natural-ai-decision.json` contains the full public controller observation, proposal, replay log, and matching GameSession committed event.

No product source, tests, package/lock files, PLAN, UI, assets, or root checkout files were changed. No canonical test audit or browser run was performed.
