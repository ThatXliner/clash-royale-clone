# Round-two Copperskiff candidate

**Generated, structurally checked, and frozen for independent visual critique.**
The heavy runtime slot was released after the two Blender processes exited.
This is not a visual PASS.

Candidate:
[`generated/attempt-20261020T151650Z-28770/models/`](generated/attempt-20261020T151650Z-28770/models/).

| Artifact | File |
| --- | --- |
| Editable Copperskiff, saved sprite cameras | [copperskiff.blend](generated/attempt-20261020T151650Z-28770/models/copperskiff.blend) |
| Portable Copperskiff | [copperskiff.glb](generated/attempt-20261020T151650Z-28770/models/copperskiff.glb) |
| Combined editable scene | [moss-and-ember-characters.blend](generated/attempt-20261020T151650Z-28770/models/moss-and-ember-characters.blend) |
| Native preview sheet | [13 px PNG](generated/attempt-20261020T151650Z-28770/models/previews/native-13px-cardinal-sheet.png) |
| Enlarged inspection sheet | [4× PNG](generated/attempt-20261020T151650Z-28770/models/previews/native-13px-cardinal-sheet-4x.png) |
| Three-quarter model preview | [256² PNG](generated/attempt-20261020T151650Z-28770/models/previews/copperskiff-three-quarter.png) |
| File and geometry receipts | [manifest.json](generated/attempt-20261020T151650Z-28770/models/manifest.json) |
| Fresh saved-file camera measurements | [saved-asset-inspection.json](generated/attempt-20261020T151650Z-28770/models/saved-asset-inspection.json) |
| Projected source-pose bounds | [sprite-projection.json](generated/attempt-20261020T151650Z-28770/models/sprite-projection.json) |
| Pixel bounds and native-image hashes | [native-preview-receipt.json](generated/attempt-20261020T151650Z-28770/models/previews/native-preview-receipt.json) |
| Frozen sources, models, and image hashes | [frozen-sha256.txt](generated/attempt-20261020T151650Z-28770/frozen-sha256.txt) |

The preview sheet uses N/E/S/W columns. Rows are river idle, ember idle, river
contact, and black idle silhouette. The 4× sheet uses nearest-neighbor enlargement
only. Native cells use a fixed 4:1 alpha-weighted box reduction, without cropping
or per-view rescaling.

## Actual execution and measured results

- Blender 5.1.2, Eevee, fresh `--background --factory-startup` processes.
- Syntax check exited 0. Generation PID **28790** exited **0**. Read-back
  inspection PID **28982** exited **0**. Wrapper exited **0**.
- Attempt started `2026-10-20T15:16:50Z`; finished `2026-10-20T15:16:58Z`.
- Exact source snapshots, command arguments, versions, PIDs, non-secret
  environment, raw stdout/stderr, and pre/post hashes are retained in the
  attempt directory. Source fence was unchanged.
- Twelve native-view source renders and one three-quarter render completed.
  The native and enlarged sheets plus the three-quarter PNG were inspected.
- Copperskiff has **32 editable mesh objects**, **1,812 base/evaluated triangles**,
  and **8 materials**, meeting the proposed 1,500–3,000-triangle count target.
- Its GLB has **1 scene, 44 authored nodes, 32 mesh definitions, 11 animation
  tracks, and 12 channels**, with no unexpected nodes or image textures.
- Coilblade and Mossguard's regenerated explicit geometry hashes match round
  one. Their individual `.blend` and `.glb` files are byte-identical copies.

The saved individual Copperskiff file was reopened in a separate process. Its
default camera is `ME_20261020_copperskiff_sprite_south`; the other three named
cardinal cameras are present. Reopened pitch measured 49.999994–49.999996° and
orthographic scale 8.0249996. The origin measured `(32, 54)` native pixels within
0.000011 px. The file's SHA-256 stayed unchanged after inspection.

The new projection receipt covers **48** cardinal/source-pose combinations.
All pass the 1.5% crop guard with maximum anchor error `1.94e-7` in normalized
coordinates. This replaces the previous projection receipt for the revised
Copperskiff; it does not retroactively qualify that receipt.

Idle alpha bounds at threshold 16 are **8×13 px** north/south and **11×12 px**
east/west. At threshold 128 the cores are **6×12** and **9×12 px**, respectively.
Contact bounds extend up to 15 px high. These measurements describe the pixels;
they do not establish recognition, team readability, or motion quality.

## Frozen identities

| File | SHA-256 |
| --- | --- |
| `build_models.py` | `a544542f99b666739f75df6a2e3dc8d39bd19e957d5a193e84d8fa85f294bc89` |
| `copperskiff_model.py` | `d63e33089901011f68b3e274010bfafb56cf42f1b8745d04ecb58a3128ea9c8a` |
| `copperskiff.blend` | `95f12a699e8dbcc9d782a20e5245267b69a54e3c541276a4eb0c1eb26e16d72f` |
| `copperskiff.glb` | `69e428411ca8ef26f1d11f79bdf60e59ebbbf5f53aab49402f80483920549e26` |
| Native preview sheet | `9cc4be2e99a7501cfbdc6c4043de84a849bc8901d6380bd87af61cbaed3824a7` |

## Outstanding qualification

Fresh independent critique must decide whether the revised form preserves
Copperskiff's identity and improves the boat, team zone, facing, and contact read.
No new actual-arena composite, grayscale team check, final outline, team ring,
full atlas, complete animation suite, or runtime integration is claimed.
Coilblade and Mossguard's earlier visual and triangle-count failures remain open.

The larger suspension separation and shorter envelope depart from the initial
literal proportion targets; this tradeoff is documented in [design-notes.md](design-notes.md).
Those notes are the pre-execution source snapshot. This delivery records what
subsequently ran. Original names, lore, mechanics, statistics, and audio remain
unchanged, and no reference asset was imported.
