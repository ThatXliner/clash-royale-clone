# GAME-001HTJC fresh critic fixture

Candidate commit: `796557a95e6baca1747d7f5d45b97e4d8d094682`
Candidate tree: `0c9414f5fc9ef3fd7eeb11520e47d792ae82e78b`
Candidate source tree: `c510ff4916996f6e9a182e6bdafb147c67320615`

The bounded candidate root is `candidate-files/`, created with `git archive` from the exact candidate commit. It contains 580 tracked files totaling 12,665,482 bytes: `src/`, `tests/`, `scripts/`, `public/`, package manifests, `LICENSE`, `NOTICE`, and only `reference/stats/cards.json` plus `reference/stats/SOURCES.md` as isolated guard inputs. It excludes `node_modules`, `artifacts/`, history, and unrelated reference files. The raw e35 baseline source archive is separately at `raw-baseline-e35/`.

Verified artifact identities:

- `src/sim/live-battle-chain.js`: SHA-256 `422f55187f2af86f6498a4d841484a0193363a50ff5b9b335e412fefb948c01f`
- `src/sim/battle-continuation-kernel.js`: 458,613 bytes; SHA-256 `be54e62ff0d7863ba9a73310e0d2727687d2aa4ff1630e74249b8ea9f160a452`
- The isolated `reference/` input has exactly two files.

## Final status

The explicit runtime grant was used for only the scoped fresh checks below. Each run has raw stdout, raw stderr, actual argv/PID tree, allowlisted environment, and direct exit status in `captures/`:

1. Focused host suite: PID `99267`, exit `0`, 9/9.
2. Nondeterminism guard: PID `99477`, exit `0`, 10/10. Shipping isolation guard: PID `99525`, exit `0`, 13/13.
3. Private rollback harness: PID `99965`, exit `0`, actual unit/building/crown owners, clone/adopt fault rollback, and in-place negative controls.
4. Absent-policy bytes: PID `1273`, exit `0`, raw e35 default path through ordinary unit HP loss and separately labeled one-sort compatibility path.
5. Actual nearest-friendly versus farther-hostile `LiveBattle` probe: PID `2185`, exit `0`; it contacts the friendly north building and is the blocking FAIL finding.

See `VERDICT.md` for the evidence and interpretation, and `EVIDENCE-INDEX.md` for portable file references. The initial hostile-side run whose origin distance was sampled after settlement is preserved but superseded by the reviewed pre-hop-origin capture; the two illegal `river_excluded` setups are recorded separately. No full `npm test`, browser, endurance, or browser-render check was run. No product checkout or index files were changed.
