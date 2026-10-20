# Coilblade R3 native art critique

**Verdict:** A **FAIL**. B **PASS** and is the stronger candidate. The pass is limited to Coilblade's standalone saber identity and the rendered pose set.

I inspected the fresh saved-model renders from attempt `attempt-20261020T200122Z-42405`: both 4× native color and silhouette sheets, 64 px cells, 256 px captures, portraits, team masks, and the actual comparison atlas. Receipts report 32 fresh native outputs per candidate (24 color poses and 8 masks) plus one fresh portrait each. All 32 native PNG hashes, each portrait hash, both editable Blend and GLB hashes, and both post-export preservation proof hashes matched their receipts. The earlier R1 and R2 images below are carried comparisons, not fresh R3 renders.

## Variant verdicts

**A — FAIL.** The portrait has a strong rising crescent, but the 13 px body render loses its saber profile. Across the actual native headings the exposed blade often collapses to a thin, nearly straight stroke; east and south are especially short-looking. It does not reliably read as a long curved saber at game scale.

**B — PASS; selected.** Its blade remains a long hooked crescent at native scale in all four actor-facing headings, and its portrait reads as a pointed, narrow saber. It no longer obscures the body like the carried R2 plate. The bronze bell, single eye, moss scarf, copper limbs, and teal tabard keep Coilblade recognizable. B is the only candidate that clears both the native and portrait saber-read criteria.

For both candidates the saved camera contract labels headings from projected actor-forward local −Y, with columns ordered north/east/south/west; east and west render the saber on the expected sides. Idle and walk are close but visibly differ at the feet and body; contact is clearly distinct, with the arm and saber extended. River and Ember keep separate teal and coral team rings in the native color sheet, and the team-mask render/restoration receipts are exact.

## Preservation and framing

Both saved models remain editable as `.blend` and `.glb`, use 1,696 triangles, and change only the crescent-blade mesh. Their preservation receipts retain all 34 non-blade meshes and show the same before/after state hash (`efce3d2e…b247d6db`), including hilt, grip, body, pivots, poses, cameras, and materials. The mask restoration is exact. The attempt receipt records source and frozen inputs unchanged, no reference import, and no Mossguard render.

Both use the shared 50° camera, orthographic scale 8.025, and ground anchor `[0.5, 0.84375]` (pixel `(32, 54)` in a 64 px cell). All native outputs retain the required two-pixel bottom crop margin; the saved blade measurements leave at least 2.48 px for A and 2.82 px for B. The original portrait is still comparison guidance, not prior approval. This review does not establish live-game integration, full-cast acceptance, or motion acceptance.

## Selected evidence

Fresh R3 renders:

- [A native color, 4×](evidence/A-native-color-4x.png) · [A silhouette, 4×](evidence/A-native-silhouette-4x.png) · [A portrait](evidence/A-portrait.png)
- [B native color, 4×](evidence/B-native-color-4x.png) · [B silhouette, 4×](evidence/B-native-silhouette-4x.png) · [B portrait](evidence/B-portrait.png) · [B team masks, 4×](evidence/B-team-masks-4x.png)
- [A/B native comparison, 4×](evidence/R3-A-B-native-color-4x.png)

Carried comparison evidence:

- [Canonical portrait atlas](evidence/canonical-portrait-atlas.webp)
- [R1 native color, 4×](evidence/carried-R1-native-color-4x.png) · [R1 portrait](evidence/carried-R1-portrait.png)
- [R2 native color, 4×](evidence/carried-R2-native-color-4x.png) · [R2 portrait](evidence/carried-R2-portrait.png)

The machine-readable inventory, source paths, and hashes are in [review-manifest.json](review-manifest.json).
