PIECE: GAME-001GP — browser endurance harness long-task attribution
VERDICT: PASS
EVIDENCE:

Focused delayed-entry test:

```text
> node --test --test-name-pattern='delayed long-task entries' tests/game-browser-endurance.test.js
TAP version 13
# Subtest: game browser endurance: delayed long-task entries retain their measured interval
ok 1 - game browser endurance: delayed long-task entries retain their measured interval
  ---
  duration_ms: 1.477166
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
```

The synthetic test appends a 51 ms task from `drive-0` and a 52 ms task from `restore-0` only after a later drive batch. Both remain mapped to their timestamp-overlapping intervals, and the unchanged 50 ms cap assertions reject each.

Requested browser run:

```text
> GAME_BROWSER_ENDURANCE_TICKS=900 npm test -- game-browser-endurance
> original-card-battler@0.0.0 test
> node tests/content-schema-runner.js game-browser-endurance

TAP version 13
# Subtest: game browser endurance: delayed long-task entries retain their measured interval
ok 1 - game browser endurance: delayed long-task entries retain their measured interval
  ---
  duration_ms: 1.469292
  type: 'test'
  ...
# Subtest: game browser endurance: exact GH seed-zero workload yields through Chrome to terminal
ok 2 - game browser endurance: exact GH seed-zero workload yields through Chrome to terminal
  ---
  duration_ms: 57657.680792
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
```

The generated `artifacts/game-001gp-browser-endurance/endurance-result.json` reports four intervals ending at ticks 300, 600, replayed 600, and 900; maximum initialization task 211 ms; zero drive or restore long tasks; and a completed final observer drain with 0 pending records, 0 newly observed records, and 2 total observed records. The harness still defines the initialization cap as 300 ms and the drive/restore cap as 50 ms. Source inspection confirms entries are retained append-only, matched against every interval by timestamp overlap, pending observer records are drained during reads, and the final drain asserts the caps again.

BIGGEST GAP: The modified attribution path has not yet been exercised by the default 18,000-tick Chrome run; this run covered 900 ticks and the real final drain received no late entries.
