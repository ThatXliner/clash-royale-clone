# Independent R4 presentation review

## DESIGN-001 R4

**Scoped verdict: PASS for the rendered presentation, roster, and collection-accessibility gate.** All six captured frames matched their native 390×844 or 1440×933 viewport at DPR 1 with zero pixel-size delta, no transforms/zoom, and no external font or HTTP requests. The design shows the eight-card deck, four-card hand, elixir, tower, and match-rule hierarchy. A separate comparison against the product catalog creators and admitted session manifest matched all 23 card IDs, names, costs, rarities, and kinds; the set is 19 troops, one spell, and three buildings.

After waiting for three stable animation frames, PageDown and End reached the collection bottom at scrollTop 152/152. A real pointer-positioned wheel produced deltaY 600 and the same settled bottom. Keyboard Tab reached all 23 cards in order; each matched :focus-visible with a 3px solid #ffd27a outline, and the last card’s name strip remained fully visible. The earlier R3 scroll failure is resolved.

**Largest remaining gap:** 15 of 23 collection entries still show explicit “Art pending” placeholders. This is a pass only for the specified presentation/accessibility dimension; it does not accept ART-3D-001 or claim application integration.

Evidence: board/browser-evidence.json, board/catalog-compare.raw, six board/raw/normal/*.png frames, and the three board/raw/collection-scroll/*.png captures.

## SITE-REDESIGN-001

**Verdict: PASS for the site and Pages-publication scope.** The exact candidate commit changes only README.md, site/index.html, and site/assets/site.css; src and tests are unchanged from its parent. The production Pages build succeeded and emitted 57 release files (6,369,740 bytes). All five publication-page tests passed, including protected-output refusal, mounted preview/game boot, workflow checks, and portable browser resolution.

Chrome 155 rendered the built Pages output at 390×844 and 1440×933. Neither viewport had horizontal overflow. All 14 phone and 15 desktop keyboard stops showed visible focus; “How to play” reached its in-page target, and “Play the demo” opened the built game successfully. The browser recorded no external requests, request failures, console errors, or page errors. Local publication requests returned 200. The page accurately states the 23-card, eight-card deck, four-card hand, elixir, three-minute result, sudden-death/tiebreak, and centre-tower rules.

The candidate does not depend on ART-3D-001: it only updates copy/layout and uses the existing approved docs/brand logo and gameplay capture through the existing Pages asset graph. It adds no new model-derived sprites, engine changes, runtime dependencies, or claim of new game integration. This site verdict does not resolve app artwork work.

**Largest remaining gap:** the roster count and gameplay preview are static copy/image, so they can drift from the live catalog unless refreshed when the catalog changes.

Evidence: site/logs/publication-pages-corrected.raw, site/logs/build-pages.raw, site/output/native-browser-evidence.json, and site/output/native-captures/.

## Integrity and runtime

The isolated site source fence passed all 647 listed files after install, build, and browser capture. Candidate source hashes and the original board hash matched their prelaunch values; no root checkout files, index, or HEAD were edited. Raw first Playwright-path failure and successful corrected run remain preserved in site/logs/ and RUNTIME-ADDENDUM.md.
