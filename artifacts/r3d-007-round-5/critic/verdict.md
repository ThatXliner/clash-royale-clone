# R3D-007 round 5: critic verdict, PASS

Candidate 2a6768b2 compared with main 9dadf3a0 (a git worktree of main HEAD). Playwright Chromium (ANGLE Metal) on python static
servers. Harnesses: the round-3 critic tools plus the round-4 critic's rt.mjs/rtan.mjs, and a new flyoff.mjs (drawn vs
sim offset using the exact boardToWorld mapping).

## Tests (tests/*.txt; each run alone, all exit 0)
- battlefield-units: tests 19, pass 19, fail 0
- unit-models: tests 15, pass 15, fail 0
- game-ui-projection: tests 39, pass 38, fail 0, skipped 1 (`ok 33 ... # SKIP set ART004_PARENT_ROOT to the accepted 5ed checkout`)
- nondeterminism-guard: 10/10. shipping-isolation-guard: 13/13. game-browser-journey: 1/1.
- Ran `git checkout -- artifacts` afterwards; the journey had rewritten artifacts/game-001g-round-1/*.

## Console / page errors
None in any run: live 390x844@3 (60 s, 39 deploys, max 36 live), live 1280x800@2 (45 s), real-time fight x4, shot
probe x4, scripted frames x2, rubble, cold x3, perf x4.

## Held drift and shot impact (my runs, 2 per build)
Real-time west-bridge fight, t7700 + 6 s. Windows where the sim spot is unchanged for at least 0.4 s:

| build | drawn range med / p90 / max (tiles) | speed med / p90 (tiles/s) | windows > 0.3 |
|---|---|---|---|
| cand run 1 | 0.17 / 0.49 / 0.91 | 0.14 / 0.44 | 15 |
| cand run 2 | 0.20 / 0.53 / 0.91 | 0.17 / 0.56 | 15 |
| main run 1 | 0.13 / 0.47 / 1.15 | 0.14 / 0.85 | 10 |
| main run 2 | 0.15 / 0.39 / 0.81 | 0.20 / 0.75 | 9 |

The worst candidate window, cinderling n:124, is a single glide. The unit is drawn still for 0.6 s, then moves 0.9 tiles
along the lane toward its own sim spot over about 0.7 s, then stops and dies in place. It does not slosh back and forth
(round 4: 2.58-tile wander). Main's worst windows are flyer hover sways of the same size. In the frames this reads as
one shuffle inside a melee, which a player would not notice.

Scripted fight t7200-8880, measured with r3probe and r3analyze:
- Shot launch vs drawn shooter: cand 0.00 (all 43 shots); main 0.45.
- Shot landing vs drawn target at impact, med / p90 / max: cand 0.00 / 0.07 / 0.74 and 0.00 / 0.07 / 0.32, with 0/79 over
  0.75 in both runs. Main: 0.11 / 0.45 / 0.79 in both runs, with 1/79 over 0.75.
- Held 60-tick windows, range p90 / max: cand 0.15 / 0.77 and 0.16 / 0.76; main 0.44 / 0.95 in both runs.

## Flyer offset (the 1.2-tile dip reach)
- Air drawn vs sim: cand med 0.45-0.47, p90 1.12-1.13, max 1.20 (probe); main med 0.17, p90/max 0.45. In real time the
  candidate peaks at 2.0 for gloamwing n:145, which adds the dip to the hover sway main already has (main peaks at 1.29).
- Is this visible? No. Every projectile is drawn from the drawn shooter to the drawn target, and lands on the drawn body
  (see above), so a flyer is attacked and struck where it is drawn. In the t7860-7940 strip, the dipped flyers sit over
  the river at the deck edges, right next to the fight, which is plausible for a flyer. Nothing on screen points at the
  sim spot.
- Residual risk: a player who aims an area spell at a flyer drawn 1.2 tiles off its sim spot aims 1.2 tiles wrong. This
  matters only at the edge of a spell radius. This deck has no spells, so I could not observe it.

## Bar items
- Side shown in every pose at 390x844: met. The live 390 view and the west-bridge crops show teal bodies with teal rings
  and red bodies with red rings, including in the stacked block.
- Bridge crowds spread: met. westbridge-t7860-7940-cand-top-main-bottom.jpg: the candidate shows about 5 separate cinderling
  bodies on the deck with flyers stepped aside, and the red side stays visible. Main is one fused teal pile at the north
  mouth with wings stacked on it.
- No unit inside rubble: met. rubble-sw-ruin-cand.jpg: swarms deployed tight around the SW ruin (west, east, south, NE)
  stay outside the ring, and flyers pass above it.
- Cold first battle: met. cold-cand-top-main-bottom.jpg: the candidate goes from dark field to "Preparing the battlefield"
  to 3D (interactive at 1101 and 1305 ms). Main HEAD flashes the flat tan 2D arena, then the painted 2D arena, then 3D
  (1350 ms). No long tasks after interactive.
- Blind A/B: candidate preferred in 3/3 pairs, each clearly (ab/blind-judgment.txt was written before unsealing; coin flips
  were tails, heads, heads). Crop framing differs between builds, so identity may leak.

## Frame time (5 s of a live match, rAF interval in the battle iframe)
- cand 390x844@3: median 16.9 ms, p95 25.4, max 33.3. cand 1280x800@2: 17.5 / 25.6.
- main 390x844@3: median 17.6, p95 25.3. main 1280x800@2: 24.6 / 25.6.
- Render CPU is 0.8 ms median on both builds. A player would see no difference.

## Merge note
Branch worktree-agent-ac255712407109cf4 is based on a5824230, behind main 9dadf3a0 (REL-002, UX-001, newer battle HUD).
The round's change touches only units-layer.js and its test, so rebase onto main before landing; do not merge the stale
base, because `git diff main` deletes tests/release-002.test.js among others.

## Biggest gap
A dipping flyer can be drawn up to 1.2 tiles (2.0 with hover) from its sim spot, so an area spell aimed at what the
player sees can miss at the edge. Shrink FLYER_DIP_REACH or show the area spell's hit preview against sim positions.
