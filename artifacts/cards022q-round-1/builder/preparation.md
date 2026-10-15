# CARDS-022Q qualification packet preparation

State: bounded preparation only. No CARDS-022Q journey, focused contract suite, browser session, build, or product-source edit was performed in this packet. The fresh critic owns all qualification judgments and actual 22-case execution.

## Exact source binding and ownership

- Accepted source HEAD: `ac224e9d8fa3e2797ea04c3e27b941abf18239c3`; Git tree `58e140df45aa65a84165d8124735a5a5abf3dbb0`. Accepted base: `52718dd6`.
- Prospective I candidate `31421c94a01b28eea01324103ad9dbf694a780e7` is now accepted as CARDS-022I. The ten product paths changed from the accepted base match that candidate; all other products and the QH501 harness remain unchanged from base. See `source-hashes-ac224.json` for the metadata inventory and canonical content hashes.
- Accepted QH501 harness at this HEAD has the same Git blobs as base `52718dd6`:

  | Path | Git blob | SHA-256 |
  | --- | --- | --- |
  | `tests/game-browser-endurance.test.js` | `91d4da5aa8329d100a8c53842ca818d3e45ead54` | `f91186845455952b242a951d29e0ad9d7fcb791d2da60541a3ed44e68c149a5c` |
  | `tests/helpers/endurance-workload.js` | `81bd2792089151eaf746351c426c3624894661ca` | `ab29cf58cee05516fd8fae57b451a685ec27344459561f43dd313b4872935c84` |
  | `tests/endurance-workload.test.js` | `1bd902ce4e2ae66189bab057b1a7516b59a9ec4e` | `8f9350f5b1b93d5ff678d173b9a5602f46f02c41a629d20e44a55886c21f1c73` |

- Product files owned by this preparation: none (`ownedFiles: []`). The packet contains source/runtime metadata, a bounded command plan, and a run ledger only. No source-content archive was made. Nothing from `reference/` was used or copied.
- Clean detached checkout: `/tmp/cards022q-prep.ewo1lt`, HEAD `ac224e9d8fa3e2797ea04c3e27b941abf18239c3`; it was clean after the allowed dependency setup. It is available to the critic if still intact. Do not run qualification against a different HEAD.

## Runtime fingerprint and environment

Previously captured for the private checkout: Darwin 25.5.0 arm64; Node `v22.22.3` at `/Users/me/.hermes/node/bin/node`; npm `10.9.8`; Playwright `1.58.2`; Vite `8.3.2`; native Chrome CLI `Google Chrome 155.0.8059.40` at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Chrome was not launched for this preparation. Harness launches use the explicit executable path with no custom GPU or browser arguments. Keep user Chrome PID `93861` untouched.

The observed shell had these variables unset: `GAME_BROWSER_ENDURANCE_TICKS`, `GAME_BROWSER_ENDURANCE_SCENARIO`, `GAME_BROWSER_PLAYWRIGHT`, `GAME_BROWSER_CHROME`, `GAME_BROWSER_ENDURANCE_ARTIFACTS`, `NODE_OPTIONS`, `PLAYWRIGHT_BROWSERS_PATH`, and `CI`. The critic must explicitly unset the tick override for both full endurance runs; also unset the scenario selector for default-eight.

## Accepted setup, workload, and caps

- Default selector: unset `GAME_BROWSER_ENDURANCE_SCENARIO`, selecting `default-eight`; setup digest `306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`.
- Accepted separate custom selector: `brackenwheel`; deck `brackenwheel, briar-band, coilblade, mossguard, ironroot, copperskiff, brassbolt, reedsting`; seed `2`; setup digest `2207fce9a5a9c64ebca77acd12bae175bfcc0e05ddb94886b7354ccc50f1a15b`. It must run with no tick override to natural terminal and same-deck/seed restart. The natural AI decision and primary/secondary area contacts on targets `[4,5,6]` are checked at tick `234`; first-300 evidence and the exact `600→300→600` restore/replay remain required.
- Kilnkeeper seed-zero digest remains `9b2a1c5a86c2d5c0c2d623389b69c465409e65d5d84988591630b980ee7b3ba9`. Default and Kilnkeeper setup/qualification behavior must stay unchanged.
- Full default journey is 18,000 ticks. Both full endurance runs leave `GAME_BROWSER_ENDURANCE_TICKS` unset. A 900-tick smoke is not a substitute.
- The accepted caps stay `50ms` non-initialization long task, `300ms` initialization long task, `40ms` synchronous simulation/restore slice, `30,000ms` per segment, and `1,200,000ms` total endurance.
- Retain the real serialized browser bridge, session, E2, input-controller, typed future-audio continuation, and native audio sink checks. The adapter audio suite and production audio suite remain separate commands.
- Generic TAP title text says “seed-zero” for every selector. For Brackenwheel, use telemetry `scenario`, canonical setup JSON `seed`, and setup digest as the seed authority. Keep unsupported stat/melee questions at `QUESTION`; make no historical-parity claim.

## Fresh critic command plan

Run in the clean private checkout at the exact accepted HEAD. Set `PRIVATE_ROOT` to that checkout and `REVIEW_ROOT` to a fresh critic evidence directory. Preserve raw stdout/TAP, stderr, exact direct exit code, generated `endurance-result.json`, source inventories before/after, and all required active/terminal/restart screenshots. The two commands below are full journeys, not bounded smoke tests:

```sh
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PLAYWRIGHT="$PRIVATE_ROOT/node_modules/playwright/index.mjs"

# Three TAP cases; full default-eight through 18,000 ticks.
env -u GAME_BROWSER_ENDURANCE_TICKS -u GAME_BROWSER_ENDURANCE_SCENARIO \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_ENDURANCE_ARTIFACTS="$REVIEW_ROOT/default-eight/" \
  npm run test:game-browser-endurance

# Three TAP cases; seed-2 Brackenwheel to natural terminal, no tick override.
env -u GAME_BROWSER_ENDURANCE_TICKS \
  GAME_BROWSER_ENDURANCE_SCENARIO=brackenwheel \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_ENDURANCE_ARTIFACTS="$REVIEW_ROOT/brackenwheel/" \
  npm run test:game-browser-endurance

# Eleven adapter-audio cases.
npm run test:game-browser-audio

# Five production-audio cases, including native Chrome PCM/sink evidence.
GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" GAME_BROWSER_CHROME="$CHROME" \
  npm run test:audio-production-assets
```

Expected grouping from Round 481 is `3 + 3 + 11 + 5 = 22` cases. The accepted focused pure-Node source-contract suite is separate (`node --test tests/endurance-workload.test.js`, 8 tests). The root paused that optional run when the fresh Q critic window opened; this builder did not run it. The 22 cases above must be executed and judged by the separate critic on the accepted HEAD.

Historical Round 481 commit `763e39465fd584ffa4618ea220fbdb3a99fec40c` PASS is command/template context only, not evidence for this HEAD. Do not revive the historical `55/51` failure as current evidence.
