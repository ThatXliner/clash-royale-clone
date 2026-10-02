# VIS-003HR round 2: target-loop read probe

**Verdict: diagnostic PASS only. VIS-003HR full piece is NOT PASS; the original full-path strict restore mismatch remains unresolved.**

This bounded probe tested whether the full witness's per-tick Bulwark target-loop DOM/replay inspection caused the pixel mismatch. In an isolated temporary project copy, the minimal fresh-first Bulwark witness was changed to inspect the structure, marker, target links, replay attacks, and tick after each simulation step while retaining the 140-tick forward branch and strict full-viewport PNG checks. The loop reached the same checkpoint tick (114) as the uninstrumented witness. The test also asserted that tick explicitly. The cap differs by one step (240 versus 241), but neither cap was reached.

The isolated test command was:

```sh
GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs \
GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
BROWSER_FRAME_RESTORE_ARTIFACTS=/tmp/vis-003hr-r2-readprobe-targetloop-corrected/evidence-targetloop/ \
node --test tests/browser-frame-restore.test.js
```

It ran from `/tmp/vis-003hr-r2-readprobe-targetloop-corrected` against Chrome `154.0.8037.97`, viewport `720×1280`; process exit was 0 and TAP reported 1 test passed. It was a diagnostic temporary test variant, not the repository's full restore test.

Evidence in `targetloop-corrected.json` records tick 114, target `unit:4`, target marker enabled, one visible target link, and the prior attack at tick 113. The forward branch reached tick 254. Checkpoint, restored, and second restored full-frame PNGs all have SHA-256 `f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a`; the strict full-frame pixel comparison reported zero changed pixels and maximum channel delta zero. The repeated restored capture was also byte-identical. Elixir rail/fill telemetry and the remaining serialized browser/session/paint/arena/layer/HUD/input evidence are preserved in the JSON.

This falsifies the hypothesis that those per-tick target-loop reads alone cause the two-pixel mismatch from the original full path. No game CSS or runtime source was changed. The checkpoint, forward, restored, and restored-repeat screenshots are included as `targetloop-*.png`.
