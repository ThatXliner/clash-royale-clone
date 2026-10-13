PIECE: GAME-001GPR5P terminal-aware planning and explicit duration failure
VERDICT: PASS (bounded terminal-planning piece)
TEST PASS RATE: 1/1 focused regression; final provenance/adversarial probe passed

EVIDENCE:

- `node --test tests/endurance-workload.test.js` passed 1/1. Its TAP output is preserved in `endurance-workload.tap`.
- The frozen Chrome JSON (`bd06ef21…e90594`) is byte-identical to the replay input copy. Its SHA-256 matches the derived checkpoint manifest's transcript hash. All six derived checkpoint hashes, from tick 9000 through tick 13200, match. The two terminal replay outputs are byte-identical (`4a362094…bc61a`).
- The replay record ends at tick 13352, terminal result at tick 13351: north won 2–1 by overtime sudden death. At the last active tick, 13200, the recorded planner and normalized physical delivery both say `cinderlings`, slot 0, point (14500, 5500). In the initial actual checkpoint restore probe, the helper's plan matched that recorded command before the probe reached its later over-strict source-byte assertion; that harness-only assertion output is preserved separately.
- The final adversarial probe confirms the terminal planner returns `null`, early termination throws `endurance workload ended naturally at tick 13351 before required tick 18000 (overtime_sudden_death; north won)`, and a forged tick count of 18000 on that terminal state still throws. An active state at exactly tick 18000 remains allowed. Altered terminal counts and a changed transcript hash fail the pinned evidence checks.
- The moved active planner body matches the pre-change body after removing the intended terminal guard and normalizing formatting. The 6c7 frozen source hashes match for all ten runtime files recorded in the original source manifest; the simulation kernel SHA-256 is `eab70aaddccc9b60fb52d701cf0efcf37b343dc07de79650364f35f47b7f0335`.
- The integration diff only imports the shared helper, removes the inline copy of the planner, and adds the continuation check at the top of the existing loop. The 300-tick cadence, 18000 target, 50 ms/300 ms caps, seed-zero/default-eight setup, input, restore/audio, terminal, and restart assertions remain unchanged.

SCOPE LIMIT: The focused test builds its helper input from the hash-verified derived replay manifest; it does not itself rerun Chrome or the natural terminal. The frozen browser transcript and two matching deterministic replay outputs are separate evidence for that terminal. No fresh full 18000-tick browser run was performed or claimed.

BIGGEST GAP: GAME-001GPR5 remains FAIL because the unchanged seed-zero/default-eight endurance run naturally ends at tick 13352, before 18000; no qualifying sustained workload policy has been found and full terminal/restart proof is still absent.

PLAN STATUS: `PLAN.md` still records GAME-001GPR5 as FAIL (1/2) and GAME-001GPR5P as BUILDING (0/0); this critic verdict is scoped for the parent to record.

WORKTREE NOTE: Three unrelated existing dirty source files (`src/content/visual-asset-manifest.js`, `src/ui/card-lore.js`, and `src/ui/card-portrait-art.js`) were left untouched and excluded from this critic-only commit.
