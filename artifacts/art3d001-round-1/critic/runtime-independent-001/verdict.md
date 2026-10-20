# ART-3D-001 independent model critique

Verdict: **FAIL — revise before qualification.** The most decisive counterexample is Copperskiff at the requested 13 px battle scale: its expected pale lens over a small copper boat collapses into a cream oval, with the hull and rigging no longer readable. In north/south views the alpha core measures 6×11–12 px; on the actual arena image the sprite is almost lost against the ground. This fails its dominant read and the small-team-readability bar.

The rendered black-silhouette sheet supports the same result without relying on palette color. Coilblade remains a thin fencer, especially from east/west, but the scarf tails and bell character cues are weak at 13 px and the rest pose reads upright rather than as the specified fencing lunge. Mossguard stays broad in north/south views (17×12–13 px), but its round shield-and-leaf mass collapses into a low blob; it has no visible 2 px team ring or crest. The six-unit arena composite makes all three hard to pick out at 1×. The team-colored renders do not provide a robust independent team read at this size.

Pose check: the sampled Coilblade and Mossguard walk/contact frames change their silhouettes. Copperskiff’s idle, float-loop sample and contact sample look effectively identical at 13 px, with no legible attack cue. The three sampled frames are not a full animation review. The brief’s team grayscale check, solid/notched foot rings, crest, and 1 px outline are not demonstrated in the candidate output.

The independent runtime opened the saved combined `.blend` and successfully wrote all **30** 256×256 renders (four directions for both team colors, plus south idle/walk/contact samples). Those images were box-downsampled 4:1 to 64×64 cells, targeting a 13 px body. This is a visual critique render, not live-game integration. Candidate and source hashes matched before and after. Blender exited **1** only while serializing the final inspection JSON (`TypeError: IDPropertyArray is not JSON serializable`); the render PNGs are intact. Because the audit JSON did not save, this run does not verify the saved camera/individual `.blend` scene summary or record final pivot measurements. The existing projection receipt has a source-side pivot discrepancy (measured y=0.654149 vs handoff y=0.84375); treat it as a warning until the saved-camera and anchor data are captured correctly.

Other measurable gaps from the source manifest/file audit:

- Base triangles: Coilblade **8,604**, Mossguard **5,192**, Copperskiff **8,356**, all above the brief’s 1,500–3,000 target. Evaluated counts are 9,668 / 5,904 / 8,356.
- No distinct LOD-S mesh or small-detail treatment was found; the 13 px check uses the same geometry as the larger output. No inverted-hull outline is present.
- Source bounds show Mossguard width about **1.037 BU** vs 1.15 target; Copperskiff length about **1.367 BU** and height about **0.974 BU** vs 1.20 and 0.85 targets. Coilblade bounds are approximately 0.688 BU wide by 1.177 BU tall.

Positive evidence: the candidate manifest names Astra’s procedural geometry, pinned identity source commit `c693d0cc0b36a3f1f179bbb93cb23998b68012b8`, generator SHA-256 `d243516258802c67925455a7980661d4dd1c7bb54a8c443c2381308dd5b6f5b3`, and palette SHA-256 `44c93283d6dee1e6e43d0c204ef77c4d10f65e25845ad87a7cfa31a4bae9d58c`. The file audit found the GLBs use authored `ME_...` nodes and contain no external images. Source manifest triangle and bounds counts are measurable. These strengths do not clear the rendered silhouette/team-read failures.

Evidence files in this directory:

- `battle-lineup-native-13px-opposed.png` — both teams on the painted arena at 1×.
- `blind-silhouette-native-13px-4-directions-3x.png` — black alpha silhouettes, labeled, nearest-neighbor enlarged for inspection.
- `native-13px-turnaround-pose-sheet.png` — native 64×64 cells from all 30 renders.
- `native-13px-turnaround-pose-4x.png` and `pose-check-native-13px-4x.png` — nearest-neighbor inspection sheets.
- `team-identity-river-13px-2x.png` and `team-identity-ember-13px-2x.png` — team-color renders on a neutral matte.
- `runtime-independent-001/command.json`, `pid.txt` (25737), `exit-code.txt` (1), `stdout.raw.txt`, and `stderr.raw.txt` record the exact run and its serialization failure.
- `before-sha256.json` and `after-sha256.json` match for the candidate models, manifest, palette, and generator source.

No candidate files were edited. This verdict does not claim runtime integration.
