PIECE: CARDS-021K round2
VERDICT: PASS
EVIDENCE:

The command `node --test tests/rl-environment.test.js tests/cards021-integration.test.js tests/editable-deck.test.js tests/game-building-policy.test.js` produced this actual TAP ending:

```text
1..33
# tests 33
# suites 0
# pass 33
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 129279.382042
```

The covered Buried Coil cases passed: custom eight-card GameSession deploy spends once and contacts ground and air; seeded AI deploys through its custom deck; RL admission, conceal/reveal/reconceal, and lifetime expiry all restore through real checkpoints. The raw output is retained in `requested-tests.tap`. The shell wrapper printed `zsh:1: read-only variable: status` after Node had completed and written the zero-failure TAP summary; the failure is in the command wrapper's post-run status variable, not the test output. The source/test diff whitespace check is clean; repository-wide `git diff --check` only reports two trailing spaces in the preserved initial failing TAP artifact at builder lines 53 and 55.

The independent `RLEnvironment` probe observed a concealed, untargetable coil at tick 1; the seeded opponent revealed it at tick 66, with `attackPhase: "winding"`, `nextAttackTick: 107`, and `targetId: 1`; the actual runtime reconcealed at tick 109. The three returned receipts were exactly:

```json
[
  {"authoritative":false,"confidence":"unverified","disposition":"question","key":"hiddenInitialPolicy","source":"pre-evolutions-building-corpus-and-unsourced-policy-fixture","value":"concealed-and-untargetable-until-an-eligible-target-is-in-sight"},
  {"authoritative":false,"confidence":"unverified","disposition":"question","key":"hiddenReconcealPolicy","source":"pre-evolutions-building-corpus-and-unsourced-policy-fixture","value":"reconceal-on-first-boundary-with-no-eligible-target"},
  {"authoritative":false,"confidence":"unverified","disposition":"question","key":"hiddenRevealAttackBoundary","source":"pre-evolutions-building-corpus-and-unsourced-policy-fixture","value":"reveal-and-begin-windup-on-the-same-integer-boundary"}
]
```

`RLEnvironment.restore` rejected missing, forged, and extra/unclosed policy fields. `GameSession` admission rejected the same three mutations. An unmodified reveal checkpoint restored byte-for-byte, and the restored and original RL branches matched every tick through reconcealment and ended byte-identical. The probe did not call `GameSession.fork`; full JSON is in `independent-hidden-probe.json`.

A direct run against accepted commit `7550ca3` produced byte-identical default-eight records for seeds 0 and 23. Seed 0 setup/session SHA-256 were `6605be1bdf48aa971f3c55d841c19fc44a748ef1f5e25609630a25ec663c4e98` and `ed371dd1d28d6be72a98bda32e434cbbc5431eea4f163e4206a1901cd08dbea1`; seed 23 values were `94cbdd3603f4522a8f986499813eb4e210eafd4d4b6170d7d0c81d188faaa219` and `d6879256a66396ff175769546a9c66d0158bfe11d60892713a43173c6b4bff63`. The entire RL serialization hashes also matched. A non-hidden Ember Basin observation matched accepted `7550ca3` at seed 1, tick 1, SHA-256 `8ebe0daa72c8de338c5cb655b07e4127727a721849f53708d8e697b58b8b19b7`, with neither hidden-only key present.

Against accepted `7550ca3`, only the mixed deck allowlist, RL environment, and three relevant test files changed. The reference tree, `public`, and `demo` had no delta. The simulation kernel remains exactly 524,103 bytes with SHA-256 `7e21668d9348670cf4ebb9d4fb917be146b75b97acaf974b253ab57d6a5361c2`. Schema, nondeterminism, and shipping-isolation gates passed 20/20, 10/10, and 13/13. Their raw TAP is retained beside this verdict.

The 353-field pinned Tesla building row remains research evidence only. The source evidence describes `27000006` as a proposed comparator, lists no current comparator IDs for Tesla, and makes no full historical execution claim. The runtime's cost identity is high-confidence; damage, deploy/attack timing, hitpoints, targeting, concealment, reveal boundary, and lifetime receipts remain explicitly unverified/questions. Builder receipt commit `a46f39d8a9c8fd9e4bb51e890bfb25e871c95fbe` is a child of source `f0cd988f03357da26fcf6d5dcb3a78a49c84e1f2` and contains artifact/status changes only; it was not treated as source adoption. The accepted-base audit is in `source-fences.json`.

BIGGEST GAP: The historical Tesla join is still only proposed and the hidden, combat, reveal-boundary, and lifetime policies remain unverified QUESTION receipts, so this pass establishes observability of the current simulation rather than historical parity.
