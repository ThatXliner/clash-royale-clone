# CARDS-023I native gate plan

Preparation only: no Node, npm, browser, build, or native gate has run from this plan. Run it only after the root releases the local Node/browser/build window and assembles these UI paths over the accepted QH fix.

The recorder is `run-native-gates.sh` in this directory. It resolves the current private checkout from its own location, creates a fresh `native-runs/attempt-*` directory, captures each direct command's stdout, stderr, PID, command, and exit code, hashes each receipt, and stops at the first nonzero command. A later correction creates another fresh attempt directory, preserving the earlier failure. It does not run npm ci or endurance.

The recorder sets these explicit native paths for every gate:

- Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Playwright: `<private-checkout>/node_modules/playwright/index.mjs` (the installed package manifest reads version `1.58.2`)
- Node: `/Users/me/.hermes/node/bin/node`
- npm: `/Users/me/.local/bin/npm`

The ordered gate commands are:

1. `npm run test:app-shell` — existing one-test release browser journey, with `APP_SHELL_ARTIFACTS` pointed into the fresh run directory.
2. `node --test tests/cards023-browser-integration.test.js` — the Aether collection/deck/battle journey in real Chrome. It covers phone 390×844 and desktop 1440×933, each with normal and reduced motion; accepted art at 13/26 physical pixels; trusted player deployment; natural AI choice/cycle; `fastForwardSegment` resource trigger/grant receipts against canonical state and HUD; exact snapshot/session/state/input-bridge/audio restore plus whole-viewport PNG byte equality; natural terminal; and trusted same-seed, same-ordered-deck restart. Its `browserVersion` evidence must report Chrome 155.
3. `npm run test:ui-combat-state` — focused authentic-renderer UI suite.
4. `npm run test:game-ui-projection` — focused canonical session-to-HUD/combat projection suite.
5. `npm run test:nondeterminism-guard` — 10 tests.
6. `npm run test:visual-asset-manifest` — 6 tests.
7. `npm run test:shipping-isolation-guard` — 13 tests.
8. `npm run test:release-build` — 22 RELEASE-001B checks. The four generated reports under `artifacts/release-001b-round-2/` are copied into this attempt directory after the command, then only those four private-checkout paths are restored from their exact pre-run bytes.
9. `npm run test:shipping-isolation-release` — 4 tests, with its evidence JSON directed into the fresh attempt directory.
10. `npm run test:shipping-isolation-host` — 1 test.

Before calling this complete, inspect the Aether evidence JSON and confirm its `browserVersion` begins with `155.`; the executable path is explicit in every browser-capable command. Source fences record and compare the complete file inventory and SHA-256 values across `src/`, `scripts/`, `tests/`, `public/`, `demo/assets/`, `docs/art/`, `reference/stats/`, `package.json`, and `package-lock.json`; this covers kernels, helpers, manifests, assets, and provisional stat evidence. The projection path authorized for the continuation remains `src/ui/game-ui-projection.js`; no simulation, content, RL, package, asset, or helper path is in this scope.
