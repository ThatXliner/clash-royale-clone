# VIS-003E round 2 — terminal presentation tail

The terminal panel now settles over 24 fixed presentation ticks at 60 Hz after simulation stops. These UI ticks are separate from the authoritative match tick. Normal browser RAF schedules the tail; no CSS animation clock or simulation clock is added.

`terminal-timeline.json` records a real running browser transition at match tick 1590. The simulation remains at 1590 while the panel moves from scale 0.88 / 28px / opacity 0.45 to scale 1 / 0px / opacity 1. An instrumented GameSession records zero calls to stepMany after it becomes terminal.

`terminal-age-0/6/12/24.png` captures exact manual presentation ages. Every age is serialized/restored and the entire feedback DOM is compared byte for byte; the GameSession serialization remains identical across the UI tail. `terminal-reduced-motion.png` shows the immediately settled reduced-motion panel. Restart removes the panel and resets presentation age to zero.

Browser snapshot version 2 adds `terminalPresentation: { running, tick }`. Both normal and asynchronous restore use the same envelope validator. Version 1 remains readable: its terminal result is restored at settled age 24, preserving its former static appearance. Invalid or incoherent presentation state is rejected. No field is hidden in simulation or input data.

Manual API: stop the scheduler with `enterManualStepMode()`, then call `advanceTerminalPresentation(count = 1)` with an integer delta from 0 to 24. The resulting age is capped at 24 and exposed as `state.terminalPresentationTick`. `start()` resumes an unfinished terminal tail. Settling, restart and disposal leave no stale terminal callback.

Verification commands:

- `node --test tests/visual-terminal-motion-browser.test.js`
- `node --test tests/game-browser-loop.test.js`
- `node --test tests/game-restart.test.js`

`npm test -- visual-motion-polish` also includes the terminal browser timeline alongside the round 1 lifecycle tests.
