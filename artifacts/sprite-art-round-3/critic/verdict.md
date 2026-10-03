PIECE: ART-005S — painted Briar Runner team recognition
VERDICT: FAIL
EVIDENCE: The frozen ddf50e2 source-hosted app rendered its real battle iframe at 720×1280 and 390×844 in an independent Playwright context, with both teams present and no page, console, or missing-path errors. Normal restore matched byte-for-byte at both sizes; reduced-motion restore matched at 720×1280. At 390×844, the browser test failed reduced-motion restore (buffers 330,992 vs 331,000 bytes), and a fresh decoded-RGBA comparison confirmed five changed pixels at x=105, y=700–704 (maximum channel delta 3). Separately, I inspected actual final-size marker crops from the phone iframe: the 14×14 crop contains only 2 red and 1 teal pixels within ±24/channel of team color, after the iframe’s 0.514844 scale. Full screenshots and before/after restores are in this folder. Sprite/UI/manifest checks passed 28/28; the browser test is the one failure. The atlas is 987,565 bytes and its digest matches the visual asset manifest.

BIGGEST GAP: The team footring still does not read reliably in the real 390×844 battle view: after iframe scaling only 1–2 pixels retain the team hue, so enlarge or reposition the team-colored area to survive the final displayed scale.

The body atlas itself is unchanged. This verdict covers the source-hosted app only; it makes no packaged-release, endurance, or historical-parity claim.
