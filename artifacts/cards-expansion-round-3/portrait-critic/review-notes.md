# ART-015 independent critic verdict

## Frozen input and execution

- Reviewed commit `6dcf64b81751f69f9fe7520878ac136bda9143ed` from a clean `git archive` at `/tmp/art015-critic-6dcf64.yo1odA`; only `node_modules` was linked to the checkout. No implementation files were edited.
- Ran `APP_SHELL_ARTIFACTS=artifacts/cards-expansion-round-3/portrait-critic npm run test:app-shell` from that archive. Exec session 92560 exited 0: 1/1 test passed in 59.261 s. The suite's result is `passed`; its browser failure collector was asserted empty. Output is `test-app-shell.log` and structured evidence is `browser-evidence.json`.
- The app-shell run used Chrome PID 87176 and journey server PID 87173; both were closed during teardown. A post-run process check found no app-shell test, server, or Playwright Chrome profile processes.

## Results against the ART-015 bar

- The editable collection contains 16 entries, and all 16 profile art mappings decoded. This includes both new cards; their `cardIds` are `sunthread-pair` and `duskwing-trio`. The unchanged default set is eight cards.
- Sunthread Pair and Duskwing Trio each render their original portrait, two-sentence lore, current-game classification, and all seven stat cells in actual desktop 1440×933 and phone 390×844 detail views. The screenshots were visually inspected. Sunthread's lore describes the two wardens and their bows; Duskwing's describes the three owl-moths. The source art visibly contains exactly two wardens and exactly three owl-moths.
- At desktop, each detail portrait decodes at 512×512 and renders at 78×78 inside the detail panel; the selected collection portrait remains visible at about 258×258 beside it. Both detail panels fit horizontally: right edge 1367.98 within 1440, `scrollWidth=474` and `clientWidth=474`, document width 1440.
- At phone size, each 512×512 image decodes and renders at 64×64 in the detail heading. Sunthread's panel bounds are x=12, y=83, width=366, bottom=653.1; Duskwing's are x=12, y=83, width=366, bottom=622.1. Both have `scrollWidth=364`, `clientWidth=364`, and document width 390. The 44px-high Cards back control is visible at x=102, and bottom navigation is visible within y=777–844. Focus moves to `selected-card-title`; IDs are unique. All lore and stats fit without horizontal overflow.
- Desktop selection scrolls the long collection so the selected row and detail panel are in view; the top navigation is above that scrolled viewport in these desktop captures. The desktop collection remains alongside the details and no content overflows horizontally. On phone, the Cards back control and bottom navigation are visible and inside the viewport.

## Original art and provenance

- `docs/art/sunthread-pair-provenance.json` and `docs/art/duskwing-trio-provenance.json` record built-in image generation, original prompts, no input images, source PNG hashes/byte counts, output WebP hashes/byte counts, and dimensions. `card-portrait-art.js` and the visual asset manifest map both outputs into the UI; all 16 collection mappings were decoded in the browser.
- Independent SHA-256 checks match the records: Sunthread source PNG `40e360d2…acc6b` (2,909,979 bytes), WebP `96dc16ec…48beec` (55,344 bytes); Duskwing source PNG `d8a82c8a…42511` (2,715,769 bytes), WebP `14c435ea…9cefb` (48,314 bytes). The browser test also compares the manifest's registered and emitted bytes for each direct portrait and passes.
- `reference/stats/SOURCES.md` states that this is a historical reconstruction and per-card unverified mechanics are non-authoritative. The corresponding Archers/Minions fields have `unverified_fields` in `reference/stats/cards.json`. The UI labels values `Current game` and calls each card's layer provisional for historical comparison. This review does not claim historical mechanics parity.

## Verdict

- **ART-015: PASS.** Actual selectable card detail panels show both original portraits and two-sentence lore at the requested desktop and phone sizes. Registered portrait bytes are unchanged, all 16 profile-art mappings decode, panels and phone controls fit, focus and IDs pass, and the app-shell suite passes.
- No implementation gap found. The only capture caveat is that desktop selection scrolls the collection row into view, placing the top navigation above the viewport; mobile back navigation and bottom navigation both remain visibly usable.

## Evidence files

- `sunthread-pair-phone-390x844.png`, `duskwing-trio-phone-390x844.png`
- `sunthread-pair-desktop-1440x933.png`, `duskwing-trio-desktop-1440x933.png`
- `browser-evidence.json`, `test-app-shell.log`
- The scoped app-shell run also wrote collection, deck, battle, and application screenshots into this same `portrait-critic` directory.
