# COVERAGE-004 round 2 critic verdict

**VERDICT: FAIL.** The clean-archive strict checker passes (exit 0), but the guide has two scope wording errors. The largest is its claim that Kilnkeeper is “the 20th choice.” The committed live DOM receipt orders the 20 cards with Kilnkeeper at position 18, and an independent Chrome replay from clean source commit `6198883470fa48f6746974d7590168ae3011ac37` reproduced 20 cards with Kilnkeeper at position 18. The local replay also confirmed no portrait, no lore, no Kilnkeeper art requests, an eight-card deck containing Kilnkeeper, and zero page errors. The count is right; the ordinal is not.

The guide also calls H1 a “presentation/integration review.” In the frozen plan, CARDS-019H1 is the shared homing integration (BUILDING), while CARDS-019I is Kilnkeeper presentation (TODO). Both are pending, but they are separate reviews and the guide should name them separately.

The checker was run from a clean archive of `236fbf505d16772075f06e683ac984cbece04a51`. It exited 0 with 2,338 stdout bytes and zero stderr bytes. Replay stdout SHA-256 is `a5192b09c5f8ac6b08de37b33169798b50921003c1349332401a82e32dc561f5`; it exactly matches both the committed receipt and the committed clean-archive log. All 18 local Markdown links resolve.

Independent checks confirmed the frozen map’s 109 rows, 18 editable IDs, 12 comparator candidates, preserved QUESTION scope, and zero historical executions/parity claims. I extracted source commit `151f54b7a40a266100522c7bdb3e3fca39b9918f` and independently reproduced catalog counts of 56 admitted IDs / 61 occurrences, 62 claimed IDs / 67 occurrences, and 5 QUESTION-only exports.

The reviewed CARDS-018I receipt has 19 editable IDs and an eight-card battle deck. The pinned candidate’s test source hashes to `a66f6d45e99d26b5fbddd2213be4836a4eb417002e432b4b3dfcd08d2e8e36ab`; its critic TAP is 1/1 passing. The builder and critic receipts share manifest SHA-256 `e77d65fdc327944306eb830a4dee921d17da68b06fe89d4475ef099e5ec84fc9`; the pinned test computes it from raw `release-manifest.json` bytes.

The six default-eight snapshots match for seeds 0 and 23 at ticks 0, 120, and 900. The 18,000-tick run is pinned to candidate `9f64011378d3ce1c6281d9292950a7b52f11fd2c`, uses the default eight-card deck, completes 67 segments, and records the 600→300→600 replay plus restart to tick 0. That commit predates Kilnkeeper source admission; 11 content/simulation files differ by public commit `dbd7afe4a8901b5b61c83ebc92137a5bd26e5451`, so the guide correctly limits endurance to the older candidate.

Release evidence matches: workflow `38501010696` succeeded on `main` at `dbd7afe4`; current HTTP checks returned 200 for both landing and game pages, and the live entry bundle still matches the recorded 33,264-byte SHA-256. Source, game, and product trees are unchanged from base `a1da57cfd2795e39a212f97821bb52e92c25f081`; the round-1 critic subtree is byte-identical. RELEASE-TEST round 1 remains recorded as FAIL, with the frozen round-2 successor passing 28/28 scoped guards and 5/5 Pages checks.

The task’s stated parent should be read with the candidate freeze: target commit `236fbf5` has actual parent `695f74f`, and candidate `695f74f` has parent `a1da57c`. The freeze metadata and tree hashes agree with that chain.
