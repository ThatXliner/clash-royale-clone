# GAME-001ASC bounded source preparation

This patch is based on the accepted root commit `d0ec2e7426fbdba42d3f69fb02ead34cc22fbed0` and its `src` tree `01d869b32c563dac270acd4fddc7fa4d0ec207de`. Relevant base blob identities are:

- `docs/rl-api.md`: `638aa27c1bad736a4183cea5a79fb7a7798bb3ef`
- `docs/verification.md`: `ced7b184ebcd446b1fbbdfcdb33ba1885dee03a3`
- `tests/game-troop-runtime.test.js`: `41758be50821cde14303424e8ff30a9fc8169e89`
- `src/sim/battle-continuation-kernel.js`: `3426d73673cd532418eadcbe4cd704cd0f4c3614`
- `src/shared/session-troop-source-confidence-authority.js`: `874b41447edbfed08350f0fb963f0bde70700839`
- `package.json`: `7a637dd1af982c8fb44c5640d82e1f44fbcafcd6`

The seven fixture files are exact copies of the bounded packet inputs in `artifacts/gtc-diagnostic-packet-20261016/attempt4-public-restore-control/run/exact-captured-snapshots/`. Their capture source pins, byte lengths, and SHA-256 values are recorded in `tests/fixtures/source-vintage-checkpoints/README.md`. The test requires each exact missing-policy TypeError at its observed roster path. It does not claim that all historical checkpoints fail or that successful same-format restore proves cross-revision equivalence.

The code patch changes only `docs/rl-api.md`, `docs/verification.md`, `tests/game-troop-runtime.test.js`, and the owned fixture directory. Engine, admission policy, stats, roster, goldens, budgets, and `package.json` are unchanged. Existing current-format restore, causal, and hostile-input tests are unchanged.

Patch: `game001asc.patch` (SHA-256 `e13eb1d1dcd617c891c51221fe340d336ad0740ee0d8e0e12d08ef4d5752f606`). It applies cleanly to the bounded partial archive from the accepted base.

The planned runtime gate is `npm run test:game-troop-runtime`, with no exclusions. It was not run because the factory owns the Node runtime. No tests, build, browser, or render were run during this file-only preparation.
