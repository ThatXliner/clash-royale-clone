# Critic evidence: preload provenance candidate eeb0fab

## Verdict

**FAIL.** The original Vite preload-helper regression is fixed by the focused probes below, but the candidate does not pass the release artifact suite. The HTML-linked CSS fixture still requests an unmanifested `assets/public/assets/css-url.svg` and blocks the Pages workflow.

## Local clean-snapshot evidence

Snapshot: `/tmp/ship-preload-critic.BnMdCU`, created with `git archive` at eeb0fab and a symlink to the workspace's installed `node_modules`. Node: v22.22.3. Full output: [release-build-eeb0fab.log](release-build-eeb0fab.log).

`npm run test:shipping-isolation-guard` passed 13/13, including reference and identity adversaries, symlink/path traversal checks, and the shipped entry graph.

`npm run test:release-build` exited 1: 22 tests, 21 passed, 1 failed. The production deterministic release build passed in 36.5s. The authored-helper denial matrix passed in 87.6ms. The new inline literal and template dynamic-import browser test passed in 2.26s. The only failure was the legacy HTML/CSS/SVG audit:

```text
not ok 2 - Chromium manifest audit covers legacy HTML, CSS, SVG and opaque-frame dependency forms
error: 'browser requested an unmanifested release path assets/public/assets/css-url.svg (manifest: false, HTTP 404)'
```

The failure reproduces after eeb0fab moved the stylesheet to `styles/surface.css`, kept it linked from HTML, and retained CSS `url()` and `image-set()` references into `public/assets`. The copied image is at `public/assets/css-url.svg`; the browser's extra `assets/` prefix demonstrates that the CSS output URL does not match the manifest path.

## Remote Pages workflow

GitHub Actions run [38175320200](https://github.com/ThatXliner/clash-royale-clone/actions/runs/38175320200) tested eeb0fab. Shipping isolation passed; release packaging failed with the same CSS request. `Verify the Pages artifact`, project-subpath build, and upload were skipped. Captured failed-run log: [pages-run-38175320200.log](pages-run-38175320200.log).

Run 38174955816 at 736935f also passed the authored-helper denial matrix and inline dynamic-import browser test; it hit the same CSS failure before eeb0fab's path correction.

## Gap for the next round

The release CSS output must request the canonical manifest path for images used by a stylesheet linked from HTML, while the fixture continues to exercise both `url()` and `image-set()` against the copied static assets.
