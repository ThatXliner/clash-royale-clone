# CARDS-016T round 2 builder evidence

Runtime candidate under test: `09b0f9c741f4f2860785b18ab7b82002fd623426` (unchanged in this test-only round).

The prior independent review found one stale assertion in the ordinary-roster suite: Coppershade's `LiveBattle` state exposed one active member after the first deployment boundary, while the test expected all six. The runtime behavior is the intended staggered birth behavior. This round updates only `tests/game-roster-troops-ordinary.test.js` and this evidence directory; no simulation source changed.

For Gloamwing and Coppershade, the test asserts the exact source receipt (100 ms, six simulation ticks), one active member at the first appearance, and the expected unit count after each subsequent tick through the fifth/sixth member. Direct `LiveBattle` spawn events must occur exactly at ticks 6, 12, 18, 24, and, for Coppershade, 30. The `GameSession` public unit state is checked at every intervening tick as well. Other ordinary cards retain their prior immediate full materialization assertions.

## Verification

- `node --test tests/game-roster-troops-ordinary.test.js` — **16/16 passed**.
- `node --test tests/cards016-stagger.test.js tests/game-roster-troops-air-swarms.test.js tests/cards016-integration.test.js` — **16/16 passed**, retaining exact schedule restore, source QUESTION closure, spend/cycle, AI, air contact, projectile, and RL coverage.
- `git diff --check -- tests/game-roster-troops-ordinary.test.js` — passed.

Raw TAP output is preserved in `ordinary-roster.tap` and `stagger-air-integration.tap`.
