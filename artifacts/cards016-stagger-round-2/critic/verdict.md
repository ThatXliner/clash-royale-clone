# CARDS016T stagger round 2 critic verdict

**Scoped preflight verdict: PASS** for frozen candidate `796708ef622a0292cdd71fa4cf0a81c9af48b3b1`, independently tested from detached worktree `/tmp/cards016-stagger-round-2-critic`.

The full ordinary troop suite passes **16/16** in [ordinary-roster.tap](ordinary-roster.tap). Its corrected assertion keeps the ordinary same-boundary count for every profile without a deployment interval. For Gloamwing and Coppershade, it validates the exact source receipt (100 ms / six ticks), one first member, no intervening births, the expected next member ID at each exact six-tick boundary, and the exact visible count after every tick. That means four later births for the five-member squad and five for the six-member squad. The focused stagger, air-swarm, and integration suite also passes **16/16**; see [focused-stagger-air-integration.tap](focused-stagger-air-integration.tap).

The continuity probe compared actual files in the detached round-one and round-two worktrees. All **181** `src/`, `public/`, and `demo/` runtime/asset files and all **13** `scripts/` files have matching SHA-256 hashes. Across **345** test files, the only changed file is `tests/game-roster-troops-ordinary.test.js`; its before/after hashes are recorded in [continuity-manifest.json](continuity-manifest.json). The prior app-shell, editable-deck, RL, nondeterminism, shipping-isolation, and focused-test harness inputs are also hash-matched.

The previous **61 requested preflight passes** remain valid by continuity: runtime/assets and the app/RL/guard/editable harnesses are unchanged. Their existing TAP receipts and hashes are listed in the manifest; the browser and RL gates were not rerun, and the focused 16 were not added a second time to the 61. The six full default-eight `GameSession` comparisons remain byte-identical at seeds 0 and 23, ticks 0, 120, and 900; their prior receipt and captured snapshots are preserved under [the round-one critic evidence](../../cards016-stagger-round-1/critic/).

The continuation kernel remains **524,275 bytes**, 13 below its unchanged 524,288-byte source cap.

The only outstanding gate is the root-authorized strict 18,000-tick run. It was not started in this critic pass. No implementation defect was found in the scoped preflight.
