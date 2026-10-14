PIECE: GAME001GRG restart listener regression gate, round 2
VERDICT: PASS

EVIDENCE:

- The immutable candidate `0d4b5a24f6d4a7290b014f3676631f82c7cf76ec` ran `npm run test:game-restart`: exit 0, 3 tests passed, 0 failed. Raw TAP is in `candidate.tap`.
- The candidate assertions require exactly one `pointermove` and one `pointerup` on the active arena, one `click` on the active restart button, and one `click` callback on each of the four active hand cards. Following both replacement transitions, the detached shell, audio control, restart control, arena, and all four hand cards have zero listeners. The second transition follows restoring the terminal browser snapshot and restarting again.
- The test also retains its seed-zero/session equality, terminal-state reset, audio policy preservation, cleanup aggregation, and stale restart/pointer/frame callback checks.
- The private fault copy made `Node.removeEventListener` a no-op for cards. The round 2 candidate rejected it: test 1 failed at the first detached-hand check because hand card 0 still had one `click` callback; tests 2 and 3 passed. Exact TAP excerpt:

  ```text
  not ok 1 - game restart: terminal click atomically replaces the whole graph with exact seed zero
  error: |-
    hand card 0 listener membership
    + actual - expected
    + [ [ 'click', 1 ] ]
    - []
  location: .../tests/game-restart.test.js:249:3
  # tests 3
  # pass 2
  # fail 1
  ```

  The full output and exact private patch are `fault-injection.tap` and `fault-injection.patch`.
- The same fault against prior-round candidate `dcf82fa068c85d65f50f9814694c03c3efd68984` still passed 3/3, confirming the new detached-hand assertion closes the reported false pass. See `prior-fault.tap`.
- The accepted-base baseline `f366a1a6af66c8630dade65932b5e30c52678ded` had 2/3 passing; its old restart assertion expected one projection child and observed two. The round 2 candidate passes 3/3. See `baseline.tap` and `candidate.tap`.
- The candidate worktree was clean before and after. Hashes for all `src/` files and `tests/game-restart.test.js` match before and after execution, and the accepted-base-to-candidate diff contains no `src/` changes. Scope and hashes are recorded in `candidate-scope.txt`, `source-pre-post.diff`, and the SHA-256 manifests.

BIGGEST GAP: This is deterministic fake-DOM coverage; it makes no claim about native-browser dispatch or a production listener leak.
