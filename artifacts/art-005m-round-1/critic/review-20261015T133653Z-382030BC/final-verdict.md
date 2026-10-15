PIECE: ART-005M — Original Mossguard directional sprite asset
VERDICT: FAIL. The frozen candidate is not ready for registration or downstream gameplay integration.

The identity and lineage checks pass: the source shows the original wooden mask, leaf mantle and leaf-faced shield; the candidate input hash matches the original top-row second portrait cell; the manifest and portrait provenance both declare AGPL-3.0-only; and the input list contains no `reference/` path. The sheet is 1254×1254 RGBA with alpha extrema 0–255. All 16 frame rectangles are equal 313.5×313.5 cells, in the declared four-facing/four-pose order. The browser rendered all 16 clipped frames at 13 CSS px.

Two admission issues fail independently. The shipped WebP is 1,536,922 bytes, 488,346 bytes above the 1,048,576-byte limit. The source has visible red/orange chromatic fringe around many cutout edges, preserved exactly in the lossless WebP; clean natural-color transparent edges are not met. At native 13px, the broad green/wood silhouette and shield mass remain recognizable, but the two walk poses and melee windup/contact are difficult to distinguish, and face/fist/foot detail collapses. Do not treat the enlarged browser screenshot as evidence of native-scale readability.

Anchor review also remains failed/unvalidated: all 16 proposed foot anchors are explicitly marked low-confidence and not validated. Their local y values span 253–299 source px (46 px); south-row alpha bounds reach local y=313 in each frame, leaving 0.5 source px to the cell edge. The proposed contacts therefore do not establish a consistent shared baseline or safe bottom margin. No gameplay integration, historical parity, or product behavior is assessed.

Evidence:
- independent-asset-audit.json — independent decode, exact PNG/WebP RGBA equality, hashes, dimensions, alpha counts, encoded-size gate, lineage and layout measurements.
- actual-browser-13px-atlas.png — raw actual-browser capture at candidate 13 CSS px preview.
- actual-browser-atlas-zoom-190pct.png — raw actual-browser detail capture at 190% browser zoom.
- render-run.txt, candidate-plan-row.txt, candidate-original-art-hardrules.txt, source-fences.txt — method and candidate scope.

Largest gap for the next builder round: reduce the actual shipped WebP below 1 MiB while preserving readable, clean-edged frames; current candidate exceeds the limit by 488,346 bytes.
