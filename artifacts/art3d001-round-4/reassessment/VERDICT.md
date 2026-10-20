PIECE: Copperskiff R4 `tapered_canopy` model and native sprites  
VERDICT: PASS

EVIDENCE: I rendered and viewed 16 fresh sprites from the frozen saved scene, covering both teams, four headings, and idle/contact. The 64×64 native cells are shown in the [sprite sheet](/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment/run-20261020T180144Z/selected-team-contact-native.png) and [arena context sheet](/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment/run-20261020T180144Z/selected-team-contact-arena-context-native.png). Both team colors read clearly; contact differs from idle by 139–145 visible pixels per direction. Idle alpha bounds are N 14×15, E 17×12, S 14×13, W 17×12 px; all 16 sprites remain inside their cells.

The stored camera contract is 50° elevation, 8.025 orthographic scale, and ground anchor (32,54). The separate exit-0 saved-scene projection audit measured the evaluated bow and stern through each saved camera:

| Label | Bow minus stern, native pixels (x, top-origin y) | Projected facing |
|---|---:|---|
| East | (+15.2523, −0.8715) | East |
| West | (−15.2523, −0.8715) | West |
| North | (−0.000004, −12.5554) | North |
| South | (0, +10.8125) | South |

All four measured directions match their labels. The [projection receipt](/Users/me/.codex/clash-qualification/20261020-sprite-heading-audit/projection-receipt.json) records the evaluated transforms and same frozen blend SHA. The selected asset records 25 editable meshes and 1,014 triangles; its GLB records 25 mesh definitions, eight animations, and nine channels, with no external images. The [reconstructed render receipt](/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment/run-20261020T180144Z/reconstructed-render-evidence-receipt.json) records the hashes and evidence.

The render process (Blender PID 91459) exited 1 after writing all 16 PNGs because its final JSON serialization failed; the [raw log](/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment/run-20261020T180144Z/blender-stderr.raw.txt) preserves that error. Postprocessing exited 0. All 126 frozen entries passed before and after, input hashes matched, and the Blender executable hash was unchanged. The initial setup failure is also preserved.

BIGGEST GAP: At native scale, fine deck and trim details fade; the boat read depends mainly on the hull outline and its bow and stern markers.
