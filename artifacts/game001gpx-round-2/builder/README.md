# GAME-001GPX round 2 builder evidence

Candidate starts at `ac45251686288696f8033f9490e7bcedf8909825`, preserving the accepted round-1 delta. The change is limited to `tests/game-browser-endurance.test.js` and these builder-owned artifacts. No production source, browser HTML, or workload helper changed.

The browser harness now records typed cues and starts at the existing `GameAudioRuntime` method boundary while returning each original result unchanged. It compares actual `BrowserPcmAudioSink` observations against those typed runtime starts by domain, sequence, cue id, type, family, and tick. UI cue domains are classified only from the shipped UI source-type set; unrecognized sink types must match a captured simulation cue, then pass exact full-identity comparison. Restore stores and compares real before/after sink observations and preserves the independent UI sequence and command count. Replay checks typed simulation continuation plus the incrementing UI sequence. Actual branch evidence contains both UI and simulation sequence 0 without aliasing.

Verification:

- `endurance-workload-final.tap`: focused workload tests, 7/7 passing.
- `audio-identity-mutation-probe.tap`: typed cue/domain identity probe, 1/1 passing. Changed cue identity and changed domain both fail the comparator; production producers were not mutated.
- `browser-default-900-final.tap`: default-eight bounded 900-tick Chrome smoke, 3/3 passing. Setup hash: `306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`. Typed actual sink starts: branch 55, after restore 55, after replay 86; UI sequence 2 → 2 → 4.
- `browser-kilnkeeper-900-final.tap`: selected Kilnkeeper bounded 900-tick Chrome smoke, 3/3 passing. Setup hash: `9b2a1c5a86c2d5c0c2d623389b69c465409e65d5d84988591630b980ee7b3ba9`. Typed actual sink starts: branch 54, after restore 54, after replay 83; UI sequence 4 → 4 → 6.
- Full browser result JSON and `active.png` captures are in `browser/default-eight-final/` and `browser/kilnkeeper-final/`.

`browser-default-900.tap` and `browser/default-eight/` retain the first failed attempt unchanged. That run reached the restore parity assertions but then failed while assembling telemetry because a captured local was block-scoped. The final rerun passes after keeping those actual captured observations in outer continuation state.

Source fence at candidate HEAD: `ac45251686288696f8033f9490e7bcedf8909825`; `git status --short -- src` and `git diff --name-only -- src` were empty. Default remains the full 18,000-tick strict mode, with existing 50ms long-task and 300-tick segment caps unchanged. Both browser commands explicitly used `GAME_BROWSER_ENDURANCE_TICKS=900`; these are bounded smokes only and do not claim natural-terminal or full qualification.
