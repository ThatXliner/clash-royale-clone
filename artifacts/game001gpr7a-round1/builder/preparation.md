# GPR7A accepted-source preparation

Candidate: `ff1025e145cbff421d624ed7d3e59b5ab5671f14` (tree `3b22af3d20da35bf529da9580b9d95e3213ba9fa`) in clean private clone `/private/tmp/gpr7a-accepted-ff1025`.

This is a source and environment freeze for a fresh critic. It does not claim that the candidate compiled, passed an endurance run, or met browser performance bounds. No build, browser run, simulation, or benchmark was started in this preparation step.

The complete tracked source and asset hash walk is in [source-cut-manifest.json](source-cut-manifest.json): 148 tracked `src/**` files, 26 tracked `public/**` files (24 beneath `public/assets/**`), and 352 tracked `tests/**` files. The exact browser harness and package lock are separately identified there. Canonical default and Kilnkeeper setup bytes are preserved and hashed in [canonical-setup-manifest.json](canonical-setup-manifest.json). The selectable catalog is 20 choices (18 troop choices and 2 additional mixed-deck choices); default setup is the seed-zero shipped eight, and the expanded setup uses `coilblade, mossguard, copperskiff, kilnkeeper, brassbolt, reedsting, briar-band, cinderlings`.

The environment is recorded in [environment-manifest.json](environment-manifest.json). It uses Node v22.22.3, npm 10.9.8, Playwright 1.58.2, and Google Chrome 155.0.8059.40. The local copied dependency tree matches every non-optional package entry in `package-lock.json`; no package install was run.

The browser harness serves native source modules from the repository root, including `/src/sim/game-session.js`, `/src/ui/game-browser-entry.js`, `/src/audio/game-audio-runtime.js`, and `/src/ui/arena-shell.css`. It does not consume a compiled release or Pages bundle. The scope and unchanged caps are in [source-host-scope.json](source-host-scope.json).

Use the commands in [run-commands.txt](run-commands.txt) unchanged. They keep the full default 18,000 tick bound and the Kilnkeeper scenario’s natural-terminal condition, and write results only beneath this private clone’s `artifacts/game001gpr7a-round1/critic/**`. The old GPR7 prep at candidate 88 is historical and does not establish current-source qualification.
