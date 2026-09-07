# VIS-003G independent visual critique, round 1

Verdict: PASS on the captured visual journey dimension. GAME-001GP sustained performance remains pending; this is not an overall VIS-003G dependency clearance.

Fresh command: `npm test -- game-presentation-journey`

```text
ok 1 - production presentation: original art and trusted controls through an authentic match
# tests 1
# pass 1
# fail 0
# duration_ms 45934.955791
```

Inspected all twelve 720 × 1280 captures: standard opening, selection, legal deployment, bridge frame, projectile, impact, destruction, terminal ages 0/6/12/24, and restart. The original unit silhouettes, tower forms, card faces, cost badges and health bars are visible. Selection has a gold outline; deployment changes the hand and elixir; projectile and bridge impact have distinct visible cues; destroyed towers become rubble with crown awards; the results panel progresses to a readable opaque state and restart clears the result and battlefield. No debug links, debug lines, placeholder unit circles, clipped primary controls, obstructed card names, or broken asset states were found. The narrow next-card label wraps but remains readable. The early translucent results frames are an intentional short transition, with legibility established at age 24.

Fresh evidence.json reports errors=[], zero debugLines in every frame, standard projectile at tick 622, impact at tick 80, destruction at 819, terminal at 1590, and restart at 0. The command verifies unchanged session bytes across terminal presentation ages and exact fresh standard-session bytes after restart.

Biggest evidence gap: the dedicated 03-bridge-combat frame at tick 107 captures traversal in opposite lanes, not contact; its predicate only requires a nearby unit and some targetId. The separate 05-impact frame does show a combat impact directly on the left bridge, so the captured set covers a bridge combat cue. A dedicated contact frame would make that evidence less ambiguous but is not a demonstrated visual defect.

The standard opening/effect segment and documented public live-seed-2-terminal profile are distinct. The bounded profile uses 10,000-tick tower initial windups and north Coilblade only; it proves the rendered terminal sequence, not full standard balance or sustained throughput. Reference SOURCES.md flags geometry and timing uncertainties, and footage/NEEDED.md contains no licensed gameplay capture. No captured parity claim is made.
