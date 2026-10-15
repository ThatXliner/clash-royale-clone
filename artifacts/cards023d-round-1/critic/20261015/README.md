# CARDS-023D bounded critic packet

Reviewed exact source commit `bcba6c76ec31215b6dac8208529a6c97b7274ca0` (parent `226c55248d5c3a6f77e87ef40bb9eb0f32cd5ebf`). The ten changed `src/` and `tests/` paths are identical at builder evidence tip `f80c0899a3659a42a4a4033476e37216fc595d73`; no other builder-tip changes were used for this verdict.

## Actual catalog receipt

`profile/aether-profile-probe.json` is the pure Node output of `projectSessionNonUnitBattleCard("aether-well")`. The cost is 6; the actual profile values are HP 1070, deploy 60 ticks, generation 1, cadence 540 ticks, lifetime 3900 ticks, and destruction grant 1. The profile policy keeps HP/deploy/generation amount as QUESTION and cadence/lifetime/destruction grant as source-aligned. `profile/profile-assertion.stdout` records the independent comparison against those values and the rendered-stat expectations.

## Browser run

Run 1 failed before Chrome launch (exit 1): an explicit `GAME_BROWSER_PLAYWRIGHT=playwright` override was treated as a repo-relative file path by `scripts/release-browser-qualification.js`. Its raw output and exact exit are retained in `runs/attempt-001/`.

Run 2 used the supported default module resolution with the override unset. Command: `node --test tests/app-shell.test.js`, Node 22.22.3, private Playwright 1.58.2, native Google Chrome 155.0.8059.40, no GPU flags. The test passed 1/1 with exit 0 in 60,631 ms. Raw TAP, process/session metadata, and unmodified browser evidence are in `runs/attempt-002/`.

The actual rendered phone and desktop screenshots are in `screenshots/`. Both show cost 6 elixir, health 1,070 (QUESTION), deploy 1 s (QUESTION), generation 1 elixir (QUESTION), interval 9 s, lifetime 65 s, destroyed 1 elixir, and `Resource · does not attack`. The passing DOM assertions compare the actual `.stat-cell` text to these values and reject `Damage`, `First hit`, `Hit speed`, `Range`, `Splash radius`, `NaN`, and `undefined`; the description also states that it does not attack.

The browser measured no horizontal overflow: phone viewport/document width 390, detail box x=12..378 (366 wide); desktop viewport/document width 1440, detail box x=892.453..1367.984 (475.531 wide). Screenshots were inspected directly. The Aether Well portrait remains a blank gradient placeholder, outside this information-only scope.

`source-fence-and-prehashes.json` and `post-test-fence.json` record exact path identity and package/source/test checks. `SHA256SUMS.txt` covers this packet's retained files.
