# Astra Coilblade / Mossguard — Native Art Critique, Round 1

**Scope:** standalone editable model art, native-scale rendered views, and the rendered idle/walk/contact pose set. This is not a live-game integration or all-cast/UI acceptance review.

## Verdicts

| Piece | Verdict | Review finding |
|---|---|---|
| ART-3D-COIL (Astra Coilblade) | **FAIL** | The signature curved crescent saber collapses at native 13 px to a short, straight horizontal pale bar. The portrait render also reads as a blocky straight wedge instead of a clear sweeping crescent. This is the actionable character-identity gap. |
| ART-3D-MOSS (Mossguard) | **PASS** | The round leaf mantle, wooden mask, tall shield with leaf relief, and broad squat mass remain legible at 13 px and distinct from Coilblade. No blocking standalone-art gap found in this review. |

## Checks and evidence

Reviewed actual rendered images, not source-only previews: each character's 4x native color, grayscale, silhouette and team-mask sheets; individual native 64 px cells for four headings and idle/walk/contact; portrait renders; original portrait atlas; and arena context. Selected sheet evidence: `coilblade-native-color-4x.png`, `mossguard-native-color-4x.png`, `coilblade-three-quarter.png`, `mossguard-three-quarter.png`, `canonical-portrait-atlas.webp`, and `arena-context-grayscale-540x960.png`.

- **Output inventory:** 80 native outputs plus 2 portrait outputs. All 80 recorded native output hashes matched the files reviewed. Coilblade: 40 native views total (16 fresh in the completed continuation, 24 carried forward from the frozen initial attempt). Mossguard: 40 fresh native views. The carried Coilblade views are explicitly not counted as fresh renders.
- **Fresh run:** continuation attempt `design/20261020-redesign/astra-coil-moss-round-1/repairs/enum-readback-3/generated/attempt-20261020T190149Z-17845`; wrapper and Blender exit codes were both 0. No new Blender runtime was launched for this critique; the completed render processes had exited.
- **Input integrity:** 112 frozen inputs compared unchanged before/after; source manifests compared unchanged (27 entries); diagnostics compared unchanged (4 entries). Renderer receipt records inputs unchanged and the output hashes match. No source/frozen paths mention `reference`; model manifest records no reference import, no external model images, no identity changes, and no runtime integration.
- **Geometry:** Coilblade 1,672 evaluated/base triangles across 35 editable meshes; Mossguard 1,224 across 40 editable meshes. Both meet the 3,000-triangle cap. Foreign meshes: 0 for each.
- **Common framing:** same 50° elevation and orthographic scale 8.025, with normalized ground anchor `[0.5, 0.84375]` / native pixel `(32, 54)`. Bounds fit the common cell. Alpha-clear margins (left, top, right, bottom) are Coilblade `(18, 40, 18, 2)` and Mossguard `(21, 39, 21, 4)`.
- **Facing and motion:** all four headings were checked using actor-forward screen projection (north up, east right, south down, west left), avoiding camera-position intuition. East/west orientation is not mirrored. Idle, walk, and contact images differ for both characters. Coilblade contact extends the saber; Mossguard contact advances the shield.
- **Team read:** River's solid foot ring and Rival's six-notch/cog ring remain distinct, including in grayscale. This review does not evaluate a live runtime crest overlay.

## Brief provenance limit

Comparison guidance came from `design/20261020-redesign/claude-round-4/character-to-3D-handoff.md`, `art-direction.md`, and `motion-direction.md` at repository HEAD `4cd2911ff851d663fe115002428902b2f80749aa`. Despite the incoming task description calling these approved, their headers identify the documents as a Round 2 copy/proposal and say model quality or motion is pending/unreviewed. I therefore treated their explicit criteria and the original portrait atlas as comparison guidance, not as evidence of prior acceptance.

## Evidence boundaries

This establishes only the verdicts above for the standalone models and the captured native rendered poses. It makes no claim of live gameplay, application integration, or wider UI acceptance. Earlier tool-only capture/readback failures were not counted as visual failures; the completed render receipts and actual images are the evidence for this review.
