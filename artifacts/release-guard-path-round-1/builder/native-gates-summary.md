# RELEASE-GUARD-PATH-001 builder packet

Base: accepted main `bd9125a06b529317a27ad4c176f4abe4d17fce78`.
The candidate changes exactly `scripts/build-release.js` and
`tests/release-001b-guards.test.js`; all other source, package, asset, stats,
workflow, and documentation files are fenced byte-for-byte. No release output
or repository path was used as a negative-control target.

The bug was a lexical-versus-canonical identity comparison. `buildRelease`
already resolves `outputReal`, but the workspace-root and workspace-ancestor
preflight branches compared the lexical `absolute` output against canonical
`rootReal`. Both comparisons now use `outputReal`; the ordering, specific guard
messages, other protected-root checks, and policy limits remain unchanged.
The tests cover an aliased workspace root and an aliased ancestor, each with a
missing config file, exact guard-message assertions, and before/after snapshots
that include the symlink target (`readlink`) and sentinel bytes. The canonical
nested temporary-workspace fixture from R2 remains in place and exercises the
dangerous-target branches with distinct roots.

## Preserved negative controls and attempts

- Final regression-source negative control used the immutable old production
  script `7367a80508a1b9c1368e1886144bddfd6027b3cbefa8f63aed45bb6249792d60`
  with the final test hash below. PID 67689 exited 1 as expected: 15 passed,
  2 failed. The aliased workspace reached `ENOENT` on the missing config; the
  aliased ancestor failed later at the symlink-output guard instead of the
  intended containment guard. Raw streams, exact command, hashes, and exit are
  in `native-runs/negative-control-final-old-script/`.
- The initial pre-fix probe and earlier red regression are preserved in
  `native-runs/negative-control-old-guard/` and
  `native-runs/attempt-guard-80Djrp/`. The latter exposed a test matcher
  mismatch; it was retained, the assertion was corrected to compare the exact
  error message, and the old-script negative control was rerun against that
  final test source. No failed attempt was overwritten.

## Final native gate sequence

All seven direct processes returned exit 0. The clean environment pinned Node
22.22.3, npm 10.9.8, Google Chrome 155.0.8059.40 at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and private
Playwright 1.58.2. Every browser-dependent gate received these explicit
`GAME_BROWSER_CHROME` and `GAME_BROWSER_PLAYWRIGHT` paths.

| Gate | PID | Result |
| --- | ---: | ---: |
| Focused release guard, `TMPDIR=/tmp` | 68406 | 17 passed, exit 0 |
| Focused release guard, distinct existing `TMPDIR` | 68409 | 17 passed, exit 0 |
| Release build | 68434 | 24 passed, exit 0 |
| Shipping isolation guard | 68683 | 13 passed, exit 0 |
| Shipping isolation release | 68731 | 4 passed, exit 0 |
| Shipping isolation host | 69044 | 1 passed, exit 0 |
| Publication Pages | 69084 | 5 passed, exit 0 |

Total: 81 passed executions, 0 failures, 0 skips. No full endurance run was
performed. Each process has direct stdout, stderr, command, cwd, PID, exit, and
receipt checksum in `native-runs/attempt-guard-TVIcHW/`; the runner stops on a
nonzero result.

## Frozen source and generated-report fences

The final tested source blob hashes are:

- `scripts/build-release.js`: `a560990d45c1c32f0d62eca0fe036128aea28dd886079b3d61ce92fc562d1847`
- `tests/release-001b-guards.test.js`:
  `82e96f9cc97beef8d323bf4326a8c6466cdc47201b0230c968630f443d056996`

The before/after aggregate source fence hashes are both
`48acd4eebbc91d1cc930970fe8ef03c7b9419ca340735e1a3fe3f090ce26fc8a`; their
file inventories also match (SHA-256
`7129f05f65d3e6691db2c0cf57d586827b2c59d8be9e012ef1778793c162e4d8`). Seven
generated report files were captured under `report-generated/`; all seven
original report paths were restored and byte-compared successfully. Their
original and generated hashes are recorded in `report-generated.sha256` and
`report-originals/`. The detailed restore result is in
`report-restore-check.txt`.
