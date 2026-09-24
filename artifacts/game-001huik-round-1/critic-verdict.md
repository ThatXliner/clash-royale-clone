PIECE: GAME-001HUIK — Nondefault troop witness in shipped browser
VERDICT: PASS
EVIDENCE:

Actual selector output:

```text
$ npm test -- game-browser-roster-witness
# Subtest: game browser roster witness: real page deploys, restores, and restarts Stonehauler
ok 1 - game browser roster witness: real page deploys, restores, and restarts Stonehauler
1..1
# tests 1
# pass 1
# fail 0
# duration_ms 17548.443792

$ npm test -- game-restart
# Subtest: game restart: terminal click atomically replaces the whole graph with exact seed zero
ok 1 - game restart: terminal click atomically replaces the whole graph with exact seed zero
# Subtest: game restart: hostile cleanup aggregates and cannot create split authority
ok 2 - game restart: hostile cleanup aggregates and cannot create split authority
# Subtest: game restart: shipped selector, dependency seam, and deterministic guards are exact
ok 3 - game restart: shipped selector, dependency seam, and deterministic guards are exact
1..3
# tests 3
# pass 3
# fail 0
# duration_ms 13781.096625

$ npm test -- game-browser-journey
# Subtest: game browser journey: real Chrome plays, fights, terminates, restarts, and repeats
ok 1 - game browser journey: real Chrome plays, fights, terminates, restarts, and repeats
1..1
# tests 1
# pass 1
# fail 0
# duration_ms 8724.465834
```

The test's captured browser evidence (`browser-witness-evidence.json`) records the active hand and input slots as `stonehauler (cost 5), skymaul (3), brassbolt (4), mossguard (3)`, matching the session's hand. Physical Stonehauler deployment produced a south-side `session-deployed` replay event at tick 0, spent exactly 5 elixir, and created one south Stonehauler in the shared battle. Its rendered marker has `artId: stonehauler` and 11 SVG paths. The browser snapshot restored byte-exactly; browser and GameSession continuation both replayed byte-identically. The session reached terminal at tick 6299, and the physical restart restored the full witness deck `stonehauler, coilblade, mossguard, copperskiff, skymaul, brassbolt, reedsting, briar-band`. Console and page errors were empty. The evidence asserts the estimated body-radius, delivery, and layer policies remain QUESTION.

The existing seed-zero Chrome run in `artifacts/game-001gp-browser-endurance/endurance-result.json` records tick 18000 terminal, exact seed-zero restart at tick 0, and zero console, page, or resource errors. The passing `game-restart` selector also asserts restart bytes equal a fresh `GameSession(createShippedGameSessionSetup(0))`.

Rendered Chrome capture inspected: [deployed Stonehauler](stonehauler-deployed.png).

EXECUTION NOTE (not evidence): I started an additional `npm test -- game-browser-endurance` run, then stopped the redundant rerun at the parent agent's direction before it produced a test summary. It exited with code 130 and is not used for this verdict.

BIGGEST GAP: Stonehauler's body-radius, delivery, and layer policies remain QUESTION, so exact post-deployment movement and combat behavior are still unverified.
