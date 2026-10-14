# GAME-001MS round 1 critic

Verdict: **PASS** for the stated materialization gate.

I reviewed immutable candidate `15a98894f7311c32e598f9bd08c12f7aaa413924` from a `git archive` extracted to `/tmp/game001ms-critic.BdutXt`, outside the shared worktree. The full `npm run test:game-session` command completed naturally with **9/9 passing, exit 0, 82,172 ms**. The exact TAP returned by the run is retained in `full-game-session.tap`; run metadata and hashes are in `run-manifest.json`.

The only source/test implementation delta from parent `ff7be6069e0c1edd068c5a3e01501b5167f12950` is `tests/game-session.test.js`; the candidate also adds its builder receipts. The candidate `src` tree is byte-identical to both parent `ff7be...` and accepted source `151f54b7a40a266100522c7bdb3e3fca39b9918f` (`git diff --quiet` exit 0 for each). I made no source or test edits.

The new gate independently pins all eight default roster IDs in a literal expected schedule, finds a deterministic seed with the card in both initial hands, and submits one real south command while the normal session opponent proposes north's only legal card. For every role it checks exactly one opening-boundary commit per side, distinct deployment and spend sequences, an accepted spend reflected in shared elixir, one deck advance per side, globally unique member IDs, and each live member's card, side, deployment identity, and birth offset. It checks the state immediately before and after every Briar Band birth at relative ticks `0, 6, 12, 18, 24, 30`; it checks the three Cinderlings at the instant boundary and all singleton roles at their opening boundary. It then verifies full materialization and retains the separate 400-tick damage, death, and tower-damage combat assertions.

The eight other game-session tests remain in the file and passed. The actual run includes the full regulation/overtime/tiebreak terminal-and-restore test and the live simultaneous-death terminal test, so no shortened or cancelled run was used.

The source boundary is respected. `SOURCES.md` records raw times in milliseconds, and the accepted CARDS-017T / air-swarm source audit supports a 100 ms interval between members, or six 60 Hz ticks. Its publisher-wide rule includes the Skeleton instant-expansion exception. The fixture's zero offset is explicitly the current runtime's first-member boundary convention, not historical onset evidence. It checks only timing multiplicity for Briar Band, not component order or geometry. Historical first onset, member order, orientation, and formation remain QUESTIONS; no full historical-parity claim is supported by this gate.

Largest remaining evidence gap: no squad-specific historical footage establishes first-member onset, formation, or member order. Keep those mechanics marked QUESTION until suitable pre-March-2023 capture is available.
