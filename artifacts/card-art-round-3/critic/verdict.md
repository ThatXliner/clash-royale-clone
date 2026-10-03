PIECE: ART-005C R3 — Painted portraits across playable screens
VERDICT: PASS
EVIDENCE:

- Full npm run test:app-shell on frozen commit 686b6ee640fbbe18f21acdd1df136f3007135029: 1/1 passed in 58,421 ms. The suite built and exercised the packaged Vite release, verified all nine Cards mappings, decoded image dimensions, exact registered source/output hashes, desktop and phone overflow, and deck replacement, launch, restore/replay, terminal, and restart. Raw TAP output: app-shell-test-output.txt; screenshots and machine-readable evidence: app-shell/.
- Independently built the Pages package and rendered it at /clash-royale-clone/game/public/index.html. At 1440×933 and 390×844, Cards has all nine decoded portraits; Home and Deck show the eight-card rotation. Replacing Mossguard with Stonehauler also displays the Stonehauler portrait in Home and Deck at both sizes. Bottom-row phone captures place every portrait above fixed navigation with 0 px overlap.
- The Pages manifest registers assets/card-portraits-painted-u4w5pfNY.webp (320,516 bytes; SHA-256 16307a59bde57889e11bcd7b86b54d69ba9985eae6ef436d9703e528fba58e4f) and assets/stonehauler-painted-CDreniUN.webp (308,508 bytes; SHA-256 47c19650d41d21a6efb3f883b6fff73892abd214783279dcb5708cc198b87357). The package bytes match both source files and manifest hashes exactly. All six initial route/view-size combinations had no horizontal overflow; the Pages browser run recorded 0 HTTP errors and 0 browser errors.
- Actual Pages screenshots and route/hash evidence are in pages-browser-evidence.json and pages-*.png; the self-contained Pages package is under pages-package/.

BIGGEST GAP: No remaining portrait, framing, or packaging gap was observed against the declared R3 bar.
