# CARDS-022Q independent full qualification

**Verdict: FAIL.** The exact-source default-eight full journey passed. The separate Brackenwheel full journey failed its paid-south-deployment workload assertion before natural terminal/restart. The required audio gates were therefore not run.

## Scope and coverage

Source HEAD: ac224e9d8fa3e2797ea04c3e27b941abf18239c3 in a clean detached private checkout at /tmp/cards-022q-critic-ac224e9. Runtime: Node 22.22.3, npm 10.9.8, private Playwright 1.58.2, native Google Chrome 155.0.8059.40. Both endurance commands used the explicit Chrome and Playwright paths; no tick override was supplied. The default command explicitly left both scenario and tick variables unset. No production, test, harness, package, or limit edits were made.

The requested gates total 22 cases (3 default endurance, 3 Brackenwheel endurance, 11 host audio adapter, 5 native production audio). Only the two sequential endurance gates were attempted: five of six endurance subtests passed and one failed. The 11 adapter and 5 production-audio cases were not run because execution stopped on the first nonzero gate, as instructed. This verdict does not qualify full 22-case acceptance.

## Default-eight full run — PASS, 3/3

Direct npm PID 36636 exited 0 after 982.381 seconds. The unshortened 18,000-tick full run reached natural terminal at tick 18,000, then passed the same seed-zero deck restart assertion. TAP, direct exit, raw stdout/stderr, JSON, and active/terminal/restart screenshots are in attempts/default-eight/.

The recorded journey lasted 979,342 ms across 67 segments, with a longest segment of 10,363 ms. Initialization long-task maximum was 186 ms; no driven/noninitial long tasks were recorded. The largest measured session-step slice was 31.9 ms and largest measured operation was 35.2 ms. These are within the supplied 300 ms initialization, 50 ms noninitial long-task, 40 ms synchronous-slice, 30,000 ms segment, and 1,200,000 ms journey limits. Restore evidence records rewind 600→300 and the typed future-audio continuation counts match 29/29; UI sequence remained 2 across restore and advanced to 4 after replay. Natural terminal/restart and screenshots are present in the actual run JSON/evidence.

The artifact prefix for this run had no trailing slash. The harness concatenated its filenames, so the real files are attempts/default-eight/evidence/browseractive.png, browserterminal.png, browserrestart.png, and browserendurance-result.json. This was only an evidence-path quirk; the run completed without changing test inputs.

## Brackenwheel full run — FAIL, 2/3

Direct npm PID 39978 exited 1 after 300.934 seconds. The custom setup SHA is 2207fce9a5a9c64ebca77acd12bae175bfcc0e05ddb94886b7354ccc50f1a15b and the selected deck is [brackenwheel, briar-band, coilblade, mossguard, ironroot, copperskiff, brassbolt, reedsting]. The first two host-contract subtests passed; the browser journey failed.

The real browser evidence confirms the Brackenwheel primary target (ID 2) took 267 damage at tick 234 and the three secondary targets (IDs 4, 5, 6) each took the same area contact once. The 600→300 restore and typed replay checks completed. For the paid-south cadence, the last accepted deployment is Mossguard at tick 6000 (browser command ID 12); the recorded decisions at 6300, 6600, and 6900 are all no-plan. The last completed persisted segment is tick 6900; final direct-step phase records advance from there through tick 7200, when the cadence assertion fails.

Raw TAP says: “the endurance policy makes one paid south deployment in every 900-tick window”, false !== true, at tests/game-browser-endurance.test.js:1218:14. The exact raw TAP and direct exit are in attempts/brackenwheel/. The persisted result JSON has terminal=null and runOutcome=null, and contains no current-state field; it does not establish a terminal result or restart. Only the active screenshot was captured. No natural-terminal or restart evidence exists for this failed journey.

**Single biggest gap:** the custom scenario reaches tick 7200 without a paid south deployment after tick 6000, violating the required 900-tick workload guard before this run can prove natural terminal/restart.

## Source fences and process release

Before/after source fences match for both gates: 151 src files SHA-256 261e931919d82d4cf97de948868986d854545621a756e8eb7c5f149c565e0ba8; 363 test files 8d5465551eb82a101c20b8c56a4f72d826c5509ddddb1606ede536cfb5cedd32; 32 public files 213dc79314122bd89beb971520a0952e7d6e301448914e4f8616b4b2e457edb9; 2 package files 3550cb2b748ca3107410e980137d24b374db0bed14ba0e9fd723d89b85493566; 5 harness files 767d80f566f6e7e2ab705f1fb1cf7f6e313062c9e7408f50d2f69ec42a146b14. The lockfile SHA is d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4; kernel SHA is 115c43146f5818c69a98120e856ddaa5d20243fced3609320d90edc7ae933bea. Both private source fences are equal, and the checkout stayed clean at the exact requested HEAD.

Both owned npm process IDs are closed. User Chrome PID 93861 remains at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome with its recorded start time unchanged (Thu Oct 15 07:43:36 2026). The browser/CPU window is released.

The complete bounded evidence packet, including raw TAP, stdout/stderr, direct-exit records, screenshots, actual result JSON, per-gate source fences, and checksum lists, is under /tmp/cards-022q-critic-ac224e9-evidence/. The previously accepted artifact was used only as a command/scope guide; it was not substituted for this run. No 109-card or physical-speaker parity claim is made.
