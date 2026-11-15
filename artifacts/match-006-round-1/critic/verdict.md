# MATCH-006 round 1: critic verdict

Candidate: 2bf6a6a6 (worktree-agent-af84eb19df15dc8fe). Baseline: main 3ca9be33 (its src is identical to the candidate's base, 92e21997).

**VERDICT: PASS**

## Browser play (Playwright Chromium, 3D renderer, shipped app via public/index.html)

- **390×844 touch** (hasTouch, isMobile, touchscreen taps). I swapped Ember Basin and Buried Coil into the deck through the real Deck editor, then pushed the east lane with real card and arena taps, using `fastForwardSegment` between them. The north east tower fell at tick 4599.
  - Selecting a unit lit the east pocket (`data-open-lanes="east"`).
  - A Briar Band tap at (14581, 20537) deployed. A Buried Coil tap materialized a `structure-materialized` event at (12551, 21545), inside the pocket.
  - Taps on the west pocket (3500, 20000), deeper ground (14500, 27000) and the king front (9000, 24500) were all refused. Elixir stayed 3→3 and there were no deploy events.
- **1280×800 mouse**, default deck, west lane. The north west tower fell at tick 1180.
  - The west pocket lit, and a Mossguard dropped at (3418, 20537).
  - The east pocket, deeper ground and the king front were refused with no elixir spent.
- **Before any fall:** a tap at (bridge x, 20000) was refused (elixir 10→10). Spell selection shows no zone.
- Console and page errors: 0 in every candidate run, and 0 on main.
- **Visuals:**
  - Main shows no placement zone at all.
  - The candidate hatches the whole rival half in muted red diagonal stripes while a ground card is selected. This is the familiar genre "can't drop here" cue: readable, consistent with the palette, and no worse than a tint over rival towers and units, whose HP badges stay legible.
  - The open pocket is a light green fill with a dashed outline and reads clearly at phone size.
  - I judge the hatch an improvement over main, not a regression. See `main-390-no-zone.jpg` and `cand-390-hatch-before-fall.jpg`.
- **AI:** after the AI took my west tower (tick 5869), it dropped Briar Band at (3500, 14000), just past the river on my side, at tick 6060, then Skymaul at the same point. To a player this reads as normal bridge pressure, and it is sensible. It is conservative: the AI only ever uses one anchor a tile past the river, never a deeper part of the pocket.

## Determinism

Hashes are in the two JSON files in this directory.

- **Main vs candidate, byte-identical:**
  - GameSession wait-only seeds 1–4, compared at tick 600 and at the tick of the first tower fall (1503, 699, 643, 651).
  - Scripted south deploys on own half, seeds 1 and 3, through tick 1530.
  - RL wait-only seed 2 up to the first fall.
  - RL with Ember Basin and Aether Well in the deck: a non-batch structure path, 7 commands, no fall through tick 2730.
- **Two-fall matches on the candidate:**
  - Scripted east push, seed 1: north:lane:east fell at 604, south:lane:west at 3611, 11 south pocket drops and 1 north pocket drop. The match is identical across two runs and across chunk sizes 30, 1 and 7, and restore round-trips.
  - Wait-only seed 2: falls at 698 and 2943, 3 north pocket drops. The match is identical across chunk sizes 600, 1, 97 and 600 again.
- **Golden change** (rl-environment seed 2 terminal 4838→4899): this is legitimate. Behaviour is byte-identical to main through the first fall at 698. The terminal moved only because the AI now plays its pocket after that fall, which is exactly what the bar asks for.

## Mirror (RL API, two-sided, seed 1)

- South fell north east at 574 while north fell south west at 3611. I checked the south mask against `evaluateDeployment` on 13,824 tiles and found 0 mismatches.
- With east open, the mask allows the east pocket and blocks the west pocket and deeper east ground.
- North pocket drops were Skymaul and Briar Band at (3500, 14000), both after south west fell. There were no illegal north placements.
- I did not exercise the north east pocket through the AI. The shipped AI only ever offers west-bridge points, and a GameSession run cannot fell south east except by north waiting it out. That pocket is covered at LiveBattle level by the `north/east` pocket test.

## Tests

`node scripts/test-portable.js -- node tests/content-schema-runner.js <s>`, run one suite at a time:

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| pocket-deployment | 10 | 10 | 0 |
| deployment | 12 | 12 | 0 |
| game-session | 11 | 11 | 0 |
| game-opponent | 14 | 13 | 0 (1 pre-existing SKIP: GAME-001HC) |
| rl-environment | 17 | 17 | 0 |
| nondeterminism-guard | 10 | 10 | 0 |
| ui-input | 18 | 18 | 0 |
| ui-placement-feedback | 14 | 14 | 0 |
| shipping-isolation-guard | 13 | 13 | 0 |
| game-browser-journey | 1 | 1 | 0 |

## Diff review

- No wall-clock or rendering input reaches the sim. The UI only reads `state.battle.towers` and `getDeploymentPolicy()`. Legality stays with `evaluateDeployment` in the sim.
- **Behaviour before any fall:**
  - Pocket offers are empty with no open lane, so the AI's candidate list and RNG draw are unchanged.
  - Route and receipt records omit the lane key when no pocket is open.
  - The extra `flushBattleTo` and `stepMany` on think ticks are chunk-neutral, which the identical hashes confirm.
- The candidate merges cleanly onto current main.

## Gaps (non-blocking)

- The pocket rectangle stops at the felled tower's front face (y = 23000), so a hatched strip remains between the lit pocket and the rubble. Genre players will expect to be able to drop on or just behind the fallen tower. The bar pins the existing sim rule, so this is not a failure.
- The AI only uses one fixed anchor per lane, just past the river.
