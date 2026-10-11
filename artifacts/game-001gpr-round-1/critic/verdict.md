# GAME-001GPR round 1 critic result

PIECE: GAME-001GPR — sustained browser-match responsiveness
VERDICT: FAIL

The frozen source was extracted with `git archive 9e667a18ff35b6411ed73165150158471f128256`; only `node_modules` was symlinked. The endurance command was `env -u GAME_BROWSER_ENDURANCE_TICKS npm test -- game-browser-endurance`.

Archive identity matched the commit: `src/ui/game-browser-entry.js` SHA-256 `3ca73736f019a65dd3d2bde8157eda4479aad2121154d5968c715cb14af52436`, `tests/game-browser-endurance.test.js` SHA-256 `42e068087cd5b90fb6e42da818530f42081e9c6cbc32b873890146ebd4f44e86`, and `package.json` SHA-256 `e3374ae28ad30665ebe0641f56e848d75cb13e1d1ac143c3955f56622be311cf`.

The actual endurance test reached all 18,000 ticks in 61 segments and completed terminal observation and the seed-zero restart before failing its final browser-error assertion. TAP reported one classifier test passed and the endurance test failed after 511,806 ms. The tee pipeline itself returned the tee status, so the TAP failure and `endurance-result.json` are the authoritative result.

The 600→300→600 restore/replay checks passed: the branch cut was 600→300; restore preserved two accepted UI commands and advanced the audio generation from 0 to 1 while rebasing the cursor/event count from 63 to 28. Audible starts remained 55 across restore. The test passed exact replay equality for session bytes, E2 input bridge, HUD/layers, and audio continuation. At terminal, the state was tick 18,000, south 3 crowns to north 2, with every projection layer at 18,000. The terminal renderer was disposed with zero active voices. Restart returned session/DOM tick 0, `restartCount` 1, terminal false, hidden restart control, no overlay, and a fresh locked audio context.

Timing evidence met the stated caps: initialization max 165 ms (300 ms cap); measured non-initialization long-task maxima were 0 ms for drive, restore, terminal observation, restart, screenshots, final observer drain, and out-of-segment work (50 ms cap). The delayed-entry classifier test passed, all 61 segments stayed under the 30,000 ms segment wall-clock limit (maximum 7,832 ms), and the browser server exited cleanly.

The failure was 122 repeated HTTP 404s and matching console errors for `http://127.0.0.1:50784/tests/assets/briar-runner-painted-sheet.png`. The fixture serves `tests/game-browser-endurance.html`; `src/ui/combat-art.js` assigns the inline SVG image `./assets/briar-runner-painted-sheet.png`, which resolves against that document as `/tests/assets/...`. The test server maps request paths under the repository root, while the actual file is `public/assets/briar-runner-painted-sheet.png`. This is a document-relative asset path failure, not a manifest allowlist rejection. The failed image requests leave the run below the presentation bar.

BIGGEST GAP: The inline combat-art image URL resolves from the endurance page under `/tests`, producing 122 missing requests for `/tests/assets/briar-runner-painted-sheet.png` and failing the final browser qualification.

Focused frozen-source checks also passed: nondeterminism 10/10, shipping-isolation guard 13/13, audio renderer 14/14, game-audio runtime 11/11, and audio production assets 5/5. Static review confirmed `scripts/serve-release.js` still validates manifest schema, path traversal/forbidden paths, file sizes and hashes, duplicate paths, total bytes, and listed entrypoints. Shared-worktree guard output is not treated as frozen evidence.

Receipts: `endurance-result.json`, `game-browser-endurance.stdout.log`, `active.png`, `terminal.png`, `restart.png`, `guards.log`, and `audio.log`.
