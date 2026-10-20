# GAME-001ASC round 1 independent critic verdict

**Verdict: ACCEPT.** Candidate `df86f516ec717a252c1c244bb0f1c1cdc477ee7e` satisfies the round's restore-documentation and historical-fixture regression bar.

The candidate contains the same 11 owned documentation, test, and fixture blobs as `734dd8e3c5c8f21703b8fd39727e69f51eb93ab3`. Its parent is `d0ec2e7426fbdba42d3f69fb02ead34cc22fbed0`, and its `src/` tree is `01d869b32c563dac270acd4fddc7fa4d0ec207de`, the accepted main source tree supplied for this review. The candidate diff changes no production code, policy, stats, or golden files.

The focused, unfiltered `npm run test:game-troop-runtime` run used Node `v22.22.3` and npm `10.9.8` and exited 0: 8 passed, 0 failed, 0 skipped. The new case passed for all seven historical snapshots, requiring the exact missing Briar source-confidence-policy `TypeError` at c9 `roster[6].entities[0]` and 2a `roster[7].entities[0]`. I byte-compared each copied fixture with its corresponding file in the committed diagnostic packet; all seven were identical. Existing current, causal, hostile, and legacy/current-format restoration cases in this test file also passed unchanged.

The docs distinguish checkpoint envelope version from current card admission, source-confidence policy, causal replay, and the RL deployment counter. They retain RL wrapper v1 rejection, say source-vintage migration is not implemented, and avoid promising cross-revision behavior. The implementation flow in the pinned source performs current setup/policy admission before replay validation; the RL restore then checks configuration, horizon, paused/pending state, and command count.

The bounded input manifest contains 166 Git-pinned files: 151 `src/` files plus the package files, the two edited docs, runner/test, and eight fixture/provenance files. Pre/post fences match for all 166 source-copy files and for the runner, test, and seven snapshots. The run record captures argv, an explicit environment allowlist with separate empty user/global npm config files, process-tree PID samples, raw stdout/stderr, and exit status.

Run evidence: `/Users/me/.codex/clash-qualification/20261020-asc-critic/runs/df86-20261020T170431Z-73823/`. Bounded Git input manifest: `/Users/me/.codex/clash-qualification/20261020-asc-critic/df86-input-manifest.json`.
