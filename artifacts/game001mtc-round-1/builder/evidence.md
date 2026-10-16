# GAME-001MTC builder evidence

## Causal finding

The movement goldens were captured against the historical `6a2f26dc89f1fab9978d1a6e00cfb7c2f19016a` tree. Its `mossguard` witness and the current accepted `69daeff24563aff5df5379f36ef9c27f5582307c` witness contain the same eight cards in the same order. The only witness differences are the two Briar Band entities gaining source-confidence policies and their QUESTION receipts: ten fields for Briar Runner and ten for Briar Darter. The policy fields add 2,410 canonical roster bytes; the 20 QUESTION records add 3,703 bytes. The witness therefore grows from 15,562 to 21,675 bytes, exactly 6,113 bytes.

This is the source-evidence change introduced by `c981ec2444b9d2f08dacdb5c6f04ce6b5b786dfb` (“Add sourced staggered troop spawning”): Briar Band receives two source-confidence policies and a sourced 100 ms / 6-tick member interval, while the playable-roster witness serializes the associated confidence fields as unverified QUESTION records. The deployed scenario uses Cinderlings; Briar Band is present only in the eight-card witness.

The historical tree reproduces both former controls exactly. In both trees, the state digest, full public `battle.events` digest/count, and serialized snapshot after removing only `setup` are identical at ticks 120, 200, and 320. This isolates the changed goldens to setup witness data, with no changed movement outcome in this scenario.

| Tick | Historical bytes / SHA-256 | Current bytes / SHA-256 | Same state / full events / snapshot without setup |
| --- | --- | --- | --- |
| 120 | 417,386 / `0263778593d12c500721bb3914123269940e3e702ae5fc841f93613d2c2d0cb5` | 423,499 / `538f8a87fe8478881ffd035bf6ddf30972c9a5daa4f5420f46bfea20d002cf5b` | Yes; 880 events |
| 200 | 64,073 / `07525d6e712c40fe9c9bb473f173ae7604f224a04f67eef12c0a0d3fc319d02d` | 70,186 / `63c23019fc6aadaedb47a72a79a24dae266970a281eb8aca8978d008b6f80996` | Yes; 1,383 events |
| 320 | 51,720 / `4b2f4143a90f7b60fe328bc421b63234f1e3aba188742fe7d4e1a004eb380ae3` | 57,833 / `1ad523a67b1bcc758e089e6781b567b313e5ee79e0c808c89395357b2fd90529` | Yes; 1,430 events |

Attempt 01 retained its exact script and raw streams; it hashed concatenated `step()` return events, which omit the scheduled-command receipts. Attempt 02 uses `battle.events`, the test's full public log, and is the authoritative event comparison. Both attempts exited 0. Their scripts, argv/cwd/environment records, direct PIDs, raw stdout/stderr and pre-run production fences are retained in their respective directories.

## Candidate change and verification

Only the tick-120 byte count/hash and tick-200 control SHA in `tests/game-roster-troops-movement.test.js` changed; the comment records the witnessed source-confidence additions. Existing 320-tick behavior, health, targets, deaths, redeploys, schedules, restore, fork, chunk and snapshot-purity assertions remain intact.

`npm run test:game-roster-troops-movement` passed 16/16 tests with zero failures or skips (214.86 seconds). This includes the full two-Cinderlings 320-tick continuation, ordinary-only 320-tick restore/fork/chunk comparison, and intermediate-serialization schedules/cuts. The exact candidate test, runner and package source copies plus raw test streams and process IDs are in `attempt-03-movement-test/`.

The `src`, package manifests and shipped asset trees were unchanged before and after the run; source-tree fence digests are recorded in `attempt-03-movement-test/source-fences-before.txt` and `source-fences-after.txt`.
