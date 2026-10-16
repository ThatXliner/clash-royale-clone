# GAME-001GTC builder preparation

## Checkout and scope

- Builder checkout: `/private/tmp/game001gtc-builder-090d`
- Starting commit: `090d685a4fa07aa07c17618b1e18d00ecb63ff51`
- Allowed edits: `tests/game-troop-runtime.test.js`, `tests/game-roster-troops-status.test.js`, and this `artifacts/game001gtc-round-1/builder/**` packet.
- Do not edit production, package files, or assets. The two golden edits were made only after the accepted-source causal report supported them. No Node/npm/build/test/browser process was started before the explicit runtime handoff; both focused test runs after that handoff are captured below.

## Existing accepted controls

- Accepted-baseline source and raw output are retained under `artifacts/game001gtc-round-1/root/accepted-baselines/`.
- `test:game-troop-runtime`: 6 pass, 1 fail. The first failure is the empty LiveBattle v2 snapshot byte count (current 17,731; pinned 11,618); its SHA assertion is consequently not reached.
- `test:game-roster-troops-status`: 32 pass, 1 fail. All six replay hash pins match; all six snapshot hash pins differ. Restore cuts follow the pin test and passed on the accepted baseline.
- These are confirmed baseline observations, not yet a causal authorization to update pins.

## Static coverage to preserve

`game-troop-runtime` includes the empty v2 byte/hash controls; current v5 hostile witness mutations and atomic restore behavior; chunk/fork equivalence; legacy profile-schema v1/v2 inputs that emit restorable LiveBattle snapshot versions 3/4; and the sourced troop-runtime/contact paths. Keep all these assertions intact.

`game-roster-troops-status` includes strict roster/status source validation, lifecycle and health behavior, all six replay/snapshot controls, and 36 restore cuts across the six witnesses. Keep every replay pin, hostile admission case, and continuation assertion intact.

## Candidate runner and actual verification

`run-one-focused-suite.sh` captures a separate attempt per selector. It copies the exact test, test runner, package manifest/lock, and its own script before launch; records command, checkout, clean environment, runtime versions, direct PID, exit code, separate stdout/stderr, and source fences; and uses Node 22 from `/Users/me/.hermes/node/bin`. It was executed only after the accepted-source causal finding and explicit runtime release.

After the runtime release, both full focused suites passed serially:

- `npm run test:game-troop-runtime`: 7/7, exit 0, direct npm PID 29717, Node v22.22.3/npm 10.9.8; see `attempt-troop-runtime.U966kR/`.
- `npm run test:game-roster-troops-status`: 33/33, exit 0, direct npm PID 29807, Node v22.22.3/npm 10.9.8; see `attempt-roster-troops-status.9XaDqt/`.

Both attempts have separate raw stdout/stderr and captured exact pre-run sources. Pre/post source fences and production-path diff records match; both stderr files are empty. All direct test processes have exited.
