# FRAME-RESTORE-001: decoded capture diagnosis

Status: hypothesis ready; no browser rerun and no product/test edits performed.

## Existing critic evidence

Evidence is from the independent R3 critic at `artifacts/art004-aggregate-round-3/critic/live-browser/`:

- `decoded-pixel-diff.json` reports the required 390x844 reduced-motion exact-restore viewport differs at five pixels only: x=105, y=700..704, maximum channel delta 3. The RGB values move from about (31,37..38,44..45) to (33,39..40,47).
- The paired `body.screenshot()` captures are 372x659 RGB, and their decoded content differs at 842 pixels (max channel delta 5; bounds x=32..327,y=12..587). This image size is the iframe's scaled footprint, not its 720x1280 native CSS viewport.
- At the five viewport pixels, the child body clip has the matching five changes at x=96,y=583..587, +2/+2/+2..3. That correspondence locates the visible edge but does not make the body clip an independent child-raster capture.
- `live-arena-integration-390-reduced-motion-paint-diagnostics.json` shows identical DOM/style fingerprints. The first hand slot is `brassbolt`, layout rect x=185,y=1121,w=112,h=128. The outer iframe rect is x=9.65625,y=117,w=370.6875,h=659 with transform matrix(0.514844,0,0,0.514844,0,0). Mapping the changed viewport location into child coordinates gives (185.19,1132.38), on the slot's left border, roughly 11 CSS px below its top.
- The stable viewport comparisons and matching pre/post layout fingerprints rule out a moving element, focus, animation, font-load, or changed geometry as the explanation for these five pixels. The other 837 differences in the body clip do not map to the viewport diff and are not evidence of an 842-pixel visible UI change.

## Capture path and source seam

The test takes the child captures at `tests/combat-sprite-prototype-browser.test.js:988,1002` with `frame.locator("body").screenshot()`. In the installed Playwright source used by this run, `Frame.screenshotElement` delegates to the owning page's screenshotter (`node_modules/playwright-core/lib/server/frames.js:967`); `Screenshotter.screenshotElement` computes a document clip and `_screenshot` invokes the main page delegate (`node_modules/playwright-core/lib/server/screenshotter.js:185-206,255-264`). Thus the body locator screenshot is a clip from the main-page capture/compositor after iframe scaling, rather than an independent native 720x1280 child capture.

The shell sets the fixed 720x1280 iframe scale in `src/ui/app-shell.js:389-397`. The child card slot is explicitly promoted with `transform: translateZ(0)` in `src/ui/arena-shell.css:702-705`; its comment says this keeps the scaled card edge on one compositor layer across exact HUD restore. The reduced restore path steps once, restores the serialized child renderer state, and returns to manual stepping in the browser test at lines 993-1001, then captures after paint frames.

## Falsifiable hypothesis

The five-pixel change is a fractional-composite raster difference on the promoted Brassbolt card border. Restore rebuilds and repaints the child HUD graph; the slot's forced compositor layer is then sampled through the fractional outer iframe transform (0.514844). The changed viewport pixel center falls at child x≈185.19, directly against the 3px left border. A small edge-raster shift of 2–3 RGB values can therefore persist even when child DOM, styles, geometry, and motion state are unchanged.

This is not yet proven. The single discriminating capture is a native 720x1280 child screenshot, taken on the same real page/state immediately before and after exact restore, with the browser viewport kept unchanged. Compare decoded RGBA in that native image and the existing 390x844 viewport image:

- If native child pixels match while the outer viewport differs, the cause is at iframe/compositor resampling.
- If native child pixels differ at the same card edge, the cause is child paint/rasterization and the compositor hypothesis is falsified.

The check must preserve the existing actual restore sequence, whole-viewport exactness assertion, and normal browser/GPU settings. No source change is justified until this result identifies the layer.

## Source fence

This diagnosis was made from frozen source `8983794bdba940cc8232bdfe1d6181a823776916`. This builder checkout has no production or test changes. Existing failed screenshots and receipts remain in the R3 critic folder and were not rewritten.
