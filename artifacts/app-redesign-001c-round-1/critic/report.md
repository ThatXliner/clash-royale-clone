# Claude collection redesign qualification

**Scoped verdict: PASS across six qualification gates.** The three-file Claude UI delivery remained frozen through qualification. The only additional candidate edit was the test-only app-polish overlay needed to update stale 20-card assumptions and fix its first-replacement selector.

## Gates

1. **App-shell browser journey — PASS.** npm run test:app-shell passed in real Chrome. This exercised the rendered collection, card details, deck replacement and in-app deck continuity through navigation, match launch, and Play Again. Evidence: critic/evidence/app-shell/run-02.log.
2. **Mobile app polish — PASS.** After the reviewed R3 test-only repair, npm run test:app-polish passed 1/1. It checked 320×568 and 390×844 layouts, navigation clearance, keyboard traversal and focus, trusted pointer activation, 15 replacements outside the eight-card deck, replacing slot 8 with Brackenwheel, success feedback, 23-card search reset, detail/back focus, and reduced motion. Evidence: critic/evidence/app-polish-r3.log and critic/evidence/app-polish-r3/browser-evidence.json.
3. **Content schema — PASS.** npm run test:content-schema passed after restoring the missing audit corpus from authoritative Git HEAD. Evidence: critic/evidence/content-schema-fixtures.log.
4. **Release build — PASS.** npm run test:release-build passed after restoring the required audit inputs. Evidence: critic/evidence/release-build-fixtures.log.
5. **Shipping isolation release — PASS.** npm run test:shipping-isolation-release passed with the pinned Playwright and Chrome paths and the required audit corpus. Evidence: critic/evidence/shipping-isolation-release-fixtures.log.
6. **All-23 role/lore DOM comparison — PASS.** A real Chrome pass confirmed the rendered 23-card order, each collection role, each detail heading, and every rendered lore paragraph against the source projections and getCardLore. Evidence: critic/evidence/all23-role-lore/all23-dom-checks.json and critic/evidence/all23-role-lore/dom-run-r2.log.

I viewed the actual phone collection, desktop collection and Aether Well detail, plus the mobile deck, replacement choices, updated deck, and Brackenwheel detail. The desktop resource detail communicates generation, lifetime, destruction value, “does not attack,” and QUESTION-marked estimates. The mobile screenshots show readable cards, visible replacement feedback, and the source lore in detail view. Screenshots are under critic/evidence/app-shell/, critic/evidence/app-polish-r3/, and critic/evidence/all23-role-lore/.

## Frozen source and runtime

The Claude delivery still consists of exactly these source files and hashes:

- public/index.html — 59e29ae8a1c978c350de8ad1e52f4fb84b179c983effb2ac74e93bf8bcfa981d
- src/ui/app-shell.js — 58daaef6ed0acb0eca671ac02aaf1aa36a1f56e7ae448adb078b7eb5a33ef750
- src/ui/app-shell.css — 55398d234de91841918dcbe381f18d81dc3ae919c2fb4277e430368553ea7891

The test-only overlay tests/app-polish.test.js has SHA-256 0388c0947ca633c81f37125023707a9277b2ead99265a18f1c5259e5611bfd52. package-lock.json stayed at d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4; no dependency install or UI source edit occurred during qualification. git diff --check passed.

Runtime pins: Node 22.22.3; Playwright module /Users/me/.codex/clash-qualification/20261020-factory-r5/attempt-20261020T155551Z/candidate-e35dda4c0225b88ddac91a56f15e81fee32c3c68/node_modules/playwright/index.mjs (project lock version 1.58.2); Chrome /Applications/Google Chrome.app/Contents/MacOS/Google Chrome; Vite 8.3.2. The R3 app-polish process PID 27753 and all-23 DOM probe PID 27456 have both exited; the browser and Vite server were closed.

## Preserved setup and superseded failures

All initial failures remain in the evidence directory so the recovery path is visible:

- critic/evidence/app-shell/run.log records the first app-shell setup failure because Vite was absent from the checkout. The exact preinstalled dependency cache was linked locally after its package-lock hash matched; run-02.log then passed.
- critic/evidence/app-polish/run-01.log records the stale 20-card/12-choice assertion against the approved 23-card collection. app-polish-after-count-patch.log records the stale Stonehauler-first assumption. app-polish-r2.log records the R2 test-harness selector mistake. R3 corrected the test-only assertions and passed; no product assertion was weakened.
- critic/evidence/content-schema.log, release-build.log, and shipping-isolation-release.log preserve the initial missing-reference-corpus failures. shipping-isolation-release-playwright.log also records the first rerun without the Playwright environment variable. The successful reruns use exact audit-only inputs from root Git HEAD 4cd2911ff851d663fe115002428902b2f80749aa and the installed browser pins.
- critic/evidence/all23-role-lore/dom-run.log records the first DOM-probe setup failure from specifying a nonexistent vite.config.js; the successful probe used Vite with config loading disabled and served the actual candidate source.

No page-reload persistence requirement was added; the exercised persistence contract is the existing in-app navigation, launch, and same-deck Play Again flow.
