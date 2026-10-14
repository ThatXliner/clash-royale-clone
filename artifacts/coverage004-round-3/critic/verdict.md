PIECE: COVERAGE004 current release evidence guide round 3
VERDICT: PASS
EVIDENCE:

The guide was reviewed from immutable candidate `9006a11e2bd6db06f53fb0f2038107069c6e6848` (tree `e7ace7ecb45ed489c88aa145e239c2ee7185b4d5`, parent `f9ab8ef0cd93027a969d502f2a2b32b8407802fc`). From a fresh `git archive` of that commit, `node artifacts/coverage004-round-3/builder/check-guide-evidence.mjs` exited 0. Its stdout was 2,926 bytes with SHA-256 `13c9a01b549f88116ac9b0d450e15a17f5a0cdb39568a8ee173e5ff6906c424d`; it matches both the saved round-3 stdout and `guide-checks.json` byte-for-byte. The fresh archive receipt also matches the saved receipt, and stderr is 0 bytes (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). Full raw stdout and stderr are in `clean-archive-check.stdout` and `clean-archive-check.stderr`.

The checker's actual receipt reports 21 local Markdown links checked and 0 missing; an independent path walk from the same archive also reports `checked=21 missing=0` (`local-link-check.txt`). The guide SHA-256 is `8aad650c55e0bc47e395dcc5cfba0a5bb1618127c1338e5826029b3821aaf0f0`. It contains no `20th` or `twentieth` ordinal claim.

The pinned map records 109 historical rows (78 troops, 13 buildings, 18 spells), 18 editable IDs (17 units and one effect), 12 declared comparator candidates, 8 unchanged default-deck IDs, 0 full historical executions, and 0 historical parity claims. I independently reran the catalog read from a clean archive of source commit `151f54b7a40a266100522c7bdb3e3fca39b9918f`; its actual output was:

```json
{
  "admittedIds": 56,
  "admittedOccurrences": 61,
  "claimedIds": 62,
  "claimedOccurrences": 67,
  "excludedClaimedIds": 6,
  "excludedClaimedOccurrences": 6,
  "questionOnlyExports": 5
}
```

That output is saved in `catalog-source-check.stdout`; stderr is empty. The separate 67-occurrence audit receipt reports 62 unique supported IDs and 5 QUESTION-only occurrences, consistent with the guide’s admission-versus-coverage distinction.

The last reviewed browser evidence contains 19 unique collection IDs, added `ember-basin` over the frozen 18-ID map, and records an eight-card battle deck. Its pinned test source hash is `a66f6d45e99d26b5fbddd2213be4836a4eb417002e432b4b3dfcd08d2e8e36ab`; that source asserts a visible count of exactly 19 and matches the hash in the CARDS-018I verdict. The saved TAP is `# tests 1`, `# pass 1`, `# fail 0`. The release manifest hash agrees between the builder and critic receipts.

The source-snapshot and live Chrome probes each record 20 unique choices, including selectable Kilnkeeper. Both report 0 portraits and 0 lore entries for its detail view; the source probe reports no loaded Kilnkeeper art and no browser errors. The live public probe records HTTP 200 for `https://bryanhu.com/clash-royale-clone/game/public/index.html`, 20 IDs, the Kilnkeeper heading, and a 200 entry bundle with SHA-256 `76dcd24f375ea20dea41742dfcbd0e1c02bf3db9394f48868be687e762159f7b`. Its captured DOM sequence places Kilnkeeper at position 18; the guide reports the collection count and makes no position claim. I inspected the linked phone capture: it shows the generic blank green fallback tile, no portrait or lore, and unqualified combat values except for the ground-layer note. This matches the scoped CARDS-019D FAIL summary.

At the frozen candidate, PLAN and linked verdicts separate H1 PASS (bounded shared target-following, accepted in commit `74cd3a892a53db1702a04120a9e5a92e55d0fb7e`, round 439) from H2 QUESTION; the H1 verdict explicitly excludes historical homing parity. CARDS-019D is FAIL because unverified combat values lack a provisional/QUESTION label, and CARDS-019I remains BUILDING. The public release receipt pins `main` to `dbd7afe4a8901b5b61c83ebc92137a5bd26e5451`, workflow `38501010696` to completed/success, and both landing and game URLs to HTTP 200.

The endurance receipt is pinned to candidate `9f64011378d3ce1c6281d9292950a7b52f11fd2c`: default deck 8, 18,000 ticks, 67 segments, one pause record, and one resume record. The guide states that this does not establish endurance for the changed public `dbd7afe4` runtime. The short default-eight comparison is exactly six snapshots: seeds 0 and 23 at ticks 0, 120, and 900. RELEASE-TEST-001 retains the older round-1 FAIL and the round-2 successor PASS (28/28 scoped checks plus Pages 5/5).

The preserved round-1 and round-2 builder trees match protected candidates `2a9ce31` and `236fbf5`; all 12 entries in the prior-builder SHA-256 manifest pass. Existing round-1/2 critic artifacts are unchanged from the parent base, and the round-3 commit changes zero product source, test, runtime, or public asset paths. Preservation receipts are in `preservation-check.txt` and `preserved-builder-hash-check.txt`. The compact independently extracted records are in `independent-audit.json`.

BIGGEST GAP: The 109-card historical target still has zero full historical card executions and zero parity claims, which the guide states plainly.
