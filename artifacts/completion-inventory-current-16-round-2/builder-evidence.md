# COVERAGE-002 round 2 builder evidence

## Frozen inputs and scope

The source snapshot is `6dcf64b81751f69f9fe7520878ac136bda9143ed`. The round-1 inventory being repaired is `20f2e8abed1cb5fffab767fac138fb4ab941644f`. I created a fresh source archive with `git archive --format=tar 6dcf64b81751f69f9fe7520878ac136bda9143ed` and linked only the workspace `node_modules` into it. I overlaid the owned inventory and round-2 probe files; no mutable source files were used for generation.

The generator now binds each current row's comparison object and evidence list to the declared current mapping, the exact frozen test declaration text, and the exact mapping line. A known key present in the historical corpus is not enough to promote a QUESTION fixture. Cinder Host remains `question-fixture-only`; Ironroot remains a declared comparison candidate with a separately marked QUESTION fixture. All source-unverified fields remain `QUESTION`.

## Verification

From the clean archive, these commands passed in order:

```sh
node artifacts/completion-inventory-current-16/generate.mjs --check --self-test
node artifacts/completion-inventory-current-16/generate.mjs --write
node artifacts/completion-inventory-current-16/generate.mjs --check
node artifacts/completion-inventory-current-16-round-2/mutation-probes.mjs /tmp/coverage002-round2.z72XuH
```

The generator log is at `logs/generator.log`; independent mutation results are at `logs/semantic-probes.log`. The semantic probes reject all three prior false accepts: Cinder Host promoted to the known `skeleton-army` key, declaration line `999999`, and mapping line `999999`. The inventory output hash remains `674aa6320a79ae452f854e2bcc6e40fe4a504b3963cddb28815e876ef206118b`, byte-identical to round 1.

The inventory still reports 109 historical rows (78 troops, 13 buildings, 18 spells), 16 editable IDs (15 units and one effect), default deck 8, 19 current admission occurrences, and 53 admitted catalog IDs / 58 occurrences. It records 12 declared test-comparator candidates, 2 QUESTION fixture mentions, 4 IDs with no exact historical identity assertion, and zero full historical executions or parity claims. The 12 are candidates declared in tests, not verified historical matches. The 11-row baseline remains hash-pinned and unchanged.

No runtime or publication build was run in this builder round; production artifact exclusion remains for the independent critic to verify. No historical parity or low-confidence field was promoted.
