PIECE: GAME-001GPR6 browser endurance, round 1, frozen candidate `9f64011378d3ce1c6281d9292950a7b52f11fd2c`

VERDICT: PASS

EVIDENCE: `env -u GAME_BROWSER_ENDURANCE_TICKS npm run test:game-browser-endurance` exited 0 in the clean archive; TAP reports 2/2 passing, with the full Chrome test at 997,382.6 ms. It ran 67 segments through tick 18,000 on the seed-zero eight-card setup (`306bb30d…aec8`). Restore rewound 600→300 and the passing browser test asserted exact browser/direct session, E2 bridge, projected-layer, and audio-continuation replay through tick 600, plus a post-restore physical E2 delivery. The run terminated at 18,000 and restart returned session/audio tick to 0. Long-task maxima were 158 ms during initialization (300 ms cap) and 0 ms for measured drive, restore, terminal, restart, screenshot, and final-drain intervals (50 ms cap). Console, resource, unhandled, and pending-resource lists were empty. All 144 `src/` hashes and six endurance runtime/harness hashes matched before and after; all 3,003 tracked candidate blobs matched before launch. Fresh result/screens and raw TAP are stored beside this verdict.

BIGGEST GAP: The pause/resume check does not demonstrate byte stability across the lifecycle boundary: it compares browser and direct sessions after both calls, while the tick-18,000 serialized transcript still contains one `pause` and one `resume` record.
