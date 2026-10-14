# CARDS-021K round 2 builder status

Base: `9d8b542c7927b3d95f78d88ff723d088bc0a4bd0` (R1), based on
`76e202ff85d8d5920fc58a248b1324f56da5b3f2`.

This round carries the existing canonical hidden-building state and its three
existing conceal/reveal QUESTION receipts into RL structure observations.
`hidden` and `hiddenPolicyQuestions` appear only for the existing defensive
profile whose variant is `hidden`; other structure observation fields and the
serialized RL/GameSession snapshots are unchanged. The receipts remain
`authoritative: false`, `confidence: unverified`, and `disposition: question`.

The first full RL run reached 14/15. Its new conceal/reveal test used the
slice-based deck from an earlier RL admission test; that deck produced a
different opponent target sequence and did not reconceal on the first stride
after reveal. The failure is retained in `rl-environment.initial.tap`. The
test now pins the already-probed legal eight-card deck and seed whose actual
GameSession path conceals at tick 30, reveals at tick 90, and reconceals at
tick 120. The corrected focused test passed 1/1 in
`rl-hidden-focused.tap`, including exact restore continuation and source
receipt rejection through `RLEnvironment.restore`.

The final full RL run passed 15/15 in 125.5 seconds after the fixture
correction. It includes the lifetime-boundary check: a hidden coil remains
alive at state tick 1,800 with a separate 1,800-tick lifetime QUESTION and
expires after the next processed boundary; its authenticated restore branch
matches. Final raw output is `rl-environment.final.tap`.

Adjacent checks passed: GameSession integration 3/3, editable deck 12/12,
building policy 3/3, content schema 20/20, nondeterminism guard 10/10, and
shipping-isolation guard 13/13. Their raw outputs are retained in this
directory. This is not a fresh-critic or release qualification claim.

No UI, art, content profile, simulator, manifest, or default-deck source was
changed. The R1 default-eight setup/session hashes still match the current R2
results; current R2 hashes and the exact source fence are recorded alongside
this status.
