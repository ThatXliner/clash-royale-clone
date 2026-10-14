# ART-020B independent critic verdict

PIECE: ART-020B — Original Rivet Runners battle cutout
IMMUTABLE CANDIDATE: `6402dd6c472c3cfd63fd8f06a62505e759159ece` (`/tmp/art-020b-rivet-runners.HZPTr8/checkout-final`)
VERDICT: FAIL

The asset is an original single adult brown otter cutout consistent with the approved portrait: light muzzle, solid teal vest with copper fasteners, a rootwood mallet with copper caps, and both feet are present in the full-size source. The final 1254×1254 RGBA PNG is 2,220,668 bytes with SHA-256 `8fe8439376ab117cb88dac92c5eb9a32a9ee564c3f72a3ab3dccfe9aa22f8b65`; the approved portrait input hash, both generated source hashes, prompts, imagegen tool attribution, AGPL-3.0-only license, and encoding details match the provenance record. Re-running cwebp 1.6.0 with the recorded `-q 88 -m 6 -metadata none -resize 512 512` settings reproduces the shipped 512×512 WebP exactly: 94,112 bytes, SHA-256 `1813f2570ddf88dc72144ea2b49a24d818e639054c23145aed2a368d619925b4`. The WebP has genuine alpha: 110,822 fully transparent pixels, zero-alpha corners, and 0–253 8-bit alpha; the final PNG has 0–255 alpha.

I rendered the candidate WebP in a fresh Google Chrome 155.0.8059.40 process at DPR 1 with exact 13×13 and 26×26 CSS stages over dark and light arena-colored gradients. The actual-size 26px captures read as an otter with a mallet. At 13px, the lighter muzzle is only a few pixels, while the teal vest and two feet merge into the warm brown body; the mallet loses a clearly separate copper cap and recognizable head-and-handle shape. The 26px view is readable, but the 13px arena-size view misses the required separation of face, vest, weapon, and feet.

The external checkout matches all 3,224 tracked files in the immutable candidate tree; its tree SHA matches the builder receipt. The one untracked `node_modules` symlink is local tooling and is absent from the Pages output. The frozen candidate's visual-asset-manifest tests pass 6/6. A clean Pages build from the candidate passed with 51 release files / 5,976,939 bytes; independent hash checks passed for all 51 files, found the new WebP exactly once, and found zero protected source/provenance paths. Comparing the candidate manifest with base `b181f166dec37811a9978b87b62a2bfc401f0a31` shows exactly one new record; every prior byte is unchanged.

BIGGEST GAP: Regenerate the cutout with a brighter, cleaner teal vest block and clearer separation among muzzle, copper-capped mallet, and both feet at 13px, then repeat the fresh Chrome DPR1 capture.

Evidence files: `fresh-chrome-native-evidence.json` and four `fresh-chrome-css-*-dpr1.png` captures; `independent-asset-audit.json`; `visual-asset-manifest.tap`; `independent-pages-audit.json`; `manifest-delta-independent.diff`; `pages-build-run.txt`; `immutable-checkout-audit.json` and `candidate-asset-hashes.sha256`.
