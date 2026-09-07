# VIS-003E round 1 — deterministic lifecycle presentation

Run `npm test -- visual-motion-polish` for Node invariance checks and the Chrome timeline.

- `session-0/12/24/435/438.png`: authentic default-roster session opening, deployment, attack and recoil. The browser test restores each exact frame and compares all four rendered layer DOM byte strings.
- `card-arrival.png`, `card-settled.png`: actual pointer card selection/deployment, with the replacement card arriving in its vacated slot over 18 simulation ticks and an elixir spend emphasis. Fractional regeneration uses the canonical accumulator.
- `tower-11/22/70.png`: **isolated MatchClock fixture** in the production shell. An accepted north-west tower destruction at tick 10 drives collapsing masonry, crown credit and permanent rubble. This fixture does not alter the running GameSession; it replaces only the standalone feedback layer to isolate the effect's timing. Canonical feedback hides both underlying shell tower art and its health marker.
- `reduced-motion.png`: the same rubble fixture with Chrome's reduced-motion preference. Moving transforms are removed while the outcome remains visible.
- `terminal.png`: the actual session's terminal result. The simulation freezes at its terminal tick, so this is a static terminal impact frame, not a wall-clock animation after the match.
- `restart.png`: actual restart control lifecycle, returning to fresh tick 0 with towers restored. The opening settle repeats over ticks 0–24.

`timeline.json` records observed poses, exact restore comparisons, tower bounds and reduced-motion output. No UI code reads the raw GameSession replay. The HUD uses the producer's bounded latest accepted card receipt; combat uses the admitted closed effect feed; destruction uses canonical match feedback.

All artwork remains original Rivermark primitives. Existing projectile, deploy, gait, anticipation and death motion are retained. New recoil and hit flash use the existing canonical combat cycle/damage ticks. Post-terminal motion cannot advance without a separate presentation-time contract; no such clock was added.
