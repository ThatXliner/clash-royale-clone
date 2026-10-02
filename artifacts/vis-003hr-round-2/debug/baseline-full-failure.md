# VIS-003HR round 2: original full-path failure reproduced

**Verdict: original full building-choice strict restore check FAILS.** This is a reproduced 2-pixel mismatch, not a full-piece PASS.

The test ran once from an immutable `git archive e984d03` at `/tmp/vis-003hr-r2-fullbaseline-e984d03/source`, using the test and `tests/helpers/png-crop.js` exactly from that commit. The viewport equality is strict SHA-256 equality; art crops are decoded on a blank page from the captured full PNGs.

Executed command:

```sh
GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs \
GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
GAME_BROWSER_BUILDING_CHOICE_ARTIFACTS=/tmp/vis-003hr-r2-fullbaseline-e984d03/evidence/ \
node --test tests/game-browser-building-choice.test.js
```

Chrome `154.0.8037.97`, viewport `720×1280`; process exit 1, TAP 1 test / 1 failure, test duration 4.787 seconds (6.885 seconds total). The strict assertion failed at `tests/game-browser-building-choice.test.js:576`:

```text
restored full viewport must be pixel-identical with the post-restore crop derived off-page:
checkpoint=f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a
restored=31d39f784166db05224f6a7890660ea420755e029559e75665c0393959ba8a29
changedPixels=2, maxChannelDelta=1 (720x1280)
```

The second restored screenshot was byte-identical to the first restored screenshot, so the two-pixel difference was stable across consecutive post-restore captures. Console and page errors were empty. The JSON and checkpoint/restored/repeat PNGs preserve the measured result; the defensive-combat screenshot shows the pre-checkpoint scene.
