# CARDS-023I focused UI checks

- Private input checkout: `4f19aef1ce31666564b70d5b4987cda6df5ae9ba`.
- Source commit: `93fd564878e35afe1cf1975808462522fbbbb948` (`Integrate Aether Well collection and battle UI`), created before any test run.
- `npm ci`: direct exit 0, PID 42764; stdout/stderr are preserved as `npm-ci.stdout.raw` and `npm-ci.stderr.raw`.
- `node --check` passed for the four changed UI modules and three changed JS test files; direct child exits are listed in `syntax-checks.process.json`.
- `node --test tests/ui-combat-state.test.js`: direct exit 0, PID 42818; 18 passed, 0 failed, 1 skipped (accepted-parent comparison is disabled without `ART004_PARENT_ROOT`). The authentic `GameSession` → `createGameUiFrame` → combat renderer test passed at both target sizes, as did existing Brackenwheel renderer coverage.
- Before/after source fences have the same source commit and identical selected-file SHA-256 values. The accepted Aether Well concept, portrait, battle-art helper, session-card catalog, and Brackenwheel art files are unchanged from 4f19.

**Not run in this window:** browser/server/Chrome, `tests/app-shell.test.js` browser flow, release build, broad test suite, simulation/stat tests, and performance gates. The immutable raw process streams and direct exit codes are retained beside the fence files.
