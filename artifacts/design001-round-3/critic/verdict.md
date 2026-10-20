PIECE: DESIGN-001 R3 static design board
VERDICT: FAIL

EVIDENCE:

- Rendered the committed candidate `design/20261020-redesign/claude-round-3/design-board.html` (SHA-256 `427788064b231af280b8c67a271c63bf0daeb8ce86879f41a361a6587218d2e4`) in Chrome `155.0.8059.85`, Node `v22.22.3`, Playwright `1.58.2`. The 6 normal captures are native-size: 390×844 and 1440×933 at DPR 1, with CSS frame dimensions matching and no transforms/zoom.
- The phone and desktop landing/battle captures are byte-identical to R2. Deck captures differ as expected. The phone deck retains all eight deck tiles and readable selected-card name, cost, and stats.
- Static comparison against committed Git HEAD source found 23 unique candidate card IDs, with every name, cost, type, and rarity matching the 19-troop / 1-spell / 3-building roster.
- The collection scroll audit confirms a focusable `role=region` with `overflow-y: scroll`, 23 items, `clientHeight=518`, `scrollHeight=670`, and `maxScrollTop=152`. After focusing it and pressing `PageDown`, then `End`, both recorded `scrollTop=0`; the recorded bottom state is still `atBottom=false`. In the retained 1440×933 audit image (`raw/collection-scroll/f-desk-deck-bottom.png`, SHA-256 `5ea7845210c4d9cb359a694d18b52282bbc38755d70e25cd9de74ad6f2126911`), the last row is clipped before its card-name strips. The data being present in the DOM does not prove it can be reached or read.
- The runner exited 0. There were no page errors, console messages, request failures, external HTTP requests, or font requests. Pre/post fences preserve candidate and runner hashes, Git HEAD, tool versions, and the allowlisted environment; Node and Chrome processes are closed.

BIGGEST GAP: The 23-card desktop collection advertises internal browsing, but keyboard navigation did not move its scroll region and the last card row remains clipped, so the complete collection is not demonstrated as reachable.

Evidence directory: `/Users/me/.codex/clash-qualification/20261020-design-r3-critic/`.
