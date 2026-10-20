# Repaired R3 comparison: generated and frozen

**Actual model exports and 33 previews completed. Independent visual critique
remains pending.** The heavy runtime slot has been released.

Candidate directory:
[`generated/attempt-20261020T165935Z-71930/comparison/`](generated/attempt-20261020T165935Z-71930/comparison/).

## Repair and execution

The original root-run attempt at
`/Users/me/.codex/clash-qualification/20261020-model-r3-builder-root/generated/attempt-20261020T165717Z-71361`
exited **134** before rendering. Its native Blender error was
`std::out_of_range: stoi: out of range`, with object-name splitting in the crash
stack. That failed attempt, the crash report, and the original R3 source remain
untouched.

This separate repair changes only generated names for canvas bindings and
supports: stable enumeration replaces float-coordinate text. See
[naming-repair.diff](naming-repair.diff). Geometry expressions, parameters,
palette, lighting, camera setup, renderer, and inspector sources are unchanged.

The new run used Blender **5.1.2**, Eevee, isolated
`--background --factory-startup --disable-autoexec` processes and a clean
allowlisted `PATH`, `LANG`, `LC_ALL`, and `TZ` environment.

- Syntax check exited **0**.
- Generation PID **71953** exited **0**.
- Saved-scene inspection PID **72037** exited **0**.
- Wrapper PID **71930** exited **0**.
- Started `2026-10-20T16:59:35Z`; finished `2026-10-20T16:59:52Z`.
- Source hashes match before/after. Exact source snapshots, argv, versions,
  environment receipt, PIDs, raw stdout/stderr, and exits are retained.
- All **32** native-view source renders plus **one** three-quarter render
  completed. Native and enlarged comparison/team/contact sheets and the
  three-quarter PNG were inspected.

## Reviewable outputs

| Alternative | Editable model | Portable model | Triangles | Meshes |
| --- | --- | --- | ---: | ---: |
| Umbrella barge | [BLEND](generated/attempt-20261020T165935Z-71930/comparison/umbrella_barge/copperskiff.blend) | [GLB](generated/attempt-20261020T165935Z-71930/comparison/umbrella_barge/copperskiff.glb) | 1,240 | 25 |
| Exposed deck, provisional selection | [BLEND](generated/attempt-20261020T165935Z-71930/comparison/exposed_deck/copperskiff.blend) | [GLB](generated/attempt-20261020T165935Z-71930/comparison/exposed_deck/copperskiff.glb) | 1,240 | 25 |
| Split canvas | [BLEND](generated/attempt-20261020T165935Z-71930/comparison/split_canvas/copperskiff.blend) | [GLB](generated/attempt-20261020T165935Z-71930/comparison/split_canvas/copperskiff.glb) | 1,768 | 28 |

Each has eight materials and one GLB scene with only authored nodes and no
image textures. GLBs contain 35 / 35 / 38 nodes respectively, with eight
animation tracks and nine channels each. The two 1,240-triangle alternatives
are below the initial 1,500-triangle lower target; no extra detail was added
solely to inflate the count.

- [Native massing and silhouette comparison](generated/attempt-20261020T165935Z-71930/comparison/massing-comparison-native.png)
  · [4× inspection](generated/attempt-20261020T165935Z-71930/comparison/massing-comparison-4x.png)
- [Native team comparison](generated/attempt-20261020T165935Z-71930/comparison/team-comparison-native.png)
  · [4× inspection](generated/attempt-20261020T165935Z-71930/comparison/team-comparison-4x.png)
- [Native selected team/contact comparison](generated/attempt-20261020T165935Z-71930/comparison/selected-team-contact-native.png)
  · [4× inspection](generated/attempt-20261020T165935Z-71930/comparison/selected-team-contact-4x.png)
- [Selected three-quarter render](generated/attempt-20261020T165935Z-71930/comparison/exposed_deck/three-quarter.png)
- [Manifest with model, source, image, control, and pixel-bound receipts](generated/attempt-20261020T165935Z-71930/comparison/manifest.json)
- [Saved selected-file camera inspection](generated/attempt-20261020T165935Z-71930/comparison/exposed_deck/saved-asset-inspection.json)
- [Frozen file hashes](generated/attempt-20261020T165935Z-71930/frozen-sha256.txt)

Columns are N/E/S/W. The massing sheet's first four rows are R2 control,
umbrella barge, exposed deck, and split canvas; the following four rows are
their black silhouettes. The team sheet pairs river/ember rows for those same
four entries. The selected contact sheet is river idle, ember idle, river
contact, ember contact. R2 control images were read unchanged, not rerendered.

## Fixed projection confirmed

All alternatives used the same 50° camera, orthographic scale 8.025, and
native ground anchor (32,54), with no per-view or per-variant fitting or crop.
Each new projection receipt covers 48 staged pose/direction combinations with
the 1.5% crop guard and maximum normalized anchor error `1.64e-7`.

The selected `.blend` was reopened in a separate process. Its four saved
camera pitches measured 49.999994–49.999996°, scale 8.0249996, and ground anchor
within **0.000011 native pixel** of (32,54). Its default camera is the saved
south sprite camera. No foreign mesh was found, and the file hash did not
change during inspection.

## Source and candidate identities

| File | SHA-256 |
| --- | --- |
| Comparison entry, unchanged | `73b5836a48ca9146035ae4ae5de0d3db9759f02349f5f83a3b616fab5866a0cb` |
| Repaired model module | `2cbdabd912dbcc26062f1e79bb04ea4d0d5ab7eaec0570ac79b88df873f47b32` |
| Exposed-deck `.blend` | `299ec67386e6b2c8c8fb74d6e371f17f9e66b09fbb05385132ba46fc60fabd1c` |
| Exposed-deck `.glb` | `c8c008bddb9147fe0d74e1547b0ef4799a658a7131689f7a39dbe356c7c6998d` |
| Native massing sheet | `12511f4134e3a26f5a5c2c6d771d8e602d817cdcbeed3804683c2b11fb40e572` |

## Limits

This clears the generator crash and produces the planned comparison. It does
not establish class recognition, team readability, facing, contact quality,
or a visual PASS. The provisional exposed-deck choice remains subject to the
independent critic; the source pixel budgets remain targets rather than
automatically satisfied claims.

Coilblade and Mossguard were not changed or rebuilt. No full atlas, complete
motion suite, actual-app sprite-window/CSS integration, arena capture, or
runtime adoption is claimed. The parent’s future fixed viewport/display-size
contract remains separate from this fixed native comparison.
