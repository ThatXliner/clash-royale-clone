PIECE: GAME-001GP — browser endurance harness long-task attribution
VERDICT: FAIL
EVIDENCE:

Requested bounded run:

```text
> original-card-battler@0.0.0 test
> node tests/content-schema-runner.js game-browser-endurance

TAP version 13
# Subtest: game browser endurance: exact GH seed-zero workload yields through Chrome to terminal
ok 1 - game browser endurance: exact GH seed-zero workload yields through Chrome to terminal
  ---
  duration_ms: 57881.721042
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 60035.027459
```

The resulting `artifacts/game-001gp-browser-endurance/endurance-result.json` reports 900 ticks in 57,786 ms, four measured segments ending at ticks 300, 600, 600, and 900, zero long tasks assigned to those segments, zero `outOfSegmentLongTasks`, and no long tasks sampled during restore. It reports two initialization tasks of 94 ms and 171 ms (171 ms maximum against the 300 ms cap); the first drive began at 473.2 ms. The 900-tick selector passed, including its restore/replay assertions, but it did not produce a delayed-delivery boundary case.

Prior full-workload evidence in `artifacts/game-001gp-browser-endurance/round-6-result.json` records tick 18,000, 61 segments, 829,776 ms, zero driven long tasks (0 ms maximum), a 169 ms maximum initialization task, terminal tick 18,000, and restart tick 0. This supports the earlier workload result; it does not verify the changed attribution path.

Source inspection finds a remaining hole: each read advances `longTaskCursor`, then classifies new entries against only the *current* segment interval. If an observer entry from a driven segment is delivered after that segment's read, a later segment classifies it as `outsideSegment`; that bucket has no 50 ms assertion, and the entry is never reconsidered against the earlier segment. The restore read similarly checks duration without matching timestamps to a restore interval, while there is no final observer drain after the last drive. Thus delayed delivery can be missed or reclassified despite the unchanged cap assertion on entries that happen to arrive in time. No synthetic delayed-entry test exercises this boundary.

BIGGEST GAP: A long task overlapping an earlier driven segment but delivered during a later segment is placed in the unchecked out-of-segment bucket, so the harness can miss a driven task over the 50 ms cap.
