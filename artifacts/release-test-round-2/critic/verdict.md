PIECE: RELEASE-TEST-001 — Current production isolation test qualification, round 2
CANDIDATE: 1872eb965aeb62232994541a517f39c65974241d
VERDICT: PASS

EVIDENCE: The immutable commit was extracted into the critic archive with only a `node_modules` symlink; tests did not use the dirty live runtime tree. `npm test -- shipping-isolation-release shipping-isolation-host nondeterminism-guard shipping-isolation-guard` passed 28/28: release 4/4, host 1/1, nondeterminism 10/10, and shipping guard 13/13. `publication-pages` is not a selector in `content-schema-runner.js`, so `npm run test:publication-pages` was run separately and passed 5/5. Test output and the release browser receipt are preserved in this folder.

The real Chrome release probe recorded 58 attempted requests. All 50 normal production requests succeeded; the intentionally aborted in-manifest CSS request remained visible as `net::ERR_FAILED`, three reflective script loaders raised `EvalError`, and Chrome recorded both off-origin `connect-src` and `frame-src` violations. The off-manifest fetch was blocked before network dispatch (`offManifestFetchReachedServer: false`). The release build emitted 42 files / 5,358,095 bytes, produced identical repeated builds, and had manifest SHA-256 `910e31b28f6b572dfa1aa30635015c13b75dc311b7054040b07d11edc675adad`.

The assembled Pages output is a separate build receipt: its game manifest has 42 files / 5,363,799 bytes and SHA-256 `ed7535e33cc12e3658c870c1a5c5dc103ff918f13b9b70a89073dad96e781b25`; the whole Pages artifact has 52 files / 5,769,432 bytes. Its 15 canonical public assets match source paths, sizes, hashes, and bytes exactly; there are zero duplicate hashed copies, no protected paths, and the existing 8,388,608-byte release cap is unchanged. A real browser loaded the game and RL module under `/clash-royale-clone/`, reset at tick 0, stepped to tick 1, restored at tick 1, and stepped to tick 2. All 30 requests were manifest-listed HTTP 200s with no page or console errors.

The nine original source-graph fixtures produced all expected outcomes: eight forbidden edges rejected, including used and unused reference JSON and relative/absolute package files, inline Vite `export *`, and bare package import; benign comments and strings passed. Eight additional probes also matched expectations: Vite `/@fs` aliases into reference and `node_modules`, JS export-star, inline reference import/export-star, inline static/dynamic Vite imports rejected, and generated Vite modulepreload accepted. The shipping release suite additionally exercised a symlink alias with a `?raw` query and an outside-root absolute import. Test-runner exits propagate failures. Browser, server, and temporary artifact cleanup completed; no Chrome/Chromium process remains.

BIGGEST GAP: None on the scoped production source-boundary and isolation qualification.

DISPOSITION: This verdict covers RELEASE-TEST-001 only. No fresh full-game or 18,000-tick endurance claim is made for this candidate.
