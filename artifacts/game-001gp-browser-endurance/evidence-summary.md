# GAME-001GP browser endurance evidence

The shipped scheduler ran the exact GAME-001GH workload in real Chrome at a
720×1280 viewport. The sustained-play caps are 50 ms for driven LongTasks and
40 ms for each explicit public `GameSession.stepMany(1)` slice. Initialization
LongTasks are reported separately against their 300 ms cap.

## Final exact selector

Command: `npm test -- game-browser-endurance`

Artifact: `endurance-result.json`

| Metric | Result |
| --- | --- |
| Browser artifact duration | 488,817 ms |
| Terminal / restart | tick 18,000 terminal; restart tick 0, seed-zero bytes, restart count 1 |
| Maximum explicit simulation slice | 34.3 ms at 16,328→16,329 / 40 ms cap |
| Driven LongTasks | 0; maximum 0 ms / 50 ms cap |
| Initialization LongTasks | 2; maximum 190 ms / 300 ms cap |
| Restore/replay cut | 600→300→600 byte parity; preflight 5.1 ms; slice max 5.8 ms |
| Presentation/input/audio | exact transaction and cursor assertions passed |
| Console / unhandled / resource / pending errors | 0 / 0 / 0 / 0 |
| Browser server cleanup | `serverExited: true`, empty stderr |

`terminal.png` and `restart.png` are the final 720×1280 captures. The terminal
capture contains the visible result overlay and restart control. The restart
capture contains the fresh 3:00 board with no terminal overlay. The selector
also asserts terminal browser bytes against the direct GAME-001GH mirror and
the restarted bytes against a newly constructed shipped seed-zero session.

## Retained bounded evidence

| Artifact | Purpose | Result |
| --- | --- | --- |
| `endurance-baseline-c2ca58a-tick9000.json` | checkpoint A arm | failed at 8,700→8,701: 42.4 ms; driven LongTasks 0 |
| `endurance-optimized-prevalidated-shell-tick9000-sample1.json` | private setup-token B arm | 9,000 ticks; max 38.0 ms; driven LongTasks 0 |
| `endurance-optimized-prevalidated-shell-tick9000-sample2.json` | reproducibility B arm | 9,000 ticks; max 37.3 ms; driven LongTasks 0 |
| `endurance-preflight-tick1800-prevalidated-shell.json` | bounded restore/scheduler preflight | 1,800 ticks; max 17.3 ms; restore slice max 5.7 ms |
| `endurance-post-transcript-witness-tick16500-sample1.json` | final-code late-match sample | 16,500 ticks; max 34.1 ms at 16,328; driven LongTasks 0 |
| `endurance-post-transcript-witness-tick16500-sample2.json` | final-code reproducibility sample | 16,500 ticks; max 34.5 ms at 16,328; driven LongTasks 0 |

All retained bounded runs have empty console, unhandled, resource, and pending
error arrays and `serverExited: true`. Failed tuning attempts, rejected
experiments, and temporary profiler artifacts were removed.

## Final focused gates

| Command | Result |
| --- | --- |
| `npm test -- game-session` | 9/9, 72.777 s |
| `npm test -- game-history-cap` | 5/5, 95.224 s |
| `node --test tests/compact-capability-hostile.test.js` | 4/4, 1.698 s |
| `npm test -- nondeterminism-guard` | 9/9, 0.624 s |
| `npm test -- game-browser-loop` | 10/10, 8.013 s |
| `npm test -- game-input-bridge` | 6/6, 0.178 s |
| `npm test -- game-audio-runtime` | 10/10, 2.757 s |
| `npm test -- game-restart` | 3/3, 13.455 s |
| `node --test tests/game-battle.test.js` | 11/11, 22.367 s |
| `npm test -- attack-cycle` | 9/9, 0.057 s |
| `npm test -- audio-renderer` | 13/13, 1.122 s |

The standalone exact `game-session-endurance` selector was intentionally not
rerun before Chrome under the explicit round override; the 1,800-tick browser
restore preflight and the stronger exact terminal/restart selector cover the
requested final workflow.
