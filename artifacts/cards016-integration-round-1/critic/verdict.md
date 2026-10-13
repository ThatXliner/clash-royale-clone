Candidate: `6ec5f43d1ab3610f69d045593fa343c29de98b1a` (clean detached worktree)

PIECE: CARDS-016I
VERDICT: FAIL
EVIDENCE:

- `node --test tests/cards016-integration.test.js tests/game-roster-troops-air-swarms.test.js`: 13/13 passed. This covers the 17-troop and 18-mixed choice pools, unchanged default eight for seeds 0 and 23, exact editable restore, source-confidence QUESTION closure, natural AI choice/spend/cycle, player deployment, air-vs-air targeting, Coppershade projectile delivery, and deterministic session/RL continuation.
- `npm run test:editable-deck`: 10/10 passed. This includes the ordinary deck editor, new-squad deployment, natural opponent choices, and exact restore.
- `npm run test:rl-environment`: 11/11 passed. Both cards are admitted into legal RL actions and the restored wait-only seed reaches the expected natural terminal. The captured TAP output is `rl-environment.tap`.
- `npm run test:nondeterminism-guard`: 10/10 passed. `npm run test:shipping-isolation-guard`: 13/13 passed.
- Real Chrome app-shell run: `node --test tests/app-shell.test.js` failed 0/1 after completing 60.2 seconds of browser checks. Final error: `ReferenceError: stonehaulerDeployment is not defined`, at `tests/app-shell.test.js:1112`, while constructing the evidence JSON. The browser run had already exercised the 390×844 and 1440×933 card collection/details, trusted Gloamwing deck selection and deployment, restore/restart, and the Squall flow. Its final `browser-evidence.json` was never written.
- The browser did not trusted-deploy Coppershade. API/session tests cover its selection, legal deployment, spend/cycle, targeting and projectile impact, but that does not close the real-browser path.
- `reference/stats/SOURCES.md` describes a pinned historical corpus and calls out uncorroborated mechanics. The two swarm witnesses correctly carry all ten unverified mechanics as `authoritative: false`, `confidence: "unverified"`, `disposition: "question"`, including through restore. Their displayed runtime stats remain explicitly estimates.

BIGGEST GAP: The real-browser integration cannot pass while its final evidence writer references undeclared `stonehaulerDeployment`, and it still lacks a trusted Coppershade deployment in the browser.

PIECE: ART-016
VERDICT: PASS
EVIDENCE:

- The same Chrome run rendered actual 390×844 and 1440×933 browser frames. The card-detail assertions for both Gloamwing Cluster and Coppershade Flock passed before the unrelated final evidence-writer error: decoded detail portrait equals the collection portrait source, original lore text matches, all seven stat cells are present, and neither phone nor desktop detail overflows horizontally. The phone back control and bottom navigation were visible and usable.
- Actual screenshots for both cards at both sizes are in `app-shell/`: `gloamwing-cluster-phone-390x844-full.png`, `gloamwing-cluster-desktop-1440x933.png`, `coppershade-flock-phone-390x844-full.png`, and `coppershade-flock-desktop-1440x933.png`. Phone collection is `phone-card-portraits-390x844.png`. Desktop detail captures include the collection beside the selected card. `screenshots.json` records PNG dimensions and SHA-256 digests.
- Visual inspection confirms each detail view shows the corresponding original portrait, lore, role classification, stats, and navigation. Gloamwing's phone image is 390×844; Coppershade's phone image is 390×844; both desktop detail images are 1440×933. The standalone desktop collection capture was taken full-page (1440×1440).

BIGGEST GAP: The standalone desktop collection image is a full-page 1440×1440 capture; exact 1440×933 evidence is available in each desktop card-detail view with the collection visible beside it.
