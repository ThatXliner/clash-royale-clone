# GAME-001BTC round 1 critic run ledger

Packet root: `/private/tmp/game001btc-critic-cb1336593601802309/packet`

Candidate commit: `cb1336593601802309b200e370467e1f074fa5ac`  
Accepted baseline / candidate parent: `511df9308e9d8aec0bd7cf12fdade5505da6fd79`

All qualifying commands ran from private commit archives under `/private/tmp/game001btc-critic-cb1336593601802309/source-attempt-2/`. The clean child environment was exactly `PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin` and `TMPDIR=/tmp`. Node reported `v22.22.3` in the baseline test output. No dependency install, Vite, browser, or other test process was used.

## Required executions

| Run | Exact argv | Actual cwd | Direct PID | Exit | Result | Raw output |
| --- | --- | --- | ---: | ---: | --- | --- |
| Baseline control | `node --test tests/game-battle.test.js` | `/private/tmp/game001btc-critic-cb1336593601802309/source-attempt-2/baseline` | 98032 | 1 | 11 tests; 8 pass, 3 fail, 0 skipped. The three expected pre-repair failures are reproduced. | `runs/baseline-game-battle-archive-2/stdout.txt`, `stderr.txt`, and per-run metadata files. |
| Candidate battle | `node --test tests/game-battle.test.js` | `/private/tmp/game001btc-critic-cb1336593601802309/source-attempt-2/candidate` | 98080 | 0 | 11 pass, 0 fail, 0 skipped. | `runs/candidate-game-battle/stdout.txt`, `stderr.txt`, and per-run metadata files. |
| Candidate ordinary roster | `node tests/game-roster-troops-ordinary-runner.js game-roster-troops-ordinary` | `/private/tmp/game001btc-critic-cb1336593601802309/source-attempt-2/candidate` | 98156 | 0 | 25 pass, 0 fail, 0 skipped. | `runs/candidate-roster-troops-ordinary-attempt-2/stdout.txt`, `stderr.txt`, and per-run metadata files. |
| Candidate roster admission | `node tests/game-roster-admission-runner.js game-roster-admission` | `/private/tmp/game001btc-critic-cb1336593601802309/source-attempt-2/candidate` | 98180 | 0 | 7 pass, 0 fail, 0 skipped. | `runs/candidate-roster-admission/stdout.txt`, `stderr.txt`, and per-run metadata files. |
| Independent causal check | `node /private/tmp/game001btc-critic-cb1336593601802309/packet/runs/independent-causal-check/independent-causal-check.mjs` | `/private/tmp/game001btc-critic-cb1336593601802309/source-attempt-2/candidate` | 98358 | 0 | Reserved Briar IDs and 0/6/12/18/24/30 spawn boundaries; generic paired source accepted, bound paired source and lone surrogate rejected. | `runs/independent-causal-check/stdout.txt`, `stderr.txt`, and per-run metadata files. |

The candidate TAP total is 43/43 passed across the three required candidate commands, with 0 skipped. The baseline is reported separately and is not included in that total.

## Preserved non-qualifying attempts

- An initial filtered baseline archive omitted the legitimate source module `src/sim/tower-evidence-map.js` because I used an overly broad filename exclusion. Its real invocation is preserved under `runs/baseline-game-battle/` (PID 98005, exit 1); Node reported `ERR_MODULE_NOT_FOUND`. This was archive setup failure, not a baseline product result. The corrected archive and qualifying baseline run are separate.
- An initial candidate ordinary-runner invocation completed its child process, but the capture script failed before writing its record because I had not created that run directory. The PID, exit code, stdout, and stderr were not saved and remain unknown; they are explicitly not reconstructed. The harness error is recorded in `runs/candidate-roster-troops-ordinary-harness-attempt-1/`. The fully captured retry above is the sole qualifying ordinary-runner result.

## Source and file fences

The corrected private baseline and candidate archives each contained 728 tracked files after excluding the round `artifacts/`, `reference/`, `.agents/`, and unneeded repository guide/plan pages. Their complete file path sets and Git blob IDs matched their respective commits: 0 missing paths, 0 extra paths, 0 blob mismatches. The required source/test/package/assets scope (`src/`, `scripts/`, `tests/`, `assets/`, and package files) contained 590 files per archive. Across the filtered candidate and baseline archives, the only differing file was `tests/game-battle.test.js`; no production, package, or asset object differed.

Before/after SHA-256 manifests are `fences/baseline-archive2-before.sha256`, `fences/baseline-archive2-after.sha256`, `fences/candidate-archive2-before.sha256`, and `fences/candidate-archive2-after.sha256`. Both archives had 728 files before and after, with zero changed hashes. Git blob comparison manifests are `fences/baseline-archive2-git-blob-fence.txt` and `fences/candidate-archive2-git-blob-fence.txt`.

The exact candidate test file is copied as `candidate-game-battle.test.js`. Its Git blob is `88d60de535858cec9ab9019daa09b683fe70b645`, SHA-256 is `d57a3fe11aa1c067a64d4f65896ee66d9411c6ce197fb55d6fa87b34b3cf114e`, and size is 27,354 bytes. The accepted baseline test blob is `9fa1fcb5933439e4707be6d7f4fc699c5b1b446d` (SHA-256 `00b6aee55089af1bee56bb1003cc553ddd780db43ac3c4a33c6bad4aaa2cde34`).

## Source-contract checks

- The accepted `#materialize` implementation derives each member's `spawnTick` from the validated policy's `deploymentInterval.ticks`, scheduling later members while reserving the full `entityIds` list in the deployment receipt. The independent execution confirms actual receipt IDs `[1..6]` south and `[7..12]` north, with members 2–6 appearing at ticks 6, 12, 18, 24, and 30.
- `src/shared/session-troop-source-confidence-authority.js` binds each claimed field to its required QUESTION value and provenance, refuses missing QUESTION records, and fixes the deployment receipt to source ID `supercell-2020-06-02-multi-unit-deployment`, 100 ms, 6 ticks. The historical source-contract change at `a2952bf5df33fa1cbe309d963d4ecf4cf166386a` added provenance checks for bound source-confidence claims. A generic QUESTION source remains source text subject to canonical bounds and Unicode scalar validation; a valid surrogate pair is accepted, while a lone surrogate is rejected.
- The accepted air-swarm source audit ties the 100 ms member interval to Supercell's June 2, 2020 note and explicitly leaves first-member onset, geometry, orientation, and historical member order unresolved. `reference/stats/SOURCES.md` records the general millisecond normalization and cautions against treating low-confidence fields as authoritative. No low-confidence stats value was used as a pass/fail oracle.

No builder README, probe, result, or evidence file was read. The isolated archive and logs contain no whole-repository archive, dependency cache, or `reference/` copy.
