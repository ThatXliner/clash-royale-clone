PIECE: CARDS-018K
VERDICT: FAIL

EVIDENCE: On the clean `d20938f` archive, the five required focused suites passed 52/52 and the nondeterminism and shipping-isolation guards passed 23/23. All 2,854 extracted tracked blobs match the commit. Seed-0 and seed-23 default-eight setup, initial state, 120-tick state, and replay bytes are byte-equal to parent `a142ec8`. Live probes retained all 20 Briar confidence QUESTION records exactly, rejected four hostile provenance mutations, observed 1,185/1,356 Ember Basin HP after 171 damage at tick 120, and queued 222-damage splash contacts to IDs 3, 4, and 5 at tick 127; a dead structure remained observable at ID 2 with 0 HP. Receipts and TAP output are in this directory.

The explicit documentation bar is unmet: `docs/rl-api.md:54–60` omits the `structures` observation field, and `docs/rl-api.md:73–75` describes a version-1 checkpoint. The candidate exports RL version 2 and writes version-2 checkpoints.

BIGGEST GAP: Update the RL API guide to document the additive `structures` observation field and explain version-2 observation and checkpoint compatibility.
