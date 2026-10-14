# FRAME-LAYOUT-001 builder freeze

Accepted private base: `095a8c55a6721c74f7555939a9ce21182bec3f2a`.

The candidate changes only `src/ui/app-shell.js` and `tests/app-shell-layout.test.js`. The source fence and ownership exclusions are recorded in `evidence-index.json`. The source observes the real battle slot with `ResizeObserver`; each layout uses the measured content box after subtracting its computed border insets. CSS and game rendering sources are unchanged.

Frozen source SHA-256: `12f566f0a7e417ff3260aee097bd11b94e28636b68f7226b6f81652194bf710e`.
Focused regression SHA-256: `40415b855a838c2597477f180bd56533d69e7bb5586492e6e580b911dcbedc53`.

The failing baseline evidence is preserved without alteration: run 1 and run 2 raw TAP; run 3's numeric observation receipt (the original raw TAP was unavailable); run 4 raw TAP and its seven-sample geometry trace. Run 4's Deck selector ambiguity was fixed by scoping to `.app-nav`; its transition trace remains separately frozen. Run 5 is the bounded natural-RAF regression result, with full TAP and all twelve finite geometry samples saved before final assertions and cleanup.

Run 5 command: `node --test tests/app-shell-layout.test.js`.
Result: exit 0; 1 test passed, 0 failed. Desktop Battle, phone Battle after desktop resize, desktop Battle after hidden-slot resize, and phone Battle after returning from Deck all reached an actual measured content-box fit. On the phone transition, the trace captured stale matrices before ResizeObserver's relayout and the settled scale `0.514844` at sample 7. No sleeps, forced resize events, synthetic CSS, GPU flags, or screenshot paint changes were used. The test retains the standard eight-card deck and the child iframe's fixed 720×1280 coordinate space.

This freeze is for independent blind critique. It does not record a critic verdict.
