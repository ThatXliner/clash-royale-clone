# VIS-003HR round 2: prior standard restore history probe

**Verdict: diagnostic PASS only. VIS-003HR full piece is NOT PASS; the original full-path strict restore mismatch remains unresolved.**

This one-variable probe added the existing standard-arena `captureRestoreWitness` phase to the fresh-first minimal Bulwark witness, on the same page and before opening the deck chooser. The standard phase used its unchanged two-tick branch, restore, settle, strict full-frame captures, and evidence comparisons. The Bulwark witness then followed the unchanged tick-114 targeting and 140-tick forward/restore path.

The executed temporary test was `/tmp/vis-003hr-r2-freshfirst.2t92tN/tests/browser-frame-restore-prior-standard.test.js`. From that directory it ran:

```sh
GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs \
GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
BROWSER_FRAME_RESTORE_ARTIFACTS=/tmp/vis-003hr-r2-prior-standard/evidence/ \
node --test tests/browser-frame-restore-prior-standard.test.js
```

Chrome `154.0.8037.97`, viewport `720×1280`; process exit 0, TAP 1/1 passed, test duration 9.093 seconds (11.022 seconds total). There were no console or page errors.

For the standard arena, tick 0 advanced to tick 2 and restored exactly. Checkpoint, restored, and repeated-restored full-frame hashes all equal `d7ba0c8ace669d4159878b6f796bdb997ecf6561f3fec00b8fdb6260d1d5c9a5`; the strict comparison reported 0 changed pixels and maximum channel delta 0. The following Bulwark branch began at tick 114 (`unit:4`), advanced to tick 254, and restored exactly: checkpoint and both restored hashes all equal `f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a`, with 0 changed pixels and maximum delta 0. Both witnesses also retained exact browser/session/paint/elixir state.

This falsifies the standard-arena capture/2-tick/restore phase alone as sufficient to reproduce the mismatch in the fresh-first setup. It does not rule out an interaction with the fuller chooser/deployment presentation history. `prior-standard-restore.test.mjs` preserves the diagnostic test source; its helper/server paths were adjusted to run from this repository artifact directory. A `node --check` passed; the relocated artifact-source command below is provided for reproduction but was not separately run:

```sh
GAME_BROWSER_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs \
GAME_BROWSER_CHROME='/absolute/path/to/Google Chrome' \
BROWSER_FRAME_RESTORE_ARTIFACTS=/tmp/vis-003hr-r2-prior-standard-replay/ \
node --test artifacts/vis-003hr-round-2/debug/prior-standard-restore.test.mjs
```
