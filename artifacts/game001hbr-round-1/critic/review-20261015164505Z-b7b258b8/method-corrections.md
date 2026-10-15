# Preserved method corrections

These were harness or invocation corrections, not product-code failures. Raw commands, stdout, stderr, and direct exits are retained.

1. `npm run test:game-roster-buildings` exited 1 because the package script is absent. The exact wired invocation `node tests/game-roster-buildings-runner.js game-roster-buildings` then passed 11/11.
2. The first independent legacy harness checked for a structure before the first host step had materialized it. Its output is retained as `legacy-compare-first.*` and is not used as evidence for combat death. The corrected harness steps 481 ticks, asserts a real legal opposing Mossguard death and no v2 payout in the v1 profile, then exits 0 with every parent/candidate sample equal.
3. The first JSON summary extractor assumed event-list comparisons had a tick field and exited 1. The corrected comparison JSON and summary are retained separately.
4. A first kernel path guess, `src/sim/fixed-step-kernel.js`, does not exist. The corrected source is `src/sim/battle-continuation-kernel.js`, whose size/hash are recorded in the verdict and command logs.
5. Comparing sibling source commits c72 and 59 directly returns a nonempty HBR delta. The corrected ancestry fences are recorded in `sourcegraph.md`; c72 equals 7ef in `src/`, and c1 equals 59 in `src/`.
