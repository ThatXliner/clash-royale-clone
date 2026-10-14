# FRAME-RESTORE-001 final production-CSS matrix

This is the builder's bounded runtime matrix for immutable candidate source commit `f2f55b820bf5ec8fdec279084e8db33e10c881fc`, based on accepted production commit `9f305bb01d0b3c515cfc80f857a303218a1d1acb`. The matrix injects no CSS and changes no geometry. Its runner requires the exact candidate HEAD and records a before/after SHA-256 fence for every tracked file under `src/` and `public/`, the five owned source/test files, and `package-lock.json`.

Runner: `artifacts/frame-restore-round3/builder/probes/final-production-matrix-9f.mjs`  
Runner SHA-256: `84de9ff792487e76cf4349d7c86361a7f64a298c9639381e4151682e96029a2a`  
Actual command (run with `FRAME_RESTORE_ROOT` pointing at the exact `f2f55b8` source checkout if this receipt is viewed from a later artifact-only child commit):

```sh
FRAME_RESTORE_OUTPUT=/private/tmp/frame-restore-round3-final/artifacts/frame-restore-round3/builder/final-production-matrix-9f-run-2 \
FRAME_RESTORE_ROOT=/private/tmp/frame-restore-round3-final \
node artifacts/frame-restore-round3/builder/probes/final-production-matrix-9f.mjs
```

The runner ran as PID `79416` (exec session `25089`) on Node `v22.22.3`, Playwright `1.58.2`, and Chrome `155.0.8059.40`. It exited `0`; both browser contexts and the static server closed. `runner-output.txt`, `runner-exit.json`, `matrix-evidence.json`, both context JSON files, and all eight unmodified full-viewport PNG captures are retained here. The two unit-suite commands were `node artifacts/frame-restore-round3/builder/run-ui-suite.mjs projection` and `node artifacts/frame-restore-round3/builder/run-ui-suite.mjs loop`; their raw receipts are retained in their suite folders.

Both the phone (`390×844`) and desktop (`1440×933`) contexts passed normal and late-reduced restore comparisons with exact PNG bytes and zero decoded-pixel differences. The naturally measured phone frame was `(x=9.65625, y=117, 370.6875×659)`; desktop was `(x=506.484375, y=154.875, 427.0078125×759.125)`. Each context completed the attack/contact checkpoint at tick `171`, changed to tick `173`, advanced through `179`, and restored `171`; then late reduced motion restored `171`, advanced to `173`, verified `stepMany(0)` was legal and byte-identical, and restored `174` back to `173`. Session bytes, browser snapshot, controller state, input DOM, typed audio continuation/policy, resource/font state, marker geometry, and app/frame/HUD geometry were exact across each relevant restore pair. No page or console errors or missing resources were recorded.

The full projection suite passed `36/36` and the full browser-loop suite passed `17/17`; their TAP, stderr, PID, and exit receipts are adjacent in `projection-suite/` and `loop-suite/`.

An initial runner attempt is preserved separately in `../final-production-matrix-9f/`. It stopped during setup before taking any restore-pair screenshot because a browser callback referenced a Node-only helper. The runner fix was limited to the artifact probe; that failed attempt is not part of the matrix result.

This is builder evidence for the frozen candidate. It does not claim independent acceptance or the full 18,000-step qualification; those remain for the fresh critic.
