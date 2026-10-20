# Native R1 state-hash investigation

The full recorded after-state hashes are reproduced exactly by changing only **positive zero to negative zero in local Euler Y rotations**. No metadata exclusion caused the discrepancy. The assertion uses Python recursive value equality, which considers `0.0 == -0.0`; the separate JSON digest distinguishes their serialized tokens. Thus `exact_equal: true` is not a bitwise or serialized-state equality guarantee.

No Blender, bpy, Node, browser, or render ran during this investigation. No model, canonical evidence, or generator source was edited. The input hashes match before and after the investigation; saved Blend and GLB bytes also match their original build receipts.

## Exact field differences

Every listed object changes these paths from JSON token `0.0` to `-0.0`:

- `/objects/<object>/transform/rotation_euler/1`
- `/integer_frame_local_poses/<frame>/<object>/rotation_euler/1`, for **every integer frame 1 through 106**.

| Character | Object suffixes after `ME_SBR_R1_<card>_` | Object fields | Pose fields | Total scalar differences |
| --- | --- | ---: | ---: | ---: |
| Skymaul | `body`, `head`, `left_arm` | 3 | 318 | 321 |
| Brassbolt | `body`, `crossbow`, `head`, `left_leg`, `quiver`, `right_leg` | 6 | 636 | 642 |
| Reedsting | `body` | 1 | 106 | 107 |

`field-diff.json` enumerates every one of the 1,070 exact JSON paths and both tokens. `findings.json` records each saved Blend byte offset, affected frames, phase checks, and section digests.

The observed saved `Object.rot[1]` floats have little-endian bytes `00 00 00 80`, IEEE-754 negative zero; the canonical positive-zero values encode as `00 00 00 00`. The saved bytes were read without Blender, using the file's SDNA schema and validated `Object`/`ID` structure sizes (1,288 and 408 bytes). For example, Skymaul body's Euler Y is at byte offset 28,920, Brassbolt body's at 36,558, and Reedsting body's at 32,100.

## Full digest reproduction

| Character | Canonical before-state SHA-256 | Reconstructed complete after-state SHA-256, identical to original receipts |
| --- | --- | --- |
| Skymaul | `ca91e636d767e4dc4ef17ba007a25b870552297a65c2edf33b2a0de222086406` | `004a73863be294bd7e815a5e64d17a4907209c57de57a9f91b2f53cf213addab` |
| Brassbolt | `15065efafbd5d0398257689d9ca79bc2675c5a1d5c0d73605e4ad5683e1d5ed2` | `ea694b26d36d369af2b996630c78ecd89826db12c0f2f0eae2377ac20b9e82df` |
| Reedsting | `f23858e2cedc82287a66abaeaa2e7ac194ba9d25a972f9a33d65039eb7559a35` | `8ff08d9a71fb54aff6f7cf138810f78fb931eace7413229cc785238bce6a54a7` |

For each character, that exact reconstructed digest matches **after export, after save, saved-scene load, and after all renders**. The mask-restoration before/after hashes both match the exported representation. The first recorded divergence is therefore the export boundary; no additional recorded state change occurs in save, load, mask restoration, or the final render restoration.

The reconstruction keeps every other field untouched. It produces the complete recorded after-state digest, not merely a hash of the changed fields. Within this recorded schema, the `meshes` and `materials` sections are serialized-byte identical before and after, as are cameras, animation-track settings, view settings, render settings, active camera, and team variant. Only the two object/pose sections differ. Zero's sign does not change the numerical angle, but the strict representation did change and must not be described as bit-for-bit preservation.

## Why the assertion passed

In the immutable generator's `scripts/pipeline.py`:

- `digest` at line 24 hashes `json.dumps(..., sort_keys=True, separators=(',', ':'), allow_nan=False)`.
- `assert_exact` at lines 270–276 separately writes both hashes and `before == after`.
- It raises and saves complete before/after JSON only when `before != after`.

Python equality equates signed zeros, so the guard does not reject the differences above. It can also equate some different numeric types, but **no type change is needed to reproduce this run's hashes**. There is no explicit metadata-only filter in that comparator. It compares the whole extracted state using value equality, and therefore could miss signed-zero representation changes in geometry or material values too; this run's exact reconstructed difference is confined to the listed rotation fields.

The installed Blender NLA exporter saves `blender_object.matrix_world.copy()` at `tracks.py:140` and assigns it back at `tracks.py:292`. This matrix-restoration path is a concrete source mechanism consistent with Euler signed-zero changes during export. The packet does not claim an executed-line trace of Blender's matrix decomposition: no new runtime instrumentation was authorized. The actual mismatch fields and complete hash reproduction are direct file-based evidence independent of that implementation explanation.

## Retention limits and claim boundary

The original run retained `canonical-state.json`, all proof digests, and saved Blend/GLB files. It **did not retain complete post-export/post-save JSON**, because the writer only saves those when Python value equality fails. The after-state here is a reconstruction bound to the original full SHA-256 digests and independently observed saved Object float bits; it is not a fresh Blender state capture.

This resolves the recorded mismatch without weakening a gate or normalizing evidence. It proves no meaningful nonzero geometry/material difference is needed anywhere in the captured state to account for the original after-state hashes. It does not expand the original snapshot schema to unrecorded Blender properties, or establish visual acceptance, live-runtime behavior, or future-run preservation. The original `exact_equal` flags remain numerically accurate but insufficient for the promised strict byte/representation invariant.

No repair was made. A future comparator must reject unequal serialized representations (or compare float sign/type explicitly) and retain the complete after-state regardless of Python equality. It must not normalize the observed mutation to make this old run pass a stricter gate.

## Reproduce using files only

```sh
python3 /Users/me/.codex/clash-qualification/20261020-astra-sbr-preservation-investigation/investigate.py
```

The script reads immutable inputs, validates saved model hashes and SDNA field layouts, checks every relevant object transform component, applies only the observed signed-zero differences to an in-memory copy, lists all scalar paths, reproduces all phase hashes, and writes this investigation's JSON outputs. It refuses any nonzero value difference or nonconstant sampled field. It never imports bpy, runs Blender, or writes into the source/model package.
