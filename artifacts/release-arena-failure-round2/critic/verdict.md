PIECE: RELEASE-ARENA-001
VERDICT: PASS
EVIDENCE:

- Candidate: `8a89beebcffea1a51a492da4140c3f42c30f7bb6`. Installed with `npm ci --ignore-scripts` (19 packages, 0 vulnerabilities). `test:app-shell` passed 1/1 through the repository `test-portable.js` wrapper; `test:release-build` passed 22/22; `test:publication-pages` passed 5/5. The app-shell command was run once directly first, then through the wrapper because its direct test-file fallback points outside this checkout. Both runs passed; the wrapper run is the pinned-package evidence.

- A fresh Pages artifact built for `ThatXliner/clash-royale-clone` qualified at `/clash-royale-clone`: 54 release files, 6,112,788 bytes against the existing 8,388,608-byte cap, 63 successful requests, and no runtime errors. The browser flow covered landing, game CTA, and battle. The standalone RL module imported, stepped from tick 0 to 1, and restored with `restoredMatches: true`; the arena controller attached with an active session at tick 35. Full receipt: `project-pages-qualification.json`.

- The prefixed built UI rendered 8 default cards and 21 collection cards, preserving the previous 20 and adding Buried Coil. Buried Coil displayed 4 elixir, 1,152 HP, 230 damage, 0.7-second first hit, 5.5-tile range, no splash radius, ground-and-air targeting, and the single-target description. Ember Basin displayed 4 elixir, 1,356 HP, 222 damage, 1.1-second first hit, 6-tile range, 1-tile ground splash, and the splash description. Both tables match their projected profiles; cost is unmarked and every combat value is `QUESTION`. Browser runtime errors, request failures, and HTTP errors were all empty. The full DOM/profile evidence is in `actual-project-pages-details.json`; rendered captures are `buried-coil-project-prefix-1440x1000.png` and `ember-basin-project-prefix-1440x1000.png`.

- In a separate throwaway worktree, I restored the previous false splash summary for Buried Coil. The app-shell test failed at the expected assertion: actual “splash damage to ground and air targets” versus expected “single-target attacks against ground and air targets.” The test therefore catches the original defect. The test harness and dependencies matched the candidate by SHA-256; the negative worktree shared only the candidate's lockfile-installed `node_modules` through a symlink. Receipt: `negative-control-app-shell.txt`; fence: `negative-control-fence-candidate.txt` and `negative-control-fence-control.txt`.

- Candidate source pre/post hashes match (`source-fence-check.txt`). The candidate change is scoped to `src/ui/app-shell.js` and `tests/app-shell.test.js`; the release browser qualification script, package manifest, and lockfile are unchanged. No timeout, roster, schema, or retry workaround was introduced.

BIGGEST GAP: Ember Basin’s splash-radius table cell says “1 tiles” while its description correctly says “1-tile radius”; the numeric radius and target class are accurate.
