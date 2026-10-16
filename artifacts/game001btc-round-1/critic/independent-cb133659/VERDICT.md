PIECE: GAME-001BTC — Shared battle contract verification repair
VERDICT: PASS
EVIDENCE:

- The accepted baseline command reproduced all three pre-existing failures: first assertion `20 !== 30` at the initial boundary; missing receipt message `roster[6].entities[1] source confidence field lacks a QUESTION record`; and the old `assert.ok(pairedError instanceof TypeError)` failed for a valid paired scalar on a generic QUESTION source. Baseline TAP summary: 11 tests, 8 pass, 3 fail, 0 skipped.
- Candidate `tests/game-battle.test.js` passed 11/11; `game-roster-troops-ordinary` passed 25/25; `game-roster-admission` passed 7/7. Total: 43/43 candidate TAP cases, 0 failed, 0 skipped. Full stdout/stderr and direct invocation metadata are in `RUN-LEDGER.md` and `runs/`.
- The independent causal check verified the two six-member deployment receipts reserve IDs `[1,2,3,4,5,6]` and `[7,8,9,10,11,12]`. IDs 1 and 7 spawn at tick 0; the remaining pairs spawn at ticks 6, 12, 18, 24, and 30. It also verified paired Unicode source text is accepted for generic `brassbolt.body-radius-millitiles`, rejected at source-confidence provenance for `briar-runner.count`, and a lone surrogate is rejected by Unicode scalar validation.
- The candidate adds staged counts, sides, archetypes, stable reserved IDs, deployment receipts, and spawn-event boundary assertions without changing production source. The candidate and baseline source/test/package/assets objects match their Git commits exactly; their only changed executable file is `tests/game-battle.test.js`. Pre/post fences have zero changed hashes.

BIGGEST GAP: This piece does not establish historical first-member onset, formation geometry, orientation, or member order; those remain separate source questions.
