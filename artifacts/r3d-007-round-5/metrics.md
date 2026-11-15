# R3D-007 round 5: builder metrics (not a verdict)

Candidate: round-5 working tree on 3f06eebb. Main: a5824230 (git archive, same node_modules).
Python static servers, Playwright Chromium (ANGLE Metal), 390x844@3. Harnesses are the round-4
critic's: `rt.mjs` + `rtan.mjs` (real-time west-bridge fight, plan-m deploys stepped to t7700, then
6 s of real-time play, sim vs drawn sampled on every rAF), `r3probe.mjs --mode=script --plan=plan-m.json
--noshot --fineFrom=7200 --chunk=2 --wait=33` + `r3analyze.mjs` (shot landing, held 60-tick windows).
No console or page errors in any run.

## Held units, real-time west-bridge fight (rtan.mjs; windows with an unchanged sim spot >= 0.4 s)

| build | runs | drawn range med | p90 | max | speed med (tiles/s) | speed p90 |
|---|---|---|---|---|---|---|
| round 4 (critic) | 1 | 0.44 | 1.82 | 2.58 | 0.71 | 1.58 |
| round 5 | 3 | 0.17-0.21 | 0.46-0.52 | 0.87-0.91 | 0.15-0.17 | 0.47-0.53 |
| main (same machine, interleaved) | 3 | 0.17-0.19 | 0.34-0.46 | 0.64-0.93 | 0.14-0.19 | 0.68-0.78 |
| main (round-4 critic) | 1 | 0.19 | 0.56 | 1.21 | 0.21 | 0.87 |

Cinderling n:133 (round 4: 2.58-tile range over its ~4.2 s hold) now draws a 0.26-0.27-tile range
over the same hold in all three runs.

## Scripted fight, t7200-8880 (r3analyze.mjs)

| metric | round 4 (critic) | round 5 | main (this machine) |
|---|---|---|---|
| shot lands vs drawn target at impact, med / p90 / max (tiles) | 0.50 / 0.91 / 1.58 | 0.00 / 0.07 / 0.36 | 0.11 / 0.45 / 0.79 |
| shots landing > 0.75 tiles from the drawn body | 16 / 70 | 0 / 79 | 1 / 79 |
| held 60-tick windows, drawn range med / p90 / max | 0.63 / 1.63 / 2.13 | 0.00 / 0.18 / 0.76 | 0.04 / 0.44 / 0.95 |
| close links, drawn minus sim gap, med / max | 0.23 / 0.61 | 0.19 / 0.57 | -0.05 / 0.90 |

## t7860 west bridge, 390x844

`t7860-westbridge-cand-left-main-right.png` (candidate left, main right; same crop box, framing
differs between builds) and `t7860-westbridge-cand-zoom.png`. Five south cinderlings drawn as
separate bodies on the deck (closest pair 0.37 tiles apart, drawn), flyers stepped off to the sides.

## Tests (scripts/test-portable.js -> tests/content-schema-runner.js)

- battlefield-units 19/19 (new: a held deck swarm stays within 0.05 tiles while a flyer sweeps
  over, a foe walks up and a member dies; fails on round 4 with 0.585 tiles)
- unit-models 15/15
- game-ui-projection 38/39, 1 skipped (ART004_PARENT_ROOT)
- nondeterminism-guard 10/10
