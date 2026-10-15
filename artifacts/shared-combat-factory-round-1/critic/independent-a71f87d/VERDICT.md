PIECE: GAME-001HTJX — combat factory extraction

VERDICT: NO-GO for this round. The first required integration gate failed, so I stopped before running the remaining gates.

Pasted evidence:
- Candidate commit: a71f87d38eb423612474500cc0be60893ceb8eeb; accepted production baseline: 9e04300816d5e6b2c94001ba221c0e89b6da2efe.
- Fresh candidate archive: /private/tmp/game-001htjx-critic-a71f87d38eb423612474500cc0be60893ceb8eeb.
- The supplied baseline tree resolves to 7f41167c2429eec637dbb7c5f838fa3b404ab4d2. Its battle continuation kernel, battle-combat adapter, game-session adapter, and live-battle adapter hashes match the values embedded in the differential test.
- File-only comparison: the accepted `defineBattleCombat` body was moved byte-for-byte, with only `export` added to its declaration. The opaque continuation helper was moved byte-for-byte, with only its two declarations exported. This does not replace runtime qualification.
- First gate argv: `/Users/me/.hermes/node/bin/node --test tests/game-battle.test.js`.
- Working directory: `/private/tmp/game-001htjx-critic-a71f87d38eb423612474500cc0be60893ceb8eeb`.
- Clean environment: `TMPDIR=/tmp`, `PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin`, `GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs`, `GAME_BROWSER_CHROME=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `SHARED_COMBAT_BASELINE_ROOT=/private/tmp/game-001htjx-baseline`.
- Direct process PID: 91637. Exit: 1. Test result: 11 total, 8 passed, 3 failed, 0 skipped.
- Failures: starter-card materialization expected 30 but got 20 (`tests/game-battle.test.js:56`); rejection-message assertion expected `/unresolved|inventory/` but got `roster[6].entities[1] source confidence field lacks a QUESTION record` (`:278`); paired hostile-graph assertion expected `TypeError` (`:466`). Full raw stdout and stderr are preserved in `battle-integration/`.
- Source/test/package/assets manifests before and after the gate compare byte-for-byte (`cmp` exit 0; 592 entries). No source or test files changed.

BIGGEST GAP: The game-battle integration gate has three failures, and the extraction-specific baseline differential plus all later required gates remain unrun. I cannot qualify the candidate until the integration failures are resolved or independently established as an accepted-baseline condition and the remaining required runtime gates pass with zero skips.

This verdict covers this extraction piece only. The 109-card, historical parity, and endurance bars remain outside this piece and unproven.
