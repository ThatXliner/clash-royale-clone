PIECE: CARDS-011 frozen candidate 42bcf094ba89128e75fe525772dc18d756237dc9

- `node --test tests/cards-swarms.test.js tests/editable-deck.test.js tests/game-roster-troop-profiles.test.js tests/game-roster-troops-projectile-profiles.test.js tests/game-roster-admission.test.js tests/game-roster-buildings.test.js` — exit 0; 73/73 passed; 76.819 s. Relevant passing cases included preservation of the shipped standard eight-card setup, all-card legal deck witnesses, and “new squads deploy through custom eight-card battles and restore exactly.”
- `npm run test:app-shell` — exit 0; 1/1 passed; 59.176 s. The browser test built and opened the real `public/index.html`, exercised 1440×933, 720×1280, and 390×844, selected cards, opened the Battle iframe, and asserted no console/page/request failures. Its evidence reports the exact eight original roster IDs, an eleven-card editable pool, and both new portrait requests decoded from the release manifest.
- `npm run test:visual-asset-manifest` — exit 0; 6/6 passed, including byte-exact registry matching, zero overlap with reference-corpus bytes, provenance checks, and closed-canonical-surface admission.

Visual review: desktop card capture shows both new painted portraits and Forgeguard’s rendered story. The 390×844 collection full-page capture shows both new portraits. A second private Chromium pass against a release built from this frozen source selected each new card at 390×844; both title and “Story / A field note” lore were visible, with no page, console, or failed-request errors. Capture metadata and exact lore text are in `phone-details-evidence.json`.

Asset evidence from the app-shell release manifest: Thornscouts is 213,794 bytes, SHA-256 `04893c3101194546b572056ad9466d88b26fc2ede3549ec821e1304b1fe9c11a`; Forgeguard is 268,352 bytes, SHA-256 `cdd98ec4812e602b118645de53238013c75b798cd632363c3ffd1235212cc5ed`. Both output hashes and sizes exactly match their registered source assets. Each is below 1 MiB.

`reference/stats/SOURCES.md` marks the copied Goblin/Barbarian combat fields unverified. Candidate provenance and tests keep those fields as question-backed estimates; this review makes no historical-parity claim.
