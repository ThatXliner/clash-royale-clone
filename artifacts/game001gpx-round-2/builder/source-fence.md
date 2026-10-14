# Source fence

- Candidate base/HEAD before builder commit: `ac45251686288696f8033f9490e7bcedf8909825`.
- `git diff --exit-code ac45251686288696f8033f9490e7bcedf8909825 -- src` exited 0.
- `git status --short -- src` was empty.
- The only tracked path changed from candidate base is `tests/game-browser-endurance.test.js`.
- `tests/game-browser-endurance.html` and `tests/helpers/endurance-workload.js` are unchanged.
- `git diff --check` passed before freeze.

All browser evidence was collected with `GAME_BROWSER_ENDURANCE_TICKS=900`. The existing default remains 18,000 ticks; this round makes no full-run or natural-terminal qualification claim.
