PIECE: GAME-001GPR5 round 3, exact candidate `5ba4002e9f71830da447be1e985505c608d9c06f`.

VERDICT: PASS for the stated bar on the current exact-candidate full browser run.

EVIDENCE:

- Ran `env -u GAME_BROWSER_ENDURANCE_TICKS npm run test:game-browser-endurance` in the detached candidate archive. Exit code 0; TAP reports 2/2 tests passing. The full endurance subtest took 987,818 ms and the complete test process took 990,051 ms. It reached browser session and DOM tick 18,000 with the frozen setup fingerprint `306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`.
- The replayed browser E2 deliveries contain 40 contiguous accepted command IDs. Their card, slot, arena point, and tick sequence exactly matches the 40 offline preflight decisions, including six emergency decisions. The final state digest matches preflight: South wins 2–1 by lowest HP, with the same crowns, towers, deck, elixir, and terminal tick.
- Restore cut at tick 300, restored from the tick-600 branch, and replayed back to tick 600. The browser/direct-E2 session, input, and audio parity assertions passed. Terminal screenshot and restart screenshot are fresh from this run; restart returned session/DOM to tick 0.
- Initialization's largest observed long task was 197 ms under the 300 ms cap. The measured drive, restore, terminal, restart, screenshot, and final-observer long-task maxima were 0 ms under the 50 ms cap. Console errors, resource errors, unhandled errors, and pending resources were all empty.
- All 144 source/runtime SHA256s and all four candidate harness-file SHA256s match their pre-run manifests. The exact archive's 2,808 tracked Git blobs were previously verified against candidate `5ba4002`; no runtime/source, authority, AI, or deck files changed during the browser run.

BIGGEST GAP: The test exercises pause/resume at tick 300 and compares the browser session with the direct mirror after both operations, but does not compare session bytes across the pause/resume boundary. `GameSession` records one pause and one resume in its serialized transcript, so the full-run serialized-session hash differs from preflight by those two lifecycle records; removing exactly those records reproduces the preflight hash. Simulation state, accepted action sequence, and browser/direct session parity match. This does not fail the stated bar, but the assertion text claiming pause/resume cannot change canonical bytes is broader than what the assertion proves.

Fresh outputs: `browser-full/full-browser.tap`, `browser-full/endurance-result.json`, `browser-full/active.png`, `browser-full/terminal.png`, and `browser-full/restart.png`. Their SHA256s are listed in `browser-full/fresh-artifact-manifest.json`; the exact command and checks are summarized in `full-browser-evidence.json`.
