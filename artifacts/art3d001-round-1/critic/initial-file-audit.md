# ART-3D-001 independent review — file-only preparation

Review date: 2026-10-20
Candidate: `design/20261020-redesign/astra/generated/attempt-20261020T144102Z-22183/models/`
Generator: `design/20261020-redesign/astra/build_models.py`

## Scope

This round reviews the standalone editable model pipeline, identity/silhouette, common anchor, thumbnail team readability, and the requested turn/pose evidence. Full hero masters and live atlas/runtime integration belong to later pieces. No candidate files were edited. Blender, Node, browser, and render processes were not launched during this preparation.

## Actual preview evidence viewed

The saved 960×576 lineup and all three 256×256 transparent three-quarter renders were opened with `view_image`. Copies are in `candidate-previews/`; originals remain in the candidate output directory. The lineup reads at broad category level as a copper duelist, a leafy shield bearer, and an envelope over a boat hull.

- Coilblade has the bell head, single eye, copper body, scarf, and a forward weapon, but the saved view reads upright and compact; the blade is not a clearly long crescent and the fencing lunge/scarf-trail silhouette from the identity portrait is weak.
- Mossguard retains the leafy mantle, face, sprout, and large shield. The shield is prominent; the whole figure reads more upright humanoid than the brief's low, broad grove keeper.
- Copperskiff retains the pale envelope and copper hull, so it reads as an airship. The envelope dominates strongly and the compact hull is hard to see at lineup scale.

These 256px views do not establish 13px silhouette/team readability or animation/turnaround quality.

## Independent GLB parse

All three exports have valid GLB 2.0 headers and exact declared file lengths. Each has one scene rooted at its own placement node; all exported node names use the `ME_` namespace; there are no external images or textures; each includes the `TEAM` material. The exported GLBs have no cameras or skins. Camera presence/settings in the editable Blender scenes still need runtime inspection. Meshes are separate transform nodes, with animated transforms on the authored rig objects.

| Character | Mesh nodes / definitions | Parsed triangles | Manifest evaluated triangles | GLB bytes |
| --- | ---: | ---: | ---: | ---: |
| Coilblade | 64 / 64 | 9,668 | 9,668 | 259,100 |
| Mossguard | 70 / 70 | 5,904 | 5,904 | 214,032 |
| Copperskiff | 52 / 52 | 8,356 | 8,356 | 184,852 |

Every character exceeds the 1,500–3,000 triangle target. The Blender base mesh counts are also above target: 8,604 / 5,192 / 8,356. No separate simplified small-LOD mesh is present in the candidate output.

The GLB scene-space bounds from vertex data and node transforms (GLTF Y is up) are:

- Coilblade: X −0.298…0.390, up −0.001…1.176, depth −0.505…0.898.
- Mossguard: X −0.633…0.404, up −0.002…0.999, depth −0.211…0.379.
- Copperskiff: X −0.327…0.324, up 0.536…1.510, depth −0.750…0.617.

The exported dimensions are measurable. Coilblade and Mossguard are near the handoff heights of 1.15 and 1.00 BU; Copperskiff's exported envelope is about 0.974 BU tall against the 0.85 BU target and begins about 0.536 BU above ground against the 0.55 BU hover-base target.

## Projection receipt

The generated `sprite-projection.json` reports a 50° orthographic camera, ortho scale 2.59, anchor `[0.5, 0.6541491]`, and cross-frame/direction anchor spread under 0.000001 tile. For a 256×256 cell that anchor is about (128, 167.5); the handoff specifies (128, 216). This is a likely 48.5px pivot placement mismatch, subject to confirmation in a fresh independent render. The receipt samples 8 directions and 12 pose frames for each character and reports no clipping, but it is builder-generated evidence rather than the required visual review.

## Current evidence gaps

Only the quick rest-pose previews are present. No independent 13px composites on the painted arena, grayscale/team comparison, opposing team variant, team mask, or cardinal turnaround/pose renders are saved. The sprite/LOD atlases are absent; this does not claim a runtime-integration failure in this standalone-model round, but it leaves the required thumbnail and pose checks open. The individual and combined files have Blender magic bytes, but their editability, saved scene/camera settings, and evaluated pose geometry have not yet been inspected by opening/rerendering them.

## Provenance

The candidate manifest records AGPL-3.0-only authorship, source commit `c693d0cc0b36a3f1f179bbb93cb23998b68012b8`, generator/palette hashes, the original identity source list, zero external geometry/textures, and no reference assets. The GLB hashes independently match the manifest. The build receipt says Blender 5.1.2, EEVEE, and source stability `unchanged`. These metadata support provenance but do not prove visual quality.

## Hold point

Do not issue a quality PASS from these files or previews. The pending independent runtime pass must open/check the saved Blender files and render actual battle-size 13px silhouettes/team variants plus directional rest/walk/attack poses, then confirm whether the anchor lands at the specified foot pivot.

## Additional handoff cues from the generator scan

The source defines no inverted-hull outline or outline material, no LOD-specific geometry, and no team crest or foot ring. TEAM is used on the tabard, shield rim, pennant, and hull band. This can still support colored team passes, but grayscale/team-marker readability is not established by the standalone model. These points are model/presentation targets; complete atlas delivery and runtime integration remain later scope.

The source path also saves a different camera than the 50° sprite projection rig. Individual Blender files are written with a portrait camera at roughly 18.2° elevation (ortho scale 1.8); the combined file is restored to a gallery camera at roughly 23.1° elevation (ortho scale 6.4). The projection routine temporarily uses 50° and then resets the scene camera before the final combined save. The saved camera settings still need an independent Blender open check.

Further dimension comparison: Mossguard's exported lateral width is about 1.037 BU against the 1.15 BU target. Copperskiff's exported length is about 1.367 BU against 1.20 BU. The latter and its 0.974 BU height indicate a larger envelope than the brief.
