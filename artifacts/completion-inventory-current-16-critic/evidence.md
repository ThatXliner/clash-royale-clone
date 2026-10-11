# COVERAGE-002 critic evidence

## Frozen inputs and scope

- Submitted artifact commit: `20f2e8abed1cb5fffab767fac138fb4ab941644f`; it contains exactly `README.md`, `generate.mjs`, and `card-coverage-109-current-16.json` in `artifacts/completion-inventory-current-16/`.
- Clean source commit: `6dcf64b81751f69f9fe7520878ac136bda9143ed`. I built `/tmp/coverage002-critic.kcwIrn` from its `git archive`, copied only the three submitted artifact files, and symlinked the workspace `node_modules`.
- `generate.mjs --check --self-test`, then `--write`, then `--check` all completed. The inventory SHA-256 before write, after write, and after check was `674aa6320a79ae452f854e2bcc6e40fe4a504b3963cddb28815e876ef206118b`.
- Focused comparator declaration suites: `node --test tests/cards-basic-melee.test.js tests/cards-basic-flying.test.js tests/cards-basic-ranged.test.js tests/cards-swarms.test.js tests/cards-structure-seeker.test.js` → 67 passed, 0 failed. No endurance suite ran.

## Inventory and source confidence

The independent audit in `inventory-audit.mjs` reads the pinned `cards.json`, `SOURCES.md`, current runtime APIs, evidence lines, legacy baseline, and release allowlist. It reports 109 unique historical rows (78 troop, 13 building, 18 spell); every row's `unverifiedFields` matches the pinned corpus exactly (0 mismatches). Each such field remains marked `QUESTION`. The test run also emitted per-field provenance: for Copperskiff, cost matched with `confidence: authoritative`, while hitpoints matched with `confidence: unverified` and disposition `question-backed-match`.

The current inventory has 16 editable IDs, of which 8 are the unchanged default deck. The 16 records represent 19 current export occurrences. It reports 12 declared test-comparator candidates, 2 fixture-only mentions, and 4 IDs without an exact historical identity claim (`cinder-host`, `sunthread-pair`, `duskwing-trio`, `squall-orb`). The actual session catalog reports 53 admitted IDs across 58 occurrences. The artifact states 0 full historical card executions and 0 historical parity claims.

The retained baseline file is 61,378 bytes with SHA-256 `e68bf690793d531c863f14117deace21de595c906ecbc8bf39cc98856cd33c07`, matching both the pinned digest and the new inventory's recorded digest. This proves byte preservation, not historical parity.

The cited comparator declaration lines point to actual pinned `test(...)` declarations, and the mapping lines resolve to the current ID/reference key for all candidates (the structure-seeker mapping resolves to its explicit `giant` evaluator call). The tests expose source confidence and preserve unverified mechanics as questions. Thornscouts and Forgeguard's comparison test explicitly verifies their selected mechanics remain unverified in the source corpus.

## Mutation probes and workflow gap

`mutation-probes.mjs` creates a temporary sibling copy of the submitted generator with only exports added, then calls its actual `validateInventory` function on independent mutations. It rejected a missing historical row, duplicate historical key, duplicate editable ID, and unknown `invented-card` join. It accepted all three of:

- replacing Cinder Host's `question-fixture-only` status with `declared-test-comparator` and the existing `skeleton-army` key;
- setting a declaration line to 999999;
- setting a mapping line to 999999.

A separate `--check` probe against a tampered output exited 1 with `AssertionError: generated inventory differs`; this confirms byte comparison rejects a changed saved JSON, but it does not show the semantic validator rejects fixture promotion. A separate source mutation (append a comment to pinned `tests/cards-basic-melee.test.js` in a scratch copy) exited 1 with `frozen input ... source drift`, as expected.

The README says `--self-test` covers fixture promotion, evidence-line validity, and digest drift. The implementation's `runSelfTests` does not mutate fixtures or evidence lines; its digest probe only calls `assertDigest("expected", "changed", ...)` directly. The real pinned-input digest guard does work, as the source mutation probe shows. The self-test claim therefore overstates tested coverage.

## Runtime and publication boundary

Static review found the release input allowlist contains only the two public HTML entries, `src/rl/environment.js`, `src/ui/arena-shell-entry.js`, and `public/assets`; `build-release.js` marks `artifacts`, `reference`, and `tests` protected. The Pages builder copies `site/`, two approved brand/legal file lists, then calls the release builder. The new artifact is under `artifacts/` and is not imported by runtime source. No production or Pages build was run in this critic round, so emitted-artifact exclusion is not claimed as verified.

## Evidence files

- `logs/generator.log`
- `logs/focused-tests.log`
- `logs/inventory-audit.log`
- `logs/mutation-probes.log`
- `logs/source-drift.log`
- `logs/tampered-check.log`
- `inventory-audit.mjs`
- `mutation-probes.mjs`

No full parity claim is made.
