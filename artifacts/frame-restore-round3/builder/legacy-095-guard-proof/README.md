The direct Node proof ran against pristine accepted 095 without a browser:

`node /private/tmp/frame-restore-round3-checkbase/tests/frame-restore-001-095-node-guard-proof.mjs`

Its runner is archived at `../probes/legacy-095-node-guard-proof.mjs`; the executed copy was in the clean 095 checkout because its imports are checkout-relative. The JSON records the output and source hashes.

The input-point mapping uses the actual `clientPointToArenaPoint` function with the canonical phone fixture rectangle at (90,108), 540×960, and center/.54 click. It maps to (9000,14719), selected slot 1, command id 1. The authentic `GameSession` emits a Briar Runner melee attack at tick 170 and renders session state at tick 171.

The actual UI projector and combat-motion derivation report `spriteAction=walk` and motion pose `attack` at tick 171. At tick 173 they report `walk` and `idle`; the unit is winding with `nextAttackTick - nextTick = 40`, outside the motion anticipation window, and has retargeted to a live unit. The accepted source has no `data-attack-animation-age` field. This is guard calibration only; it contains no browser screenshot or raster comparison.
