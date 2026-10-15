# GAME-001HBR combined-adoption candidate

This candidate overlays the accepted HBR source and its three owned tests onto exact main base `52a18349a04b3d9fbbd0a0c82c1f08ed7c36942e`. The four HBR source files and three HBR test files are byte-identical to `c1d17ec2a5591e9871659dfdea9a4e9f4688ea6d`; no mechanics or source policy were added here.

## Scope and fences

Only these seven tracked paths differ from the base: `src/content/cards/buildings-resource.js`, `src/content/session-card-catalog.js`, `src/sim/session-building-profile-receipts.js`, `src/sim/session-building-runtime.js`, `tests/game-building-policy.test.js`, `tests/game-building-runtime.test.js`, and `tests/game-roster-buildings.test.js`. `src/` differs only in those four HBR files. The accepted portrait manifest/assets, editable-deck and RL sources/tests, package manifest/lockfile, fixed-step and continuation kernels, and every other tracked path remain byte-identical to main.

## Verification

Using Node 22.22.3 / npm 10.9.8, `npm ci` completed with 19 packages and no reported vulnerabilities. The Node gates passed: nondeterminism guard 10/10, shipping-isolation guard 13/13, roster admission 7/7, and canonical integration audit 6/6. The fresh canonical audit covered 68 occurrences, 63 unique IDs, and 5 question-only entries. Its two-run equality and expected-manifest assertions passed with SHA-256 `259d5fcfbc33e9bcb983676891f8b5d723255e25ca82af53348eaa0363e520b1`. The exact 682,350-byte manifest is copied from the accepted `debe648` evidence blob and has that same SHA; the fresh test proves the new result matches it without an extra full audit replay.

The matching host/release gates also passed: shipping-isolation host 1/1, release-build suite 22/22, and browser-backed shipping-isolation release 4/4 on Google Chrome 155.0.8059.40 with Playwright 1.58.2. Playwright used an absolute filesystem path and the suite's isolated headless browser context. The first shell-only Chrome version probe failed on the executable path containing spaces before any test began; the attempt is recorded, and a direct argv probe succeeded.

The release-build suite rewrote four existing tracked qualification JSON files during execution. Their generated versions and hashes are preserved under `release-build-evidence/`; the tracked files were restored byte-for-byte to the base. The preexisting `dist` tree and other tracked artifacts are unchanged.

Raw stdout/stderr, child exit status, timing, and a bounded checksum ledger are stored beside this report. This is a candidate for independent review, not an acceptance or parity claim. The prior full HBR scoped gate and core differential were not rerun. The seven owned blobs match the reviewed commit, and a direct `c1d17ec`-to-`52a1834` comparison found only the two owned session-building modules changed under `src/sim`; every other shared simulation-authority file is identical, so the previously reviewed HBR scoped validation still applies to the shared runtime.
