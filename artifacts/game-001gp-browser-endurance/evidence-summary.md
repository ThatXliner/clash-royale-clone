# GAME-001GP browser endurance evidence

Chrome ran at a 720×1280 viewport. The driven scheduler cap is 50 ms; the
separate initialization cap is 300 ms. Both are reported independently so the
first module/shell mount is not hidden by the sustained-play measurement.

## Historical clean 900-tick tuning run

This predecessor run used the first coalesced scheduler configuration before
later diagnostic rewrites replaced `endurance-result.json`:

| Metric | Result |
| --- | --- |
| Duration | 21,703 ms |
| Initialization max | 219 ms / 300 ms cap |
| Driven max | 0 ms / 50 ms cap |
| Segment elapsed times | tick 300: 2,583 ms; tick 600: 2,928 ms; rewound tick 600: 2,866 ms; tick 900: 3,574 ms |
| Console / unhandled / resource errors | none / none / none |
| Server cleanup | `serverExited: true` |

It also exercised the real divergent restore/replay cut and cancellation path.
It is tuning evidence only, not an 18,000-tick selector pass.

## Blocked base-commit diagnostics

`endurance-attempt-1-failed-tick1200.json` and
`endurance-attempt-2-failed-tick900.json` are failed default-selector attempts.
Attempts 3–7 are bounded Chrome diagnostics that varied presentation cadence
and fixed `stepMany` batch size without changing the GAME-001GH workload.
They consistently show a clean browser surface and server cleanup, but a
driven long task above the 50 ms cap as continuation history grows. The final
attempt used a three-tick simulation batch, 100-tick transactional
presentation cadence, and `RAF → scheduler.yield() → RAF`; it reached a
52 ms driven task at tick 900. Therefore this directory is evidence of a
blocked base `0b09af4` integration, not a pass claim.

`active.png` was visually inspected: it shows the complete active 720×1280
shell at tick 300 with HUD, arena, both sides' structures, river, card hand,
and live units aligned. Terminal/restart screenshots cannot exist until the
50 ms gate is satisfied through tick 18,000.
