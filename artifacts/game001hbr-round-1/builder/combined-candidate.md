# GAME-001HBR combined source/guard review candidate

This file records the combined candidate separately. The original HBR builder evidence in `implementation-evidence.md` remains unchanged.

## Frozen inputs

- Candidate starts at HBR commit `59c4e3c7483ace05f570146f6d57ba83222e5e0b`.
- The seven guard/fixture repair files are copied byte-for-byte from `c72cd1695258be2af6d3ab4145218bcd673aa1cf`. That source commit's production `src/` was confirmed identical to the HBR base's `src/`; no production source files were copied or changed here.
- The only additional HBR-owned file changed is `tests/game-roster-buildings.test.js`, whose expected admission/occurrence counters were updated from the pre-repair manifest totals to the combined manifest totals after the Brackenwheel occurrence repair. No guard-owned files were adjusted.

## Changed files

- `scripts/integration-audit.js`
- `scripts/nondeterminism-guard.js`
- `tests/cards022k-brackenwheel.test.js`
- `tests/fixtures/integration-occurrence-adapters.js`
- `tests/fixtures/integration-occurrence-bindings.json`
- `tests/game-roster-admission.test.js`
- `tests/nondeterminism-guard.test.js`
- `tests/game-roster-buildings.test.js` (HBR-owned expected counts only)

## Verification

All commands below used the configured Node 22.22.3 runtime. Focused results on the combined tree:

- `node tests/game-roster-buildings-runner.js game-roster-buildings` — 11/11 pass.
- `node tests/game-building-policy-runner.js game-building-policy` — 6/6 pass.
- `node tests/nondeterminism-guard-runner.js nondeterminism-guard` — 10/10 pass.
- `node tests/game-roster-admission-runner.js game-roster-admission` — 7/7 pass.
- `node --test tests/cards022k-brackenwheel.test.js` — 5/5 pass.
- HBR source checks completed before the guard overlay on identical, unchanged source: buildings-resource — 13/13; game-building-runtime — 16/16.
- `git diff --check` — pass; `src/` remains clean against the frozen HBR base.

The full canonical integration-audit runner (`node tests/integration-audit-runner.js integration-audit`) completed in 451955 ms with exit 1 (4/6 subtests pass). Subtest 4, `canonical integration audit samples all direct occurrence mechanics`, failed at `tests/integration-audit.test.js:229`; subtest 6, `canonical integration audit executes every supported card and reproduces artifacts`, failed at `tests/integration-audit.test.js:307`. Both assert an admitted/claimed occurrence total of 67 where the repaired combined manifest reports 68 (`68 !== 67`). The remaining four subtests pass, including missing/swapped raw-binding rejection. `tests/integration-audit.test.js` is outside this candidate's ownership and was left unchanged; this is recorded as an inherited stale count assertion, not repaired here.

## Review status

This is a combined review candidate only. The c72 guard repairs are pending independent critic review. This candidate is not accepted, merged, or deployed.
