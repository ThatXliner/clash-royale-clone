# ART-3D-001: Copperskiff revision

Status: **source prepared; no round-two execution, render, or visual verdict yet.**
The shared heavy runtime is reserved for Node qualification until the parent
explicitly grants an isolated Blender window.

## Evidence and scope

The independent round-518 critique of
`astra/generated/attempt-20261020T144102Z-22183/models/` failed Copperskiff's
dominant silhouette at native 13 px. I viewed the actual opposed arena composite,
native turnaround sheet, enlarged black silhouettes, and contact-pose sheet in
`/Users/me/.codex/clash-qualification/20261020-model-critic/runtime-independent-001/`.
The front/back views were cream ovals; the gondola, team belt, and attack contact
were not legible. Those files and the first candidate remain unchanged.

This revision changes only Copperskiff's model, presentation poses, and saved
sprite-camera setup. Original name, two-sentence lore, flying ranged role,
targeting, statistics, mechanics, and audio remain owned by the accepted game.
No assets from `reference/` are read or imported.

`round1_models.py` is an exact copy of the frozen generator. Its SHA-256 is
`d243516258802c67925455a7980661d4dd1c7bb54a8c443c2381308dd5b6f5b3`.
Coilblade and Mossguard are built from those unchanged functions and poses; their
explicit geometry hashes must match the frozen receipt before export proceeds.
Their existing individual `.blend` and `.glb` files are copied byte-for-byte into
the new attempt. Their prior visual failures remain open.

## Form change

The palette still uses the exact shared team colors, river `#2E7F86` and ember
`#C6452E`, with copper, dark copper, canvas, patched canvas, dark wood, ink, and
seed-core light. The source palette file is unchanged.

The long deep envelope is replaced by a short, broad, shallow canvas lens. A
deeper, broader kettle boat hangs below it on four strong supports, leaving a
real empty volume. The longer suspension is intentional: at the required 50°
camera, plan depth projects vertically and used to hide the hull. The source
exposes proportions in `copperskiff-parameters.json` so measured renders can
refine the separation without adding detail.

This sacrifices the first brief's literal 0.85 BU vertical envelope and 2.2:1
longitudinal proportions to test its more important boat-under-canvas read at
13 px. The hover base remains 0.55 BU above the ground anchor. Presentation scale
does not change collision, reach, movement, or any gameplay quantity.

The hull has a broad continuous TEAM belt, a pointed kettle-spout bow, a dark
open deck, an opening copper lid, and a stern pusher disc. Large shapes replace
the prior rivets, fine stitching, many balloon seams, and small propeller blades.
All meshes and materials remain editable; no textures, images, or imported
geometry are used. The target remains 1,500–3,000 evaluated triangles, measured
only after Blender executes. There is no claim of meeting it from source review.

## Pose and camera contract

Idle, float, and contact use the same fixed geometry and camera scale in every
view. At contact frame 100, the kettle lid opens, the hull recoils and pitches,
and a three-lobed ember puff appears at the existing spout. The recoil remains
0.04 BU. The stronger angular and puff cues are presentation only. Keyed scale
controls the puff; it is nearly zero outside contact.

The generator creates and saves four named orthographic cameras at 50°
elevation, facing north/east/south/west. It measures the maximum projected idle
height once, selects one scale targeting a 13 px body in a 64 px cell, and uses
that scale for every direction and pose. No alpha crop or per-view refit occurs.
All source poses receive projected crop checks. The ground origin is fixed at
normalized `(0.5, 0.84375)`, equivalent to `(32, 54)` in the native cell and
`(128, 216)` in the 4× render, matching Claude's camera handoff. The actual
`world_to_camera_view` results and maximum error are recorded.

The individual Copperskiff `.blend` opens with the saved south sprite camera,
while retaining the other cardinal cameras and a three-quarter preview camera.
A second new background Blender process reopens that file and measures its
camera pitch and origin projection. The inspection serializes plain Python
lists and floats, avoiding the first critic's IDPropertyArray JSON failure.

## Bounded run after a runtime grant

```sh
bash design/20261020-redesign/astra-round-2/run-model-build.sh
```

The wrapper creates a new attempt, captures exact source copies and hashes,
non-secret environment, versions, argv, PIDs, stdout/stderr, timestamps, and
actual exit codes. No live Blender session is used. All previous attempts stay
intact on failure.

The bounded first pass writes the model exports, twelve 256² transparent
previews (four cardinal idle views in each team, plus four river contact views),
and one 256² three-quarter preview. The twelve previews are box-downsampled
4:1 without reframing to native 64² cells. It also creates:

- `native-13px-cardinal-sheet.png`: actual-size cells; columns N/E/S/W; rows
  river idle, ember idle, river contact, and black idle silhouette.
- `native-13px-cardinal-sheet-4x.png`: nearest-neighbor enlargement for inspection.
- Pixel alpha-bound and SHA-256 receipts, projected camera data, structural GLB
  checks, unchanged-character hashes, and a saved-file camera inspection.

This is thirteen preview renders, not an atlas or hero batch. No browser, live
arena integration, final team rings, or final outline is included. The parent
will assign a fresh independent critic. A successful process and measured
structure do not establish a visual PASS.
