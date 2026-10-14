# GAME-001GPX selected setup harness preparation

Candidate base: `6a646216c77abc24907a8039c1ebfe11c9167822`.

The harness now builds defensive profiles, card costs, and radius-question values from a `GameSession`-validated setup. The original default-eight setup still hashes to `306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`; its 0/300/600/900 snapshot hashes and normalized planned commands match the pre-change receipt in `default-decision-baseline.json`. The selected Kilnkeeper deck is created by `createEditableGameSessionSetup` and hashes to `9b2a1c5a86c2d5c0c2d623389b69c465409e65d5d84988591630b980ee7b3ba9`.

The workload suite passed 7/7. The default-eight bounded Chrome smoke and selected Kilnkeeper bounded Chrome smoke each passed 2/2 at 900 ticks through the production one-tick yielding driver. The Kilnkeeper run performed a real south-side browser gesture at tick 0, used the selected roster's cost of 5, and advanced the deck once. The seeded north AI deployed Kilnkeeper at tick 60, moved from its legal launch point before tick 300, and recorded three typed projectile contacts through tick 411. The 600→300→600 restore comparison reproduced those exact projectile events along with the browser/direct session, input bridge, audio continuation, and projected view assertions.

The browser smoke measurements stayed within the unchanged 50 ms lifecycle, 300 ms initialization, 40 ms explicit one-tick slice, 30 s segment, and 1,200 s total limits. These 900-tick runs are explicitly labeled bounded smoke. No 18,000-tick default run or natural-terminal Kilnkeeper run was performed here. The no-override Kilnkeeper qualification path continues to the real terminal or 18,000-tick bound, requires a natural terminal to pass, and checks that restart returns to the same selected setup.

Raw TAP, browser telemetry, screenshots, source hashes, and the saved pre-change default decision receipt are retained in this directory. `run-summary.json` records the command and qualification status for each run.
