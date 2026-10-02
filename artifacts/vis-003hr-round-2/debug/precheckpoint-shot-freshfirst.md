# VIS-003HR round 2: pre-checkpoint screenshot probe

**Verdict: diagnostic PASS only. VIS-003HR full piece is NOT PASS; the original full-path strict restore mismatch remains unresolved.**

This one-variable probe added the same full-viewport `bulwark-defensive-combat` screenshot used by the full building-choice path to the fresh-first minimal Bulwark witness. It ran at the acquired target state, tick 114, immediately before `captureRestoreWitness` performs checkpoint state/paint reads. The strict equality bar, existing 140-tick forward branch, and two consecutive restored full-frame captures were unchanged.

Command, from `/tmp/vis-003hr-r2-freshfirst.2t92tN`:

```sh
GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs \
GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
BROWSER_FRAME_RESTORE_ARTIFACTS=/tmp/vis-003hr-r2-precheckpoint-shot/evidence/ \
node --test tests/browser-frame-restore-precheckpoint-shot.test.js
```

Chrome `154.0.8037.97`, viewport `720×1280`; process exit 0, TAP 1/1 passed, test duration 5.232 seconds (7.171 seconds total). The added screenshot was 142,754 bytes at tick 114. Its SHA-256 matched checkpoint, restored, and restored-repeat frames: `f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a`. The forward branch reached tick 254. Both strict restore comparisons reported 0 changed pixels and maximum channel delta 0. Console and page errors were empty.

This shows that inserting this screenshot alone into the fresh-first setup does not reproduce the mismatch. It does not rule out an interaction with earlier full-path setup or restore history. The full JSON and the added screenshot are preserved alongside this note.
