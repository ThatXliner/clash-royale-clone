# COVERAGE-003 builder evidence

## Frozen source and map

The inventory was generated from a clean Git archive of source commit
a8c39bcc02329ba22b3fdd50be7d1089bc6010dc. The generator pins the historical
card corpus and source ledger, the runtime admission source graph (70 files),
all comparator/evidence test files, the legacy 11-card artifact, the accepted
16-card artifact, and the QUESTION-only normalization fixture.

The new JSON SHA-256 is
49d5e9f4b09e0724eab5e30624e505565514ad41e80b256528fc7111e12b2396.
The old 11-card baseline remains 61,378 bytes with SHA-256
e68bf690793d531c863f14117deace21de595c906ecbc8bf39cc98856cd33c07.
The accepted 16-card JSON remains SHA-256
674aa6320a79ae452f854e2bcc6e40fe4a504b3963cddb28815e876ef206118b.
Both earlier artifacts were read and hash-checked; neither was rewritten.

The generated inventory contains 109 historical rows (78 troops, 13 buildings,
18 spells), 18 mixed editable choices (17 troops plus Squall Orb), the unchanged
default eight, 21 current admission occurrences, and 55 catalog IDs / 60
catalog occurrences. It records 12 test-declared comparator candidates, six
unjoined current identities, zero full historical card executions, and zero
historical parity claims.

Gloamwing Cluster and Coppershade Flock each remain unjoined to a historical
card key. Their current editable membership, real shared-core deployment,
editable GameSession continuation, and typed question closure are tied to
frozen test declarations at their actual lines. Each row preserves 13 typed
unverified mechanic QUESTION records, including the policy bindings and exact
source/value records; no estimate is promoted.

## Executed checks

All commands ran from the clean a8 archive, with the submitted inventory and
builder helper overlaid there.

    node artifacts/completion-inventory-current-18/generate.mjs --write

Exited 0 and wrote the pinned JSON. Output is in logs/generator-write.txt.

    node artifacts/completion-inventory-current-18/generate.mjs --check --self-test

Exited 0. It reproduced the JSON and ran six semantic mutation classes:
missing row, duplicate row, duplicate editable ID, known but unsupported
comparator join, QUESTION fixture promotion, and forged declaration/mapping
evidence lines. The actual mutation outputs and full assertion messages are
recorded in logs/semantic-mutations.json; the generator's full console output is
in logs/generator-check-self-test.txt.

    node artifacts/coverage018-round-1/builder/mutation-probes.mjs

Exited 0. This helper executes the generator's mutations and saves the captured
six outputs, rather than reading a handwritten expected-output file.

    node --test tests/cards016-integration.test.js tests/game-roster-troops-air-swarms.test.js

Passed 13/13 tests. TAP output is in logs/focused-closure.tap. The suite covers
18-choice membership, default-eight stability, typed shared-core air-swarm
deployment, editable continuation, and the exact unverified-question closure.

No production bundle was built in this builder pass; actual compiled-output
exclusion is left for the independent critic. No runtime, reference-stat,
documentation, PLAN, or publication files were edited.
