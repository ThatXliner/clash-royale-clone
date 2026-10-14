# FRAME-RESTORE-001 native-frame capture API scope

Source: frozen private checkout `8983794bdba940cc8232bdfe1d6181a823776916`; application harness uses Playwright 1.58.2. This is a source/API determination only. No browser process, screenshot, test, or product edit was made in this scope.

## What the existing captures mean

The critic's child screenshot calls `frame.locator("body").screenshot()` at `tests/combat-sprite-prototype-browser.test.js:988,1002`. In Playwright 1.58.2, the client delegates locator screenshot to its element handle; server `Frame.screenshotElement` calls the owning page's `screenshotter.screenshotElement` (`node_modules/playwright-core/lib/server/frames.js:967`). The screenshotter gets the element's bounding box, rounds a document clip, and delegates `_screenshot` to the owning main page (`node_modules/playwright-core/lib/server/screenshotter.js:185-206,255-264`). That body image is a page-compositor clip after iframe scaling, not a native child-frame raster. The 372x659 dimensions agree with the scaled phone iframe footprint.

The shell's child frame is loaded at `ui-arena-shell.html?app-frame=1`, while the top-level page is `public/index.html` on the same local origin and port. The Playwright browser-context API does document `newCDPSession(page: Page|Frame)` (`playwright-core/types/types.d.ts:9017-9024`), but its Chromium implementation only allows a Frame session when the frame already has a separate CDP target. `crBrowser.newCDPSession` looks up `page._page.delegate._sessions.get(page._id)` and throws `This frame does not have a separate CDP session, it is a part of the parent frame's session` when none exists (`playwright-core/lib/server/chromium/crBrowser.js:500-509`). Thus for this same-origin iframe, an ordinary Playwright frame has no independent CDP screenshot target; sending `Page.captureScreenshot` to the parent session still captures the parent page/composited iframe.

A native child capture would be valid only if `context.newCDPSession(frame)` succeeds for the actual iframe as a separate target and `Page.captureScreenshot` on that session returns the child's own 720x1280 viewport without changing the parent viewport or iframe transform. Resizing the parent, changing the iframe transform, enlarging the element clip, or scaling the 372x659 PNG is not equivalent and must not be labeled a native child capture.

## Existing decoded evidence

`artifacts/art004-aggregate-round-3/critic/live-browser/decoded-pixel-diff.json` reports the stable 390x844 outer viewport differs at exactly five pixels (x=105, y=700..704), maximum RGB channel delta 3. The paired child body clips are 372x659 and differ at 842 decoded pixels (maximum delta 5, bounds x=32..327/y=12..587); those are whole-page-compositor clips and do not prove 842 native child paint changes.

The five outer pixels map to child CSS position approximately x=185.19,y=1132.38 under iframe rect x=9.65625,y=117,w=370.6875,h=659 and scale 0.514844. That point lies on the first Brassbolt `.card-slot` left edge (child CSS rect x=185,y=1121,w=112,h=128). `src/ui/arena-shell.css:702-705` promotes card slots with `transform: translateZ(0)`, while `src/ui/app-shell.js:389-397` applies the fractional shell scale. This makes a fractional compositor-edge difference plausible, but the screenshots do not identify whether the child paint or parent composite is responsible.

## Next diagnostic seam

The authorized fresh runner should keep the legal live Briar phone session and whole viewport unchanged, capture the actual before/after exact-restore page images, then compare one matched restore with a runtime-only `transform:none` ablation on the first Brassbolt slot. Record slot and iframe geometry to prove the ablation leaves layout geometry fixed. Use the actual `Frame` CDP session only if it exists; otherwise record the API limitation above and rely on the matched outer-page ablation as the causal probe. This artifact itself does not claim a cause or verdict.
