# Post-run receipt

- Clean current-main snapshot: 627 source files; pinned source manifest SHA-256 `11621e8ec35ff66d473048f212d2f803b150d83e143a815f9338c5dfa7bbb34f` verified unchanged after the run.
- Root checkout remained untouched: `HEAD` `fd6b2af97294be762af637a1d8a40c3af18452cf`; index SHA-256 remained `8e79bb09cef07999afb8d2c991c3f1a9b5562528a82d74eef865a39582def914`.
- One default full run only; direct exit code 0; TAP 3/3 passed. Natural South 2–1 terminal at tick 18,000; server exited; run session 17484 completed and the parent confirmed all associated processes closed.
- 67 segments over 970,219 ms; longest segment 10,374 ms. Initialization long-task max 186 ms; non-initial categories max 0 ms; max `sessionStepSlice` 28 ms; restore simulation slice 6.5 ms. All are within the unchanged 300 ms initialization, 50 ms non-initial, 40 ms slice, 30 s segment, and 1,200 s total limits. No environment audits were triggered.
- Restore, deterministic continuation, physical input/audio delivery, exact tick-18,000 terminal, restart-at-tick-zero, and zero-active-voice disposal assertions passed. Console/resource/unhandled errors and pending resources were empty.
- Raw stdout/stderr, TAP, JSON, screenshots, command, environment allowlist, direct exit receipt, and source fence are preserved in this directory. The pre-existing `EVIDENCE-SHA256SUMS.txt` covers the ten runtime files present when generated; this post-run receipt is intentionally not added to that manifest per the parent's instruction to stop bulk hashing.
