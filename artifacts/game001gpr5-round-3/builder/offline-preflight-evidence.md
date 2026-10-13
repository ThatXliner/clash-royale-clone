# GAME-001GPR5 frozen offline preflight

The single-pass preflight ran from a clean `git archive` of candidate commit `5ba4002e9f71830da447be1e985505c608d9c06f`. Before execution, all 144 tracked files under `src/` in the archive were checked against their Git blob IDs at that commit. The command was:

```sh
node artifacts/game001gpr5-round-3/builder/offline-preflight.mjs
```

The runner used the reviewed setup bytes (`306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`) and reached tick 18,000. It generated 40 decisions, including six state-aware overtime emergency counters, and matched the committed aggregate candidate's decision tuples and outcome. The result was a South win, 2–1 crowns, decided by `tiebreak_lowest_hp` at tick 18,000.

At the terminal state, the North towers had 1,182 HP at central, 177 HP at east, and 0 HP at west. The South towers had 4,824 HP at central, 289 HP at east, and 0 HP at west. Thus the recorded state shows only the west lane tower destroyed for each side; the North east tower remained at 177 HP. Earlier aggregate-defense diagnosis prose claiming both North lane towers were destroyed conflicts with the recorded state. This preflight follows the state and result recorded by `GameSession` and the aggregate result JSON.

The 13,352-tick natural-terminal regression in `tests/endurance-workload.test.js` records the baseline workload before integration. It is separate from this integrated policy run, which completed the full 18,000-tick requirement.

Machine-readable outcome and generated decisions are in `offline-preflight.json` and `offline-preflight-decisions.json`. The frozen helper SHA-256 is `e8b1615ab14c90c718c2e2b92cc3e1cf8f30600597520d088eb0e0571499aa31`; the runner SHA-256 is `11c241b6c717f266420f9aff16a271936e1db699bd61582b89aba77d54bc1c95`. The outcome JSON records decision hash `f9b549909751680e6e1a6f1e19990378bf444d94c8abb15ca20031fc881cc011`, final session hash `f425adb482132c05256fc3f2edda6035958b729e89908f676bbc5fe70d454b17`, and aggregate-result SHA-256 `19805b0fd7bb3043e8de47f144990642611bbb6b8a3cab31ccde50e64d21392e`.

The obsolete shared-worktree preflight is recorded separately as `CANCELLED` in `obsolete-shared-preflight-cancellation.json`; its SIGTERM TAP output is preserved there and provides no verdict on the frozen candidate.
