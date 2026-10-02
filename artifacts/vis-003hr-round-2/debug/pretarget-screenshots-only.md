# VIS-003HR round 2: pre-target screenshots alone reproduce the mismatch

**Verdict: diagnostic FAIL. The unchanged strict 140-tick restore witness reproduces the same two-pixel mismatch; this is not a full-piece PASS.**

This split kept the normal chooser/card/deployment clicks and the five pre-target full-frame screenshots (`standard-opening`, `pre-match-choice`, `bulwark-opening`, `bulwark-selected`, and `bulwark-deployed`), while removing the additional DOM/style/layout inspection reads from the matched full-history variant. It retained the same minimal target-key loop, reached tick 114 targeting `unit:4`, ran the 140-tick forward branch to tick 254, and used the same strict full-frame captures/comparisons.

Executed from `/tmp/vis-003hr-r2-freshfirst.2t92tN`:

```sh
GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs \
GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
BROWSER_FRAME_RESTORE_ARTIFACTS=/tmp/vis-003hr-r2-pretarget-screenshots-only/evidence/ \
node --test tests/browser-frame-restore-pretarget-screenshots-only.test.js
```

Chrome `154.0.8037.97`, viewport `720×1280`; process exit 1, TAP 1 test / 1 failure, test duration 4.877 seconds (6.836 seconds total). Checkpoint SHA-256 is `f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a`; restored and repeated-restored SHA-256 is `31d39f784166db05224f6a7890660ea420755e029559e75665c0393959ba8a29`. The strict checkpoint-to-restore diff is 2 changed pixels, maximum channel delta 1. Checkpoint captures match each other; consecutive restored captures match each other. Browser/session/paint/elixir state is exact; the Bulwark art crop is exact and there are no console/page errors.

This shows the five-screenshot pre-target history, together with the necessary input path, is sufficient to reproduce the mismatch; the extra inspection reads are not required. This does not identify an individual screenshot as the root cause. The source, screenshots, and full JSON are preserved alongside this note. `pretarget-screenshots-only.test.mjs` has repository-relative helper/server imports and was syntax-checked after relocation.
