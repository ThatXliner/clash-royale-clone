# VIS-003HR round 2: post-restore rich inspection probe

**Verdict: diagnostic PASS only. VIS-003HR full piece is NOT PASS; the original full-path strict restore mismatch remains unresolved.**

This probe inserted the same rich DOM/style/geometry read performed by `renderedState` in `tests/game-browser-building-choice.test.js:513-515` after the minimal witness's restored `stateBytes` read and before its existing `paintState` read and full-frame screenshots. The Bulwark target branch stayed at tick 114, advanced 140 ticks, restored, then captured two consecutive full viewport frames. The byte-equality and pixel-delta assertions were unchanged.

Executed from the repository root:

```sh
GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs \
GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
BROWSER_FRAME_RESTORE_ARTIFACTS=/tmp/vis-003hr-r2-postrestore-inspection/evidence/ \
node --test artifacts/vis-003hr-round-2/debug/postrestore-rich-inspection.test.mjs
```

Chrome `154.0.8037.97`, viewport `720×1280`; process exit 0, TAP 1/1 passed, test duration 5.738 seconds (7.613 seconds total). There were no console or page errors.

Checkpoint tick 114 (`unit:4`) advanced to tick 254. Checkpoint, restored, and repeated-restored full-frame hashes all equal `f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a`. Strict restore and restored-pair comparisons both reported 0 changed pixels and maximum channel delta 0. Browser/session/paint/elixir evidence remained exact; the post-restore rich inspection also found exact browser/session bytes and the expected visible target link.

This shows that adding this rich inspection alone to the fresh-first minimal path does not reproduce the mismatch. It does not reproduce the complete building-choice presentation history or establish a full-piece PASS. The diagnostic test source, full evidence JSON, and representative checkpoint/forward/restore PNGs are included here.
