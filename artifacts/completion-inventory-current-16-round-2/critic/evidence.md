# COVERAGE-002 round 2 critic evidence

## Immutable inputs and scope

- Pinned source: `6dcf64b81751f69f9fe7520878ac136bda9143ed`.
- Submitted artifact: `2a9861376b2c44f861f5fd4987b6db9e58a4d936`, copying only `README.md`, `generate.mjs`, and `card-coverage-109-current-16.json` into a clean source archive at `/tmp/coverage002-round2.pJ5IRq`; `node_modules` was symlinked.
- Submitted JSON SHA-256 before and after `--write`, `--check --self-test`, and `--check`: `674aa6320a79ae452f854e2bcc6e40fe4a504b3963cddb28815e876ef206118b`.
- The clean archive contained exactly the three submitted files in the inventory directory. No source or submitted artifact files were changed in the shared checkout.

## Generator and map checks

Actual generator output is recorded in `logs/generator.log`. `--write`, `--check --self-test`, and `--check` all exited 0. The README commands work on the clean archive and the listed self-test mutations are exercised.

The independent inventory audit is `inventory-audit.mjs`; its output is `logs/inventory-audit.log`. It independently checked the 109 historical rows against the pinned card corpus and each `unverified_fields` list, cross-checked the 16 editable IDs and default eight against the actual pinned runtime APIs, checked every cited test declaration line and comparator mapping against the actual source text, and checked the retained legacy baseline bytes. Results:

- 109 historical rows: 78 troops, 13 buildings, 18 spells; 0 QUESTION-field mismatches.
- 16 editable IDs, 8 default IDs, and 19 current admission occurrences.
- 12 comparison candidates, each tied to a test declaration and a supported reference mapping; 2 fixture mentions remain QUESTION-only and unjoined.
- 4 IDs with no exact historical identity claim: `cinder-host`, `sunthread-pair`, `duskwing-trio`, and `squall-orb`.
- Pinned 6dc admission is 53 IDs / 58 occurrences. The later runtime count from the shared root is not used to claim pinned-source equivalence.
- Retained baseline: 61,378 bytes, SHA-256 `e68bf690793d531c863f14117deace21de595c906ecbc8bf39cc98856cd33c07`.
- Full historical card executions: 0; historical parity claims: 0.

Independent validator mutations are implemented in `mutation-probes.mjs` and recorded in `logs/mutation-probes.log`. The generator rejected missing and duplicate historical rows, duplicate editable IDs, unsupported joins, promotion of Cinder Host's `skeleton-army` QUESTION fixture, and declaration/mapping evidence line `999999`. This checks validation of mutated inventory data; separate tampered-output `--check` behavior and pinned source drift rejection are recorded in their own logs. Tampered generated JSON is rejected by byte comparison, and a modified pinned test input is rejected with `frozen input tests/cards-basic-melee.test.js source drift`.

Focused pinned tests were executed with `node --test tests/cards-basic-melee.test.js tests/cards-basic-flying.test.js tests/cards-basic-ranged.test.js tests/cards-swarms.test.js tests/cards-structure-seeker.test.js`: 67 tests passed, 0 failed. See the dot and TAP output in `logs/focused-tests-dot.log` and `logs/focused-tests-tap.log`.

## Actual production output isolation

A production release was built from the clean archive with `node scripts/build-release.js --out /tmp/coverage002-round2-prod.tx1CS2/release`. The command exited 0 and emitted 42 files / 5,354,760 bytes. `release-output-audit.mjs` then invoked the pinned release-isolation audit and independently read every manifest-listed output file and all 20 reference files. The actual output audit passed: 42 emitted files scanned; no coverage inventory marker, exact inventory JSON copy, `reference` or `tests` manifest path, or protected path. Manifest SHA-256: `625b6a0adc4200311efcd387bca69fdddc307afdaf176ead472bb741fbf71027`. Output is preserved in `logs/production-build.log` and `logs/production-output-audit.log`.

This verifies the production release artifact path only. It does not establish a Pages build or source-wide publication claim beyond the path actually built and audited.
