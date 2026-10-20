# Execution record

## Attempt 20261020T143045Z-20857

- Source snapshot, source hashes, actual argv, non-secret environment, full stdout/stderr, and exit receipts: `generated/attempt-20261020T143045Z-20857/`.
- Python syntax check: exit 0.
- Blender: 5.1.2, build hash `ec6e62d40fa9`.
- Actual Blender PID: 20869; process exited with code 1.
- No models were exported and no previews were rendered.
- Failure:

```text
RuntimeError: No supported view_transform: ['NONE']
```

The generic enum helper incorrectly treated a dynamic RNA enum list as the complete supported set. The new source preserves the scene's current view transform instead of forcing a new one; it records the actual transform in the manifest. The shared enum helper now also accepts an already-valid current value. This fix remains unexecuted until the next granted runtime window.

The next attempt will start a **new background process** with `--factory-startup`, as directed by the parent agent, to exclude user preferences and background add-on startup. This flag does not touch the user's live Blender process. Both the per-character and shared `.blend` files are written from the authored scene dependencies only; no unrelated startup-scene data is included.

The failed attempt remains intact. Its source and raw evidence are not replaced by the fixed source.

## Attempt 20261020T143439Z-21496

- Blender PID 21508; syntax exit 0; Blender exit 1.
- The color-management fix passed. All source-pose crop bounds passed.
- The anchor guard rejected float noise because it required exact equality at eight decimal places:

```text
Sprite anchors drift across characters or directions:
... (0.49999958, 0.65414909) ... (0.50000042, 0.65414909) ...
```

The total horizontal spread was 0.00000084 of a tile, or 0.00021504 px at the 256 px measurement resolution. The source now records the measured spread and permits at most 0.00001 of a tile before rejecting drift. One canonical measured anchor is shared by all atlas cells; frames are never individually repositioned.

## Attempt 20261020T143536Z-21593

- Blender PID 21605; syntax exit 0; Blender exit 1.
- Camera fitting and the corrected numeric anchor guard passed.
- The exporter format guard incorrectly interpreted an empty dynamic RNA enum as “GLB unsupported.”
- I read Blender 5.1.2's installed primary source at `scripts/addons_core/io_scene_gltf2/__init__.py`: `get_format_items` supplies `GLB` and `GLTF_SEPARATE`. The fixed source calls this official installed callback when RNA omits the list.

## Attempt 20261020T143705Z-21781

- Blender PID 21793; syntax exit 0; Blender exit 0.
- Source hashes were unchanged before/after the run.
- Generated: a shared scene-only `.blend`, three individual scene-only `.blend` files, three GLBs, measured projection data, a manifest, a 960×576 lineup, and three 256² three-quarter previews.
- Render engine: `BLENDER_EEVEE`, Blender 5.1.2, current view transform `AgX`.
- Viewed the actual lineup and all three individual previews. This is a builder inspection, not an independent PASS verdict.
- Measured evaluated triangle counts: Coilblade 9,668; Mossguard 5,904; Copperskiff 8,356. Each character uses eight distinct materials. These exceed the proposed 1,500–3,000 triangle LOD target.
- **Known GLB defect:** the exporter log includes `Extracting primitive: Cube`. Selection filtering applied across the default startup scene as well as the authored scene. The generated GLBs are therefore not accepted as isolated character exports.
- The source fix adds the installed exporter's `use_active_scene` and explicit collection filters. It also parses each written GLB and rejects unexpected object names, multiple scenes, external image textures, or absent pose animation. This fix has not yet been run.
- The `.blend` files were written from authored scene dependencies only, and the preview renders used the authored scene.

The runtime was released immediately after viewing these initial renders. The next generated candidate must use a new attempt directory; the successful-but-defective export attempt stays intact.

## Attempt 20261020T144102Z-22183 — frozen structural candidate

- Actual Blender PID 22195; syntax exit 0; Blender exit 0; source unchanged before/after.
- Generator source SHA-256: `d243516258802c67925455a7980661d4dd1c7bb54a8c443c2381308dd5b6f5b3`.
- All three GLBs passed the container, one-scene, authored-node membership, no-image-texture, and present-animation checks.
- Coilblade: 80 exported nodes, 64 mesh definitions, 12 per-object animation tracks, 13 animation channels.
- Mossguard: 85 exported nodes, 70 mesh definitions, 11 per-object animation tracks, 12 animation channels.
- Copperskiff: 65 exported nodes, 52 mesh definitions, 6 per-object animation tracks, 7 animation channels.
- The latest lineup was viewed. The model shapes are unchanged from the previous generated attempt; this run corrects export isolation.
- Measured common sprite camera: elevation 50°, orthographic scale 2.59, target height 0.6211162480011352. The ground anchor is `[0.5, 0.6541491]`.
- All 288 authored pose/direction combinations passed the crop guard. Maximum measured anchor spread was `8.4e-7` of a tile horizontally and `1.7e-7` vertically, below the recorded `1e-5` numeric tolerance.
- Four PNG previews were generated: one 960×576 lineup and three 256×256 RGBA character views. Their actual metadata and hashes are in `models/preview-provenance.json`.
- The heavy runtime slot was explicitly released after exit and inspection.

These are structural export and projection results. They do not establish 13 px visual readability, visual fidelity, motion quality, a triangle-budget pass, or matching-tick live-app restore. An independent critic must render and evaluate the frozen files.
