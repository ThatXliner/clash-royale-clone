PIECE: ART019B — Kilnkeeper battle cutout asset
VERDICT: FAIL
EVIDENCE:
- Clean archive candidate `aa7a71c2f186c8bb727132819d1f62c0d0bce9f8` has parent `63d238fb72dcbdcc40fe0a29d888d15dbf185228`; its manifest diff adds one `kilnkeeper-battle-sprite` record and leaves every existing record unchanged (`manifest-diff.patch`).
- Independent metadata audit confirms the approved input portrait SHA-256 `f4062cfc51764726d97e3c901450ff3ae0dc8b0e25bcabd87eabc469dbf4bf4d`, generated 1254×1254 PNG SHA-256 `ddb4f26bc708fef7fcd99e1c2e6732a80d113a1d02a1d57e6f9cc1a784179b09`, and 512×512 WebP SHA-256 `185ca65f8522ee9b1d70e248a8e1c21f9768a789782b54e30c867fd77b3175d8` all match their provenance claims. The WebP is 67,816 bytes, has alpha extrema 0–254, and ends at visible row 507 with four clear rows beneath the foot anchor. The provenance records the image-edit tool, prompt, AGPL-3.0-only license, and cwebp 1.6.0 arguments. See `metadata-audit.json`.
- Fresh HeadlessChrome render used DPR 1. The actual image elements measured 13×13 and 26×26 CSS px from a 512×512 source (`native-scale-browser.json`); the 13×13 render retains an upright figure and a bright launcher area, but the face, teal apron, and launcher silhouette merge into indistinct pixels. At 26×26, the main body and color cues read better. Render: `native-scale-browser.png`.
- `npm run test:visual-asset-manifest`: 6 passed, 0 failed (`visual-asset-manifest.log`). `npm run build:pages -- --out /tmp/art019b-critic.wOHO4w/site-dist`: passed; 49 release files, 5,801,790 bytes (`build-pages.log`). The Pages output contains the candidate battle-sprite WebP and no battle-sprite PNG, input portrait PNG, provenance, `reference/`, `artifacts/`, or `demo/` paths (`pages-output-audit.json`).

BIGGEST GAP: At 13×13 CSS pixels, the face and the teal-apron/copper-launcher cues collapse into a fuzzy color cluster, so the character does not meet the requested native-scale readability bar at the smallest size.

Scope: this isolated asset fixture does not verify placement or readability in the live 540×960 arena.
