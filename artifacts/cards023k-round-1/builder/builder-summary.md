# CARDS-023K Aether Well builder evidence

Candidate base: `c1d17ec2a5591e9871659dfdea9a4e9f4688ea6d`, with the separate finalized K3 test layer committed first as `ff562bd3027f40509f0e5e7e6f9848d98faf6346`. This private candidate contains only the requested two source files and three test files beyond that base. The source fence records the full source/test/script/dist/package scope at `source-fence-before.json`, `source-fence-after.json`, and `source-fence-delta.json`.

The implementation admits `aether-well` into the mixed editable-deck witness and RL deck boundary. Resource observations expose the live structure's target mode as `none`, its full canonical policy receipt, and lifetime data derived from that actual structure receipt. Existing defensive target-mode spelling and lifetime observation semantics remain unchanged. Public RL restore rejects missing or forged v2 resource receipts transactionally. A separate test confirms the host can still restore its v1 GameSession receipt while the current public RL API rejects that legacy setup against its canonical v2 deck configuration.

## Verification

Commands use Node `/Users/me/.hermes/node/bin/node` (v22). Every command below has raw stdout, raw stderr, argv/cwd JSON, and direct exit code captured beside this file.

- `focused-editable-deck`: exit 0, 12/12.
- `focused-aether-well-final`: exit 0, 1/1. This uses a real player command and unforced seed-2 controller, checks one cost-6 spend per side, death and expiry payouts, cadence, cap, chunking, and tick-3898 restore/fork equivalence.
- `focused-aether-well-rl-versioned`: exit 0, 1/1. Covers live v2 observation, exact receipt restore, and v1 RL rejection.
- `final-full-rl-environment`: exit 0, 16/16, including natural session completion cases. Duration 128274 ms.
- `guard-nondeterminism`: exit 0, 10/10.
- `guard-shipping-isolation`: exit 0, 13/13.
- `guard-game-roster-admission`: exit 0, 7/7.
- `guard-integration-audit`: exit 0, 6/6. The canonical integration manifest matched the pinned SHA-256 `259d5fcfbc33e9bcb983676891f8b5d723255e25ca82af53348eaa0363e520b1` across two audit runs.
- `source-fence-final`: exit 0. Changed paths are exactly `src/content/editable-deck.js`, `src/rl/environment.js`, `tests/cards023k-aether-well.test.js`, `tests/editable-deck.test.js`, and `tests/rl-environment.test.js`.

## Initial exploratory run

The initial combined command was `/Users/me/.hermes/node/bin/node --test tests/editable-deck.test.js tests/rl-environment.test.js tests/cards023k-aether-well.test.js`; its direct exit was 1 with 29 tests, 27 passing and 2 failing. The first Aether lifecycle assertion read a top-level card ID instead of `materialization.cardId`. The first RL target-mode projection overwrote Buried Coil's defensive runtime spelling with the card-level spelling. Both fixes and the corrected final runs are retained here. The initial TAP output was emitted directly to the original tool response and was not saved as a raw file at that time; `initial-combined-run-failures.txt` preserves its direct exit, counts, and failure details.

This is builder evidence for a private candidate. It does not claim review acceptance, product adoption, release qualification, browser qualification, or historical parity.
