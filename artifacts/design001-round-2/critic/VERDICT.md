PIECE: DESIGN-001 Round 2 static proposal, `design/20261020-redesign/claude-round-2/design-board.html`.

VERDICT: FAIL, scoped to collection count/completeness. The six rendered frames meet the requested frame-size, visual-coherence, legibility, overflow, and self-contained-asset checks. The desktop deck says “Collection · 16” and shows an “All” filter over 16 entries, while authoritative source HEAD supplies 23 choices to the actual collection provider.

EVIDENCE

- Rendered the isolated static board copy at `input/design-board.html`; no CSS fit, transform, zoom, or candidate edit was applied. Candidate SHA-256 was `329af7bdcad3b13d35d074d5c26393ccf0267ebbdaf3a5429581cae6e13d5604` before and after launch. The runner SHA-256 was `a09bbc3676308400ce6b9f42e5824f1b430d2f27504341842136dd481588aa9d`; its pre/post hashes match. Repo HEAD remained `a754b30a18f4bc99af4617c0265b2a9055df74bc`; relevant source blob IDs and launch fences are preserved in `prelaunch.txt` and `postlaunch.txt`.
- Actual runtime: Node v22.22.3 (`/Users/me/.hermes/node/bin/node`), Playwright 1.58.2, Chrome binary `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, version `155.0.8059.85`. Captured argv, sanitized environment, PIDs, raw stdout/stderr, and exit status 0 in the adjacent evidence files.
- All six normal PNGs were rendered and visually reviewed. Each frame CSS box and client/scroll size matched its intrinsic target at DPR 1, transform `none`, zoom `1`; every PNG matched its requested dimensions exactly (zero pixel delta). Hashes:
  - `f-phone-landing` 390×844 `a98f8092a4fa1792c0e39366b81bee39d08a3547a04affd0871fdecb92f04b92`
  - `f-phone-deck` 390×844 `f68edeef9d0798772b5cb7de1abbe5c7a084c901a84e3c12a0bc61fe1bd312ab`
  - `f-phone-battle` 390×844 `7433a0cb27782070c12d1bb9ee5bc436e717fb7bae80b96a89ec67f3ef12e878`
  - `f-desk-landing` 1440×933 `f039b53b6da59c62698d9a519ea5b213e76443df4f66d82baacc49c376dbeec4`
  - `f-desk-deck` 1440×933 `d0fee5eb800632e1025627fe1e84c13dc66fe00af93b8154a911d9b78b8ba412`
  - `f-desk-battle` 1440×933 `2ab8c2c66568b9feb8cb6a82254d425c9c47ec3cb89c272e9e3f5a4185065cbf`
- Frame overflow metrics are clean at the requested bounds. The escape scan reports only decorative SVG `<use>` art extending outside its art crop (`.pl-art`, `.dl-hero`, `.dd-portrait`); those nodes are clipped by those containers. The phone landing heading has a 4px scroll-height excess, with no visible glyph clipping. Contrast and hierarchy remain readable across the six actual images. Phone battle shows four distinct cards and legible costs, but hides their text labels; desktop battle labels all four.
- Network/font evidence: one `file://` document navigation, zero external HTTP requests, zero font requests, zero CSS `@font-face` rules, zero `FontFace` entries. Rendered glyphs use host fonts (Iowan Old Style and `.SF NS`); the board embeds its SVG art and CSS inline.
- Source comparison used Git HEAD `a754b30a18f4bc99af4617c0265b2a9055df74bc`, not the modified working-tree sources. `src/content/session-troop-roster.js` defines 19 editable troop IDs (blob `75fb7af5675c25e418bb06483bcf84d67eda1a4d`); `src/content/editable-deck.js` adds `squall-orb`, `ember-basin`, `buried-coil`, and `aether-well` (blob `cdfb7f081400b8a4f797f0cf577a6923c6004347`), making 23 total choices. `src/ui/app-shell.js` builds its card collection from that mixed list and projects troop vs. non-unit cards (blob `3d024e6bb4b824f22ff39bb446c4943cc12f1ad1`). The board presents 16 entries as the entire collection: its eight playable cards plus eight extra troops. It omits these seven source choices:
  - `duskwing-trio` — Duskwing Trio, cost 3
  - `coppershade-flock` — Coppershade Flock, cost 5
  - `kilnkeeper` — Kilnkeeper, cost 5
  - `squall-orb` — Squall Orb, cost 4
  - `ember-basin` — Ember Basin, cost 4
  - `buried-coil` — Buried Coil, cost 4
  - `aether-well` — Aether Well, cost 6
  The “All” filter and “Collection · 16” label present this as a full catalog, not a sample, so the mismatch is a factual source-accuracy failure.

BIGGEST GAP: The visible full-catalog count is 16; the source-backed collection has 23 choices, with three troop cards and four effect/building choices missing.
