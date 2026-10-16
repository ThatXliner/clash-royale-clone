# GAME-001GTC candidate 16648846857450b8507cfa3d5ad0f90da83c5d36

This packet reviews the exact candidate commit against parent 090d685a4fa07aa07c17618b1e18d00ecb63ff51 in a detached clean checkout at /tmp/game001gtc-critic-1664884685. It contains no builder narrative or verdict. All packet material is outside the root physical worktree.

## Focused gates

The required gates ran sequentially in Node v22.22.3 / npm 10.9.8.

- npm run test:game-troop-runtime: direct npm PID 33709, exit 0; 7 tests passed, 0 failed. Raw stdout/stderr, direct PID, runner process snapshots, exact prelaunch static-import hashes, and identical before/after source fences are in current-runtime/. The post-run copied source closure was verified against those prelaunch hashes, unchanged checkout bytes, and candidate Git blobs; copied-source/COPY_TIMING.md records that these byte copies were made after the run.
- npm run test:game-roster-troops-status: the durable qualification capture is /tmp/game001gtc-status-rerun.BHmObW/. Direct npm PID 40939, runner PID 40971, node --test PID 40972, test-file PID 40973; exit 0; 33 tests passed, 0 failed; stderr is empty. Its 102-file static import closure was copied and hash-verified before launch, and its bounded source/package fence is identical before and after. Pre/post status is clean.
- The runtime and status suites preserve the independent replay hashes and the hostile-admission, chunk/fork/restore, and lifecycle assertions; the golden changes are confined to empty-v2 serialization and six status snapshot expectations in the two permitted test files.

## Source-pinned cause

The historical empty-v2 witness is pinned to c9c818f7ac281b0e71890a2be17ce757f688b4c5; historical status witnesses are pinned to 2a5bd7a44ad3773de59e8e6dd8baaebf0ec09764. The relevant source-policy addition is c981ec2444b9d2f08dacdb5c6f04ce6b5b786dfb.

At c9, empty v2 is 11,618 bytes / SHA-256 874c2b8e8642447e627e850e8511b58009e57c22e3d9d2cc42ab447b4af8429a with 13 questions and no source-policy entities. At the candidate source, it is 17,731 bytes / cb92fe16188370ae2bdfa260f574d220dcc02e1cdf4aa847c861e0fca5d20d54 with 33 questions, two Briar policy entities, and 20 additional Briar source questions. Removing only those two policy entities and those 20 question records returns the exact historical byte count and hash (zero residual).

For each of the six status witnesses, current serialization adds 13,562 bytes. The current setup has 51 questions versus 31 historically, Briar has 27 versus 7 questions, and the candidate adds two source-policy entities. In each status snapshot the exact ablation removes the two policy objects in both setup copies (four objects total) and the 20 added questions in both copies (40 total). Every resulting byte count and SHA-256 exactly matches its independently generated 2a historical witness. All six replay SHA-256 values remain identical. See golden-comparison.json and the raw source-pinned records.

The source-backed Briar stagger is 100 ms / 6 ticks per entity. Public runtime state therefore differs between the historical and current witnesses: in every fixture the historical state has seven units including all six Briar members, while the candidate state has three units including only two Briar runners at the observed snapshot. Canonical state hashes and movement/target/attack paths differ (13–30 paths per fixture), although each corresponding replay hash is identical. This is an intentional timing distinction reflected by the current source witness; the evidence does not claim cross-vintage gameplay equality. state-classification.json gives the exact state/replay hashes, unit sets, and paths.

reference/stats/SOURCES.md governs uncertain mechanics: these records support the current-witness serialization contract, not blanket archived-source compatibility or gameplay parity.

## Capture caveats retained

- wrapper-failure-runtime-01/ retains an earlier wrapper failure after the test subprocess; no result is inferred from its TAP because it has no trustworthy captured exit/fence. The valid runtime gate is current-runtime/.
- /tmp/game001gtc-status-rerun.5qhd7e/ retains a prelaunch setup failure. It occurred before npm/test launch when a broad all-tracked-file hash command encountered a tracked symlink to a directory. No test process ran in that attempt.
- An earlier status test's stdout.log, PID, pre/post fences, and import manifest survive in current-status/, but a later witness probe reused that directory and overwrote its launch record, exit-code file, stderr file, and stdout.json. Those overwritten files are not treated as gate evidence. The fresh isolated status capture above supplies the durable result.

## Packet contents

golden-comparison.json and state-classification.json are compact derived views. Raw historical/current witness outputs, exact ablation outputs, full paired public-state diff, candidate gate logs, source manifests/copies, and all capture caveats remain alongside them. EVIDENCE_LEDGER.tsv indexes the evidence. SHA256SUMS.txt covers packet files and the two external status-attempt directories; it intentionally does not hash itself.

SHA256SUMS.sha256 records the digest of the checksum manifest.
