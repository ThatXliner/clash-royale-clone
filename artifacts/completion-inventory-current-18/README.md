# Current 18-card comparison inventory

This is a versioned, offline inventory for COVERAGE-003. It pins the historical 109-row roster and per-field QUESTION flags, then records the 18-card editable pool present at source commit a8c39bcc02329ba22b3fdd50be7d1089bc6010dc.

The inventory reports 18 mixed choices (17 troops plus one effect), the unchanged default eight, 21 editable admission occurrences, and the pinned catalog's 55 admitted IDs / 60 occurrences. Twelve rows retain exact comparator declarations from tests. Six current IDs have no exact historical identity assertion. Gloamwing Cluster and Coppershade Flock each preserve the 13 typed runtime mechanic QUESTION records attached to their current estimates. Those records are not historical evidence.

The accepted 11-card and 16-card artifacts are hash-checked and never rewritten. Historical rows retain all 109 identities (78 troops, 13 buildings, 18 spells) and their source-ledger QUESTION fields. The artifact records zero full historical card executions and zero historical parity claims. Counts describe roster admission and test declarations, not completed card coverage.

This generator checks exact frozen test declaration and comparator mapping lines, current editable order, admission occurrence counts, and typed QUESTION closure. Its self-test reports six semantic mutation classes, including private fixture promotion and false evidence-line claims. The files in this directory are offline evidence; do not import, bundle, or publish them as game assets.

For reproducibility, start at the repository root and overlay the submitted files onto a clean archive of the pinned source:

    mkdir -p /tmp/coverage018-a8
    git archive --format=tar a8c39bcc02329ba22b3fdd50be7d1089bc6010dc | tar -xf - -C /tmp/coverage018-a8
    mkdir -p /tmp/coverage018-a8/artifacts/completion-inventory-current-18
    mkdir -p /tmp/coverage018-a8/artifacts/coverage018-round-1/builder/logs
    cp artifacts/completion-inventory-current-18/README.md artifacts/completion-inventory-current-18/generate.mjs artifacts/completion-inventory-current-18/card-coverage-109-current-18.json /tmp/coverage018-a8/artifacts/completion-inventory-current-18/
    cp artifacts/coverage018-round-1/builder/mutation-probes.mjs /tmp/coverage018-a8/artifacts/coverage018-round-1/builder/
    cd /tmp/coverage018-a8

Then run:

    node artifacts/completion-inventory-current-18/generate.mjs --write
    node artifacts/completion-inventory-current-18/generate.mjs --check --self-test
    node artifacts/coverage018-round-1/builder/mutation-probes.mjs
    node --test tests/cards016-integration.test.js tests/game-roster-troops-air-swarms.test.js

The focused tests exercise the frozen editable pool, shared-core air-swarm deployment, and typed QUESTION closure. Production output isolation is a separate actual-build review.
