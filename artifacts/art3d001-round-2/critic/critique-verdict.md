# ART-3D-001 Round 2 independent critique

**Verdict: FAIL at the three-model/native-thumbnail gate.** Copperskiff's saved camera and shared ground anchor pass, and its triangle count meets the proposed target. Its identity, team-zone and facing reads remain too weak at the native 13-pixel scale. Coilblade and Mossguard have separate editable and portable files and existing three-quarter renders, but no evidence in this candidate qualifies their native cardinal/team reads.

## Independent Copperskiff evidence

A fresh Blender 5.1.2 `--background --factory-startup --disable-autoexec` process rendered 16 views from the candidate's saved `copperskiff.blend`: N/E/S/W × River/Ember × idle/contact. It ran as PID 36167 from 2026-10-20 15:51:47 to 15:51:53 UTC and exited 0. The raw renders are in `raw-256/`; `native-64/` and `tile-context/` contain the 4× alpha-weighted reduction to a fixed 64×64 cell and the corresponding original arena crop. No crop or per-view rescale was applied. The pixel sheets were inspected at native size and nearest-neighbor enlargement.

- Saved cameras are orthographic, at 49.999994° elevation and 8.0249996 scale. The origin projects to (128, 216) in each 256×256 output, or (32, 54) in each 64×64 cell; the largest directional anchor variation is under 0.00005 pixel. All projected mesh bounds are crop-safe.
- Idle alpha bounds at threshold 16 are 8×13 px north/south and 11×12 px east/west; threshold-128 cores are 6×12 px and 9×12 px. This is approximately the requested native 13-pixel character height.
- In the actual tile context, the pale envelope reads as a small bulb on a narrow copper stem. The hull/boat silhouette does not separate clearly from the envelope at this size. River and Ember variants are nearly indistinguishable; the TEAM material appears only on the hull belt and leaf pennant, which do not make a dependable team zone at native size. North and south idle silhouettes have 0.976 intersection-over-union (only two binary silhouette pixels differ); east/west are more distinct at 0.851.
- Contact animation does alter pixels: compared with idle, 88–104 visible native pixels change for each direction/team pair. At this scale the side views show only a few pale puff pixels and the head-on views mostly a small body shift; the contact cue is not reliably legible as an impact.

The Copperskiff model has 32 editable mesh objects and 1,812 base / 1,812 evaluated triangles, within the proposed 1,500–3,000 triangle target. The candidate manifest reports a GLB with 44 authored nodes, 32 mesh definitions, 11 animations and 12 channels, with no unexpected nodes or external images. Its individual `.blend` and `.glb` were present.

## Other first-three models and size target

The existing Coilblade and Mossguard three-quarter renders show a brass armored figure with a small weapon and a wooden/leaf guardian with a leaf shield, respectively. They are useful hero views, but there are no current 13-pixel cardinal/team thumbnails or independent camera/anchor measurements for these unchanged models. Their actual counts recorded in the candidate manifest are:

- Coilblade: 8,604 base / 9,668 evaluated triangles — above the proposed 1,500–3,000 target.
- Mossguard: 5,192 base / 5,904 evaluated triangles — above the proposed target.

Those counts are reported as unmet proposed targets, not substituted for visual evidence. All three individual `.blend` and `.glb` files are present. The candidate manifest marks Coilblade and Mossguard as unchanged copies from Round 1.

## Execution fence and scope

The independent runner source and candidate inputs were hashed before launch; `runner-source-inputs-prelaunch.sha256` and `runner-source-inputs-postrun.sha256` are identical. The saved `.blend` hash in the audit is also identical before and after: `95f12a699e8dbcc9d782a20e5245267b69a54e3c541276a4eb0c1eb26e16d72f`. Blender version, argv, environment allowlist, PID, raw stdout/stderr and direct exit code are retained beside the renders. Candidate inputs were not edited.

This verdict covers the first three models and native thumbnails. It does not require full atlases, complete animation suites, live integration, the whole cast or video evidence.

## Evidence files

- `blender-audit.json`, `blender-stdout.txt`, `blender-stderr.txt`, `argv.txt`, `environment.txt`, `direct-exit-code.txt`
- `raw-256/`, `native-64/`, `tile-context/`
- `native-64-sheet-4x.png`, `tile-context-labeled-4x.png`, `silhouette-on-arena-4x.png`
- `native-bounds-and-context.json`, `runner-source-inputs-prelaunch.sha256`, `runner-source-inputs-postrun.sha256`, `other-candidate-files-postrun.sha256`

**Uncertainty:** Coilblade and Mossguard were not independently rendered at native scale in this bounded run, so they are unqualified here rather than declared visual failures based on missing images. The Copperskiff contact judgment compares the idle frame with one contact frame; it does not assess timing or a full animation cycle.
