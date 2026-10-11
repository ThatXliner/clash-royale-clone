# Current 16-card comparison inventory

This is a versioned offline inventory for COVERAGE-002. It pins the historical 109-row roster and its per-field `QUESTION` flags to commit `6dcf64b81751f69f9fe7520878ac136bda9143ed`, then records explicit current editable IDs and the existing test declarations that mention or compare them. The retained 11-card inventory is read and hash-checked; this generator never rewrites it.

The map separates 12 test-declared comparison candidates from QUESTION-only fixture references and the four current cards for which the tests assert no exact historical identity. It counts current admission occurrences and the default eight separately. None of these counts means full historical card execution or proves parity. This directory is test evidence only and must not be imported into runtime or publication code.

From a clean archive of the pinned commit with `node_modules` available, run:

```sh
node artifacts/completion-inventory-current-16/generate.mjs --write
node artifacts/completion-inventory-current-16/generate.mjs --check --self-test
```

`--check` verifies all pinned input digests, regenerates in memory, and compares bytes. `--self-test` mutates the inventory in memory to exercise duplicate/missing rows and IDs, current-pool drift, unsupported joins, promotion of Cinder Host's `skeleton-army` QUESTION fixture, and invalid declaration or mapping lines. It also checks that a mismatched digest is rejected. The validator binds every comparison and evidence record to the exact frozen test declaration and mapping text; a known historical key alone is not sufficient to create a comparator.
