# GAME-001GTC causal finding and fixture scope

The causal findings below come from the coordinating agent's retained accepted-source comparison packet. The candidate suite results, captured after an explicit runtime handoff, are recorded in `preparation.md` and the two `attempt-*` directories.

## Current-witness serialization deltas

The accepted historical empty `LiveBattle` v2 output is 11,618 bytes with SHA-256 `874c2b8e8642447e627e850e8511b58009e57c22e3d9d2cc42ab447b4af8429a`. Current accepted output is 17,731 bytes with SHA-256 `cb92fe16188370ae2bdfa260f574d220dcc02e1cdf4aa847c861e0fca5d20d54`.

The exact setup delta consists of the two Briar `sourceConfidencePolicy` entries and their 20 source-confidence QUESTION records. Removing only these fields from current output reproduces the historical empty-v2 bytes exactly, with no residual differences. The policy carries the accepted 100 ms / six-tick member interval; it is behavioral source data, not inert metadata.

All six status replay hashes match their historical controls and remain unchanged in the test. Each current full snapshot is 13,562 bytes larger than its historical counterpart. The difference is confined to the duplicated current setup witness (`battleSetup` and `rosterWitness`); removing the same exact Briar policy/question fields reproduces each of the six old snapshot hashes, with no residual snapshot differences. The current snapshot pins below therefore record current-witness serialization for these exact fixtures; they do not establish cross-vintage state or gameplay parity.

| Scenario | Existing replay SHA-256 (retained) | Historical snapshot SHA-256 | Current snapshot SHA-256 |
| --- | --- | --- | --- |
| bloom-wisp | `c910889cfedec9476105f42111dc2528cd508164ef3bb6a015712b24a0604b86` | `552625d664701401763e78aeb1b3b8ce79b2abaa41142b71eb45c98046d4dfd9` | `e1b9c73e1f1a12e19661b375db7ba7f16855519b33476a4994477e22db29f763` |
| dawnmender | `32ca31c6a29c77928845992163841293862c8c9ee458c53530ea7d367d541be7` | `c7ee4536c9ca885fde04ef99b149fca31e8c138cc9cf9fc96c5ec03b4ff75a2e` | `560503e6911cb66e0b7f4df47f5c70ec794d0946519140c7b17b15faa5c32fa3` |
| pulse-sentry | `b21f4742b539a0ebfdc6d0a90444901f3b754a032684391fc2d6186e4ef04138` | `711028fb73a858df0546bb847b038b40238823fa71d2bf3ad9b1f4bad279b3e0` | `12d9664948f64070021bb6cf4755ed58e0fa35e4ad26a0b6eac268d8ea8d0f7f` |
| rime-adept | `b7743ef309caefcac631e0b51881df9082c8c9ee458c53530ea7d367d541be7` | `96ea0ac365b8fb70a65c19eaeb940812a385fc05a580a2aa5621bda2e9502d92` | `5aae149bd1940573874270866defe41433baa7217a9c27c6a7aca26721952d40` |
| tether-rider | `42195da81ea1add834995f2d16d807d2160794ca5c82d3e961abd18813b4562b` | `67221b82e6885ae4417dd7019d41c5e778c34038dac4cccd010eed166224c0b5` | `d091a33be5e46665307caa5cb1a989ff8a9980536d5f348ec8273ac5548465ab` |
| veil-prowler | `53039869e13dc2e1be0d01d114b7a365f8329ed6d568ed19b865200d3cfab75b` | `e184782f3d14d389ef97dea893f9db469095e7f4e0326024b238233419c312e3` | `95235078f037fe91b0037d8f424d08d0f5ca9d491d9efe3393b80b1793645579` |

## Compatibility boundary

A retained cross-source archive control (direct PID 29561, probe exit 0) found that current `LiveBattle.restore` rejects the historical empty-v2 snapshot and all six current `GameSession.restore` calls reject the historical status snapshots because source-confidence policy evidence is missing/unexpected; none of those old snapshots restored. Other historical and current scenarios can produce different public unit counts and positions under the sourced stagger policy. This round does not claim that old setup witnesses or old gameplay state restore unchanged; the archive incompatibility is recorded separately from the current-witness pin repair.

The tests/docs do not establish a blanket cross-revision archive guarantee. `LiveBattle.restore` has legacy v1/v2 snapshot-shape branches, but the `empty v2` assertion in the troop-runtime test checks only current output bytes; its actual restore comparisons use current-generated snapshots. The legacy action test's v1/v2 refer to source-profile formats and produce restorable LiveBattle snapshot versions 3/4. Status restore cuts serialize and restore within the same current run. No migration, validator bypass, or production change is included here.

## Retained coordinator evidence

- Accepted empty-v2 and current-output captures: `/Users/me/.codex/worktrees/gtc-golden-pin-diagnostic-5cc4d3/attempts/attempt2-shared-clone-20261016/scripts/runs/20261016T013607.615059Z/02-gtc-empty-probe-c9/fixture-view/` and `04-gtc-empty-probe-current-5cc/fixture-view/`.
- Six status cases and exact removal residuals: `/Users/me/.codex/worktrees/gtc-golden-pin-diagnostic-5cc4d3/attempts/attempt2-shared-clone-20261016/scripts/status-view-runs-shared-clones/20261016T013739.298063Z/comparison/fixture-comparison-summary.json`.
- The final same-historical-input legacy-control audit is retained separately by the coordinating agent.

## Candidate test results

After the coordinator's final restore-control process exited and runtime was released, the builder ran `npm run test:game-troop-runtime` (7/7) and `npm run test:game-roster-troops-status` (33/33) serially. Both exited 0. Exact pre-run test/runner/package copies, environment and version records, direct PIDs, raw streams, and before/after source fences are retained in their attempt directories. All six replay pins and all 36 restore cuts remain in the status test.
