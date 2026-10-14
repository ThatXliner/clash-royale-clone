PIECE: GAME-001GRG restart listener regression gate
VERDICT: FAIL

EVIDENCE:

`npm run test:game-restart` on a clean detached checkout at c5c2486c87ee61d844f124f0cbb5320960caee75 passed 3/3. The full TAP is in `candidate-test.tap`. The baseline run recorded by the builder failed with `Expected values to be strictly equal: 2 !== 1` at the former aggregate arena listener-count assertion; that actual TAP is in `baseline-reference.tap`.

The new active-graph assertion compares the complete event-type/count membership: one `pointermove`, one `pointerup`, and one restart `click`. This matches `input-controller.js`, which registers those two pointer listeners in pointer mode, and `game-browser-entry.js`, which attaches one restart click listener. It is meaningful with the fake `Node` representation, whose per-event `Set` detects distinct duplicate callbacks. The checks run on the initial graph and both replacement graphs. Existing seed-zero serialization, input, audio, and stale-callback checks remain in place.

The replacement cleanup assertions omit the four hand-card nodes, although `input-controller.js` registers a `click` listener on each. A private fault injection changed only the fake `Node.removeEventListener` to leave card callbacks installed. The first restart test still passed, while instrumentation reported detached card listener counts `[1, 1, 1, 1]` after restart and `[2, 2, 2, 2]` after restore plus the second restart. This demonstrates the regression gate does not verify cleanup across the whole graph; it does not establish a production leak. The injected TAP and test-only patch are in `fault-injection-first-restart.tap` and `fault-injection.patch`.

Production source was unchanged: the base and candidate `src` tree hashes both equal `3d20a2bcc4f2a8c6b476215ec7c1e7ef783e6bee`. No production fix is claimed. Source and checkout evidence are in `source-pre-post.txt` and `production-hash-comparison.txt`.

BIGGEST GAP: Assert that every detached graph’s four hand-card nodes have zero listeners after each restart, including the restored second restart; the current test passes even when their click listeners are deliberately retained.
