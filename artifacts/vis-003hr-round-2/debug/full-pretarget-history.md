# VIS-003HR round 2: full pre-target presentation history reproduces the mismatch

**Verdict: diagnostic FAIL. The strict 140-tick restore witness reproduces the same two-pixel mismatch; this is not a full-piece PASS.**

The isolated fresh-first Bulwark witness was given the pre-target chooser/deck/opening/selected/deployed block from `tests/game-browser-building-choice.test.js`: standard-opening/focus inspection and screenshot, chooser geometry inspection and screenshot, pending-choice inspection, selected-deck opening/session/HUD/policy inspection and screenshot, card selection inspection and screenshot, then deployment/session/art/marker inspection and screenshot. The already-deployed structure entered the minimal target-key loop at tick 1; it acquired `unit:4` at tick 114 after 113 additional ticks. The existing strict 140-tick forward/restore witness was unchanged. This variant did not add the separate standard-arena restore round-trip or the later defensive-combat screenshot.

Executed from `/tmp/vis-003hr-r2-freshfirst.2t92tN`:

```sh
GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs \
GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
BROWSER_FRAME_RESTORE_ARTIFACTS=/tmp/vis-003hr-r2-full-pretarget-history/evidence/ \
node --test tests/browser-frame-restore-full-pretarget-history.test.js
```

Chrome `154.0.8037.97`, viewport `720×1280`; process exit 1, TAP 1 test / 1 failure, test duration 4.971 seconds (7.079 seconds total). The unchanged strict restore assertion failed with checkpoint SHA-256 `f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a` versus restored SHA-256 `31d39f784166db05224f6a7890660ea420755e029559e75665c0393959ba8a29`. The full-frame difference is exactly 2 changed pixels, maximum channel delta 1; both consecutive checkpoint captures match, and both consecutive restored captures match. The art crop is exact (0 changed pixels), browser/session/paint/elixir state is exact, and there are no console or page errors. Forward tick was 254.

This group is sufficient to reproduce the mismatch in the minimal witness. It implicates the pre-target presentation-history block as a causal region, but does not identify which screenshot or inspection operation within that block is responsible. The five intermediate screenshots, checkpoint/forward/restore frames, full JSON, and path-adjusted diagnostic test source are preserved here. The source imports the repository's helpers/server and was `node --check`ed after relocation; the executed variant was the temporary test source.
