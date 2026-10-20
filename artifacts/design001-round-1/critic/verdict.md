PIECE: DESIGN-001 — static proposal
VERDICT: FAIL
EVIDENCE: Two headless Chromium renders of `#f-phone-landing` visibly show the numbered three-step strip clipped by the 390 px phone frame. The first is a 390×845 Playwright element screenshot; the second is a 390×843 page screenshot clip. In both, step 1 is readable, step 2 is cut off at the right edge, and step 3 is entirely hidden. The actual CSS box measured 390×844 at DPR 1 in both runs. The capture helper hit an off-by-one/fractional-boundary dimension assertion in each run (raw logs and exit code 1 preserved); screenshots were inspected with `view_image` without resizing. Source cause: `.pl-steps` is a fixed horizontal flex row with 200 px cards and `overflow:hidden`; the 3 cards plus gaps need 620 px inside a 390 px frame.
BIGGEST GAP: The phone landing’s three-step explanation overflows its 390 px frame, leaving step 2 truncated and step 3 inaccessible.

Scope: This verdict covers the static proposal only. The other five #f-phone-* / #f-desk-* frames were not captured or reviewed after the first frame established a bar failure. No live app, implementation, or full-game qualification is claimed.

Renderer/runtime evidence:
- Node `/Users/me/.hermes/node/bin/node`, v22.22.3; Playwright 1.58.2; bundled headless Chromium 145.0.7632.6 at `/Users/me/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
- Attempt 1: renderer PID 24523, browser PID 24527 (confirmed via `ps`); direct file URL; headless; DPR 1; measured CSS box 390×844; `locator.screenshot` output 390×845; exit 1. See `render-board-attempt1.mjs`, `render-attempt1.raw`, `exit-code-attempt1.txt`, and `attempt1-f-phone-landing-element.png`.
- Attempt 2: renderer PID 25046, browser PID 25052; exact 390×844 viewport; measured CSS box 390×844; `page.screenshot` CSS clip output 390×843; exit 1. See `render-board.mjs`, `render.raw`, `exit-code.txt`, and `f-phone-landing.png`.
- Both renders opened only the local `file://` proposal. Runtime page metrics reported DPR 1, no `@font-face` entries, and no external resource elements. The source uses inline SVG/CSS and system-font stacks; no external images or font references were found.

Proposal source SHA-256 at review time:
- `design-board.html`: `922d194d17bfb3c0b18aabf9ae1946be4cd844ec962ece8b8363a650a35943ac`
- `art-direction.md`: `d8fd7590b66b3bb1373208f4263189c8e94f24c2d8e3607f5357df2f66b62891`
- `character-to-3D-handoff.md`: `36902b84170b18b01d1228e3335802cd8ecdc2adb0ce25f1a9b055fbbdd1626a`
- `motion-direction.md`: `46058c2b9c6ccf921e45306aa41eb7e9a5fd56d6a933ace44e2f37d9f303535d`

The visible landing art and docs share a consistent woodland river-workshop, copper, and emberseed direction; the named cast (Coilblade, Mossguard, Copperskiff) reads as original. The phone overflow is enough to fail the proposal bar even though that broader art direction is coherent.
