PIECE: FRAME-NOTICE-001
VERDICT: PASS

EVIDENCE:

- Exact candidate `98538d564d4607b5e38f303d139591c1081889dd` has only the permitted source, focused-test, and builder-receipt changes; the source-fence file hashes match both owned source files. See `candidate-identity.json`, `candidate-source-test.diff`, and `source-scope-pre-post-fence.txt`.
- Independent `node --test tests/game-browser-policy-notice.test.js` on Chrome 155 passed. The recorded evidence has 71 checks, zero failed, and no console or page errors. It verifies canonical notice text/card ID/disposition/unverified fields, default-roster clearing, forged-authority rejection with unchanged browser bytes, same-deck restart, and exact native PNG restoration. See `candidate-focused.tap` and `candidate-independent/notice-journey-evidence.json`.
- Independent positive-tick probe used deterministic seed-zero Ember Basin and default-eight sessions with 600 transcript ticks each. The yielding restore path reported policy `raf-scheduler-yield-raf` and 1,206 observed RAF/scheduler yields for each roster. All 26 checks passed. Ember sync and yielding restores matched exact session, browser snapshot, input bridge, audio continuation, and canonical notice fields. Default-eight sync and yielding restores matched the same exact continuation bytes and left the notice hidden with text and data fields cleared. Each sync/yield PNG pair matched byte-for-byte. See `positive-tick-final/evidence.json` and its four PNGs.
- Negative control on the untouched parent entry failed the expected three canonical-notice assertions: stale Buried Coil notice remained after Ember Basin sync restore, Ember Basin yielding restore, and default-eight sync restore. See `negative-control-baseline.tap` and `negative-control/notice-journey-evidence.json`.
- The browser test's ordinary deterministic terminal witness ended at tick 3818 with North winning after destroying the center tower. The same-deck restart returned to the seed-zero eight-card setup and preserved the notice. This is a headless simulation terminal witness, not a claim of a full-browser natural journey or an 18,000-tick endurance run.

BIGGEST GAP: At the captured 390×844 phone viewport, the visible notice banner is clipped at the right edge; its DOM text is exact, but the PNG does not establish that the whole notice is readable, and this run does not establish the clipping cause.

No I470 same-roster pixel or iframe root cause was established by this round.
