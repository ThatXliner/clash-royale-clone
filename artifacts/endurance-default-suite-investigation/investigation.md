# Browser endurance default-suite failure

The default-suite failure came from the test harness assigning an initialization task to the first simulation segment. It does not demonstrate a production performance regression.

In the failing run, the observer reported a 152 ms task starting at page time 285.1 ms. It ended at 437.1 ms, while the first `driveEnduranceSegment` started at 454.7 ms. The task therefore finished 17.6 ms before the measured workload began. The harness cleared its long-task array after sampling initialization and then assigned every entry delivered by the observer to the next segment. `PerformanceObserver` delivers entries asynchronously, so the entry crossed that array reset and was incorrectly checked against the 50 ms drive cap.

The suite runs its child tests sequentially through `spawnSync`; the earlier 18,000-tick `game-session-endurance` test had finished before this browser test started. The failed browser segment's own instrumentation measured a maximum 7.6 ms simulation slice, 24.8 ms audio presentation, and 0.1 ms DOM commit. Existing round-six browser evidence completed all 18,000 ticks with no driven long tasks and a 169 ms maximum initialization task under the existing 300 ms initialization cap.

I updated [game-browser-endurance.test.js](/Users/me/.codex/worktrees/9456/clash-royale-clone/tests/game-browser-endurance.test.js:711) to classify observer entries by their recorded time interval. Tasks ending before the first drive remain subject to the 300 ms initialization cap; tasks that overlap a driven segment remain subject to the unchanged 50 ms cap. Other out-of-segment tasks are retained separately. The default workload remains 18,000 ticks.

After the change, an isolated 900-tick diagnostic run passed in 59.9 seconds. It reproduced the timing pattern: a 221 ms task ended before the first drive began, was counted as initialization under the 300 ms cap, and no driven task exceeded 50 ms. This exercised the same attribution seam, restore, and segment cadence without another full 14-minute run. The full 18,000-tick default browser run was not repeated; the existing round-six result supplies that workload evidence.

Evidence: [diagnosis.json](/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/endurance-default-suite-investigation/diagnosis.json) and [targeted-900-result.json](/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/endurance-default-suite-investigation/targeted-900-result.json). The original default-suite log and result remain under `artifacts/default-suite-2026-09-07/`.

## Delayed delivery coverage

The first correction was incomplete because it matched only entries returned in the current read. The harness now keeps all observed entries and rematches them against every recorded drive and restore interval. Each read drains pending `PerformanceObserver.takeRecords()`, and a final drain runs after browser activity. A late entry from an earlier interval therefore remains checked against that interval's 50 ms cap.

A synthetic delayed-delivery test feeds the earlier drive's 51 ms entry and restore's 52 ms entry only after a later drive has completed. It confirms both entries still map to their original windows and each window cap rejects its overrun. The final focused 900-tick browser run passed: initialization max was 168 ms under the 300 ms cap, driven max was 0 ms, restore max was 0 ms, and the final observer drain completed. The run covered segment ticks 300, 600, replay 600, and 900. See [the updated run result](/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/endurance-default-suite-investigation/delayed-delivery-900-result.json).
