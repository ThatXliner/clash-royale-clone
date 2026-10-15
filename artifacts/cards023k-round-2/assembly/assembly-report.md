# CARDS023K current-source assembly record

This checkout starts from accepted main `950c2b8780521234aa6ab08af677f4892794eebb` and has two source-only layers above it:

1. `22fc972fcba5357957ffacfe43c59662f95344b2` layers exactly the seven HBR source/test paths from frozen candidate `44e69d6b5fe0aad9a55f958bb8ce460fe877aa28`.
2. `d87319857f48534a1d207fc3610c1f4ecdb3de99` layers exactly the five CARDS023K source/test blobs from frozen builder candidate `95cce2f7a154ab7137d679fcf07092e03cfc7f70`, plus its existing owned evidence under `artifacts/cards023k-round-1/builder/`.

The source-layer order is `950c2b8 → 22fc972 → d873198`. No HBR source was adopted to main by this preparation. The five CARDS023K blobs and seven HBR blobs were checked against their exact frozen commit tree entries and SHA-256 values in `blob-checksum-ledger.json`.

## Exact tree fence

Relative to current main `950c2b8`, the candidate source commit changes exactly twelve tracked source/test paths: the four HBR source files and three HBR tests, plus the two CARDS023K source files and three CARDS023K tests. The complete path and before/after Git blob ledger is `candidate-source-delta.json`; full source/test file-tree manifests are `source-fence-before.json` and `source-fence-after.json`.

All other `src/` and `tests/` files match `950c2b8`, including the accepted K3 core and tests. `scripts/`, `dist/`, `package.json`, and `package-lock.json` match `950c2b8`. Every artifact tracked in `950c2b8` remains byte-identical in the candidate tree, including the accepted publication receipts `artifacts/publication-91b99fb/github-pages-run.json` and `artifacts/publication-91b99fb/live-http-receipt.json`; see `artifact-preservation.json`.

The old `ff562bd3027f40509f0e5e7e6f9848d98faf6346` → current main `950c2b8780521234aa6ab08af677f4892794eebb` comparison has 1,121 changed paths: 1,110 additions and 11 modifications. Eight are product paths: `src/content/cards/buildings-resource.js`, `src/content/session-card-catalog.js`, `src/content/visual-asset-manifest.js`, `src/sim/session-building-profile-receipts.js`, `src/sim/session-building-runtime.js`, `tests/game-building-policy.test.js`, `tests/game-building-runtime.test.js`, and `tests/game-roster-buildings.test.js`. The other 1,113 are non-product paths (1,107 artifact files, three added asset/documentation files, and the `PLAN.md`, `progress.html`, and `rounds.md` edits). Product paths and old/new blob and byte hashes are listed in `old-ff562-to-current-main-950.json`; the complete prior 1,121-path blob ledger is in `baseline-vs-ff562.name-status.tsv`.

For the layered HBR baseline commit `22fc972fcba5357957ffacfe43c59662f95344b2`, the same old-base comparison has 1,114 changed paths: 1,110 additions and four modifications. It has one product change, `src/content/visual-asset-manifest.js` (+11 lines); the other 1,113 are the same non-product paths listed above. Its exact product blob hashes and complete non-product path list are in `old-ff562-to-layered-baseline-22fc.json`. The difference between 1,121 paths at main and 1,114 at the HBR layer is seven product files that the frozen HBR source layer restores to the old-base versions; those restored blobs are individually pinned in `blob-checksum-ledger.json`.

## Test-result scope

No tests, builds, browser runs, or release qualification were run on this new assembly. The copied `cards023k-round-1/builder` command records belong to the original private candidate `95cce2f` on old base `ff562bd`; they are preserved as provenance only and do not certify this assembled source tree. A fresh critic should evaluate the `d873198` source tree with the seven frozen HBR files present.

The original combined run's direct failure summary (exit 1; 29 tests; 27 passed, 2 failed) remains in `cards023k-round-1/builder/initial-combined-run-failures.txt`. Its original raw TAP stream was not captured as a file during that first invocation and remains explicitly unavailable.

`assembly-evidence-ledger.json` records byte size and SHA-256 for every file in the preserved round-1 builder evidence and round-2 assembly evidence directories, excluding the ledger itself to avoid recursive hashing. It is an integrity ledger only; it does not change the source/test provenance above.
