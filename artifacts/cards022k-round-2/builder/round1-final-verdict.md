# CARDS-022K Brackenwheel critic review

**Verdict: FAIL — provisional admission is not met.**

Candidate: `7ef53c7ca1a914d62a60b2ea3b148ca452d575f7`  
Exact parent: `09eae7fd6dc8ba19503328869da3e8c651f4ed43`

**Biggest gap:** the simulation dependency-closure guard fails with `GRAPH_ROOT_ESCAPE`: `src/shared/session-troop-melee-area-authority.js` is imported outside the scanned `src/sim` graph root. The determinism audit therefore cannot establish the complete simulation module closure.

Two admission checks also fail. The manifest test expects `createBasicMeleeCatalog` IDs `coilblade, ironroot, mossguard`, but receives those plus `brackenwheel`; the exact legal eight-card witness count is 57 where the fixture expects 56. These are two more unresolved candidate failures. Together with the graph escape, there are three failing candidate test cases.

The required focused suite passed: 94/94 tests, direct exit 0. It exercises actual `GameSession` melee-area contact, primary plus multiple eligible ground secondaries in stable order, restore/fork continuation, spend/cycle behavior, and closed local QUESTION receipts. The RL environment witness covers deployment, spend/cycle, and restore; it does not prove RL combat contact.

The independent exact-parent comparison passed at 20 checkpoints across seeds 2, 28, 58, and 444. Parent and candidate serialized state, replay bytes, events, and restore continuation matched at each checkpoint. The canonical default eight-card roster remained 17,267 bytes with the same SHA-256 on both revisions: `ae6c0bf3db8dce45c9eace06215b45c2972203d4ed08d6df6fe9f7cc925e0785`. The first harness attempt supplied unsorted legal deployments and failed as a method error; that raw run remains preserved under `comparison/`, separate from the corrected canonical-order run under `comparison-canonical-order/`.

The changed-source/test fence covers 17 paths; each post-review file matches the frozen candidate commit and the candidate checkout was clean. The continuation kernel is unchanged from the parent at 523,788 bytes (SHA-256 `115c43146f5818c69a98120e856ddaa5d20243fced3609320d90edc7ae933bea`), below the 524,288-byte cap. Static shipping-isolation checks passed. Two release-host checks could not load because the fresh checkout lacks the `vite` package (`ERR_MODULE_NOT_FOUND`); that is an environment limitation, not a candidate verdict. No browser was launched.

Historical fields not established by the available source remain explicit QUESTIONs: `attack_finish_time=100`, override, mass 5, collision radius 500, projectile start radius/z 450, scale 140, target-count/target flags, movement speed, and the conflicting 2.0 versus 2.4 radius. This review does not claim full historical mechanics completion or 109-field parity.

All raw commands, stdout, stderr, direct exit codes, source fences, and comparison outputs are retained beside this report. Only the critic's two detached review worktrees were removed; the builder checkout and shared root checkout were left in place. See `resource-closure/resource-closure.json`. File digests are in `checksums.sha256` (the manifest does not hash itself).
