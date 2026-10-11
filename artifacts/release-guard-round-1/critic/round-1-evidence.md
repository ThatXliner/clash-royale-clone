# RELEASE-GUARD-001 critic evidence — round 1

Frozen source: `46c08c9480e7a4914784495edf96a6890539e78b`.

## Verdict

**FAIL.** The nondeterminism and shipping-isolation gates pass, spell behavior and legacy serialization pass, source sprite rendering/restoration passes, and the assembled Pages artifact qualifies. The strict full endurance run fails at tick 600: restore from 600 to 300 takes 51 ms against the unchanged 50 ms limit, so the run never reaches 18,000 ticks, terminal, or restart.

**Biggest gap:** the exact 600→300 browser restore produces a measured 51 ms long task, exceeding the 50 ms cap by 1 ms and aborting the endurance journey before terminal/restart.

## Non-browser gates

Commands were run from a clean Git archive of the frozen source with the existing `node_modules` symlinked in.

```text
npm test -- nondeterminism-guard
# tests 10
# pass 10
# fail 0
# duration_ms 857.029625
```

The analyzer remains bounded at `maxSourceBytes = 512 * 1024 = 524288`. `src/sim/battle-continuation-kernel.js` is 522226 bytes, 2062 bytes below the unchanged cap.

```text
npm test -- shipping-isolation-guard
# tests 13
# pass 13
# fail 0
# duration_ms 30712.240583
```

```text
node --test tests/game-spell-runtime.test.js tests/compact-capability-hostile.test.js
# tests 19
# pass 19
# fail 0
# duration_ms 2678.413584
```

The current spell path passes direct effect, radius, scheduling, restore, chunking, and atomic rejection cases. The legacy checks require a no-profile `GameSession` serialization to equal the canonical version-2 `{ setup, transcript: [], version: 2 }` bytes and require restore to reproduce those exact bytes; a no-profile `LiveBattle` also round-trips its version-2 bytes unchanged.

```text
node --test tests/combat-sprite-prototype.test.js
# tests 10
# pass 10
# fail 0
```

```text
npm test -- visual-asset-manifest
# tests 6
# pass 6
# fail 0
```

The asset registry check matched shipped files byte-for-byte and found no byte overlap with `reference/`.

## Browser and Pages evidence

```text
node --test tests/combat-sprite-prototype-browser.test.js
# tests 1
# pass 1
# fail 0
# duration_ms 14886.662625
```

The real source browser render passed at 720×1280 and 390×844. Both vector and painted comparison boards had 8 markers; dimensions were 540×960 and 292.5×520. The live battle rendered 15 Briar units at tick 120 in both viewports and used `./assets/briar-runner-painted-sheet.png`. The runner asserted no missing paths, page errors, or console errors. Restored screenshots were pixel-identical at both sizes; reduced-motion restores were also pixel-identical. Captures and structured output are in `sprite-browser/`.

```text
npm test -- app-shell
# tests 1
# pass 1
# fail 0
# duration_ms 34827.157667
```

The browser regression used a 14-card editable pool and a trusted-pointer Squall Orb radius cast (`squall-orb-radius-v2`): 689 damage, 6 elixir remaining, visible impact ring, exact pending-impact restore, and impact resolved after restore. Its built-release request list includes `public/assets/briar-runner-painted-sheet.png`. Browser output is in `app-shell/`.

The root Pages qualification reported success for `/tmp/moss-ember-release-review-20261011-r2` with 48 release files and 6929315 bytes. The critic independently checked all 48 manifest entries against packaged file sizes and SHA-256 values: **48/48 match**. The manifest contains the original registered painted PNG (987565 bytes, SHA-256 `a1aa43df00dacc212beedb4905dddd7a57db412981ea29662bc1d868a97794f4`) and vector SVG (7692 bytes, SHA-256 `5f25d05932e3c56f9a8dfce7ea9b9d02e9ad2fb34ef0ce983733f9b97b6b7a2e`); both packaged files match.

## Strict full endurance result

Command: `npm test -- game-browser-endurance`, with `GAME_BROWSER_ENDURANCE_TICKS` unset. No tick override or assertion/cap change was used.

Actual failure output:

```text
not ok 2 - game browser endurance: exact GH seed-zero workload yields through Chrome to terminal
error: restore stays inside the 50ms long-task cap

false !== true

# tests 2
# pass 1
# fail 1
# duration_ms 21975.794958
```

Retained telemetry in `endurance/current/endurance-result.json` reports two completed 300-tick segments (600 forward ticks), then a restore cut from tick 600 to 300. Initialization maximum was 155 ms against the unchanged 300 ms cap. Restore maximum was 51 ms against the unchanged 50 ms cap, with one restore long task `{ "duration": 51, "startTime": 17802 }`. `terminal` is null; terminal observation and restart were not reached. The run was not retried with wider caps.
