# Independent critic receipt — ship-current round 1

## Verdict

Scoped runtime, card-confidence, art, and current-runtime endurance checks pass for clean source candidate `7cb314331c2ebd0a2cabad806fa951740597ef61`. The 18,000-tick browser endurance completed under the unchanged 50 ms lifecycle and 300 ms initialization caps. Overall publication qualification remains pending the separate release-packaging critic's `test:release-build` result and the live Pages smoke after deployment. This receipt makes no 109-card parity claim.

The checked-in packaging-only commits through local `HEAD eeb0fab3091aee7345af9e061908877710a2fdb8` change `scripts/build-release.js` and `tests/release-001b.test.js` in the source tree; the runtime/art/browser evidence below was executed against the clean `7cb3143` archive. My clean `build`, `build:pages`, and publication-pages test passed on that archive. I did not rerun `test:release-build`; it is assigned to the separate critic.

## CARDS-016K — PASS

- `tests/game-roster-troops-air-swarms.test.js`: 8/8. The new Gloamwing and Coppershade data keep each of ten low-confidence fields per card marked as an unresolved question, with estimates carried through typed snapshots. Eight direct `GameSession` admission probes reject missing policy, forged confidence, dangling question, and a mismatched estimate for both cards.
- `tests/game-roster-troops-ordinary.test.js`: 16/16; `tests/nondeterminism-guard.test.js`: 10/10; `tests/rl-environment.test.js`: 11/11.
- Exact serialized default-game snapshots match baseline `6dcf64b81751f69f9fe7520878ac136bda9143ed` at candidate `7cb3143` for seeds 0 and 23 at ticks 0, 120, and 900 (6/6 byte-identical; each SHA-256 is recorded in `legacy-default-snapshot-comparison.json`).
- The collection has 16 editable entries (15 troops plus Squall Orb); the default deck has 8. Both new swarms remain outside the editable/RL deck seam. This is scoped prototype behavior, not a 109-card parity result.

## ART-016P — PASS, scoped to the submitted asset

`tests/card-expansion-art.test.js` passed 2/2 and `tests/visual-asset-manifest.test.js` passed 6/6. I inspected the revised Coppershade flock at its native 64×64 rendering, saved as `coppershade-native-64px.png`: all six copper birds remain individually legible in a 3×2 arrangement. This verifies the asset at the requested size; it does not claim a separate in-collection screen integration review.

## Current runtime and publication-flow checks

The following passed on the clean 7cb candidate: nondeterminism and shipping-isolation guards (10/10, 13/13, and 4/4), RL environment (11/11), app shell in Chrome (1/1), real Chrome game journey through combat, terminal, restart, and repeat (1/1), release build (44 files, 5,443,322 bytes), Pages build (44 release files, 5,443,322 bytes), and publication-pages flow (5/5). The full logs are in this directory.

## PUB-003 — current-runtime endurance PASS

Ran `env -u GAME_BROWSER_ENDURANCE_TICKS npm run test:game-browser-endurance` from a clean archive with the default strict 18,000-tick workload. TAP passed 2/2. Chrome reached terminal at tick 18,000, then restarted at tick 0; the restored checkpoint rewound from tick 600 to tick 300. The run used 61 segments of 300 ticks, one-tick slices, and the `raf-scheduler-yield-raf` policy. The configured limits remained 50 ms for lifecycle work and 300 ms for initialization. Initialization's maximum observed long task was 158 ms; drive, out-of-segment, restore, terminal-observation, restart, final-drain, and screenshot long-task counts were all zero. There were no pending resources, resource errors, console errors, unhandled errors, or server stderr. Terminal audio was disposed at tick 18,000 with zero active voices, and restart audio was live at tick 0. The full telemetry, compact summary, and current-run active/terminal/restart screenshots are preserved under `endurance/`.

## Remaining release checks

The separate critic owns independent `test:release-build` qualification for the packaging repair. A public Pages URL has not yet been supplied for my live-browser smoke. Treat overall publication as pending until those checks complete.
