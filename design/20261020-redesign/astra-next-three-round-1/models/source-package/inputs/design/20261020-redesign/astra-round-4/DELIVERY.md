# Copperskiff R4 delivery — independent visual verdict pending

Root executed the prepared runner without source changes in
[`attempt-20261020T172856Z-81044`](generated/attempt-20261020T172856Z-81044/),
2026-10-20 17:28:56–17:29:14 UTC. Blender 5.1.2 generation PID **81072**,
saved-scene inspection PID **81118**, and wrapper PID **81044** all exited **0**.
EEVEE, AgX, the exact palette, and the fixed camera contract were retained.
No further rendering occurred during this file-only delivery.

All **33 actual 256×256 RGBA renders** are present: 24 idle, eight selected
contact, and one quarter view. The 32 derived native cells are exactly 64×64;
six comparison sheets are additional derived images. The six model file
hashes and all 64 raw/native sprite hashes match the execution manifest.
The source snapshot, current prepared sources, R3 controls and pre/post fences
also match. Compile caches are excluded from the frozen delivery list.

**No visual PASS is claimed.** The builder inspected the native massing,
team/contact and paired-team sheets, plus the supplementary 4× massing sheet
and quarter view. The next independent critic decides whether opposite-heading
recognition and the previously earned boat/team/contact reads hold.

Native evidence:

- [Massing and black silhouettes](generated/attempt-20261020T172856Z-81044/comparison/massing-comparison-native.png):
  columns N/E/S/W; rows R3 control, wedge hull, notched stern, tapered canopy,
  followed by the same four silhouette rows.
- [Both teams](generated/attempt-20261020T172856Z-81044/comparison/team-comparison-native.png):
  river/ember row pairs in the same model order.
- [Selected team/contact](generated/attempt-20261020T172856Z-81044/comparison/selected-team-contact-native.png):
  river idle, ember idle, river contact, ember contact.
- [Selected quarter view](generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/three-quarter.png)
  is a model inspection image, not native-size qualification.

| Variant | Editable meshes | Evaluated triangles | Materials | Native views |
| --- | ---: | ---: | ---: | ---: |
| `wedge_hull` | 25 | 1,218 | 8 | 8 |
| `notched_stern` | 25 | 1,262 | 8 | 8 |
| `tapered_canopy` — provisional | 25 | 1,014 | 8 | 16 |

All three GLB receipts record one scene, 35 nodes, 25 mesh definitions, eight
animation tracks and nine channels, with no unexpected objects or external
images. These counts are below the original 1.5k–3k triangle proposal; geometry
was not added merely to reach its lower bound.

The selected saved scene reopens with the south sprite camera active, 25
authored meshes and no foreign meshes. Its four saved cameras measure
49.9999939–49.9999965°, orthographic scale 8.0249996185, and the (32,54)
native ground anchor within **0.0000105 px**. Each variant's 48 staged
pose/view projections stays within the crop guard; maximum anchor error is
1.6391277313e-7 UV. See the
[saved-scene receipt](generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/saved-asset-inspection.json).

All variants and both teams retain R3's alpha≥16 idle bounds exactly:
N **14×15**, E **17×12**, S **14×13**, W **17×12 px**. No view was refitted,
cropped or enlarged. For the selected variant, fixed-anchor alpha≥16 masks
have N/S IoU **0.604938** with 64 changed pixels and E/W IoU **0.582278** with
66 changed pixels. Those are mask measurements, not proof that a viewer can
identify heading. Full thresholds, size deltas and targets are in
[heading-measurements.json](generated/attempt-20261020T172856Z-81044/comparison/heading-measurements.json).

The selected editable assets are
[tapered_canopy/copperskiff.blend](generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/copperskiff.blend)
and
[tapered_canopy/copperskiff.glb](generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/copperskiff.glb).
Exact SHA-256 identities:

| Artifact | SHA-256 |
| --- | --- |
| Wedge `.blend` | `f6d998d514e9cf9937fb11f4452b37e7632f1b1d93559db88eb1c2f963afaf65` |
| Wedge `.glb` | `5cabac10011278337ce7b0d9fe0cddffe74be43e06b0d8126b666cf2501a0d57` |
| Notched `.blend` | `0d218bbfa0f4821f1f5355138f01d6f70235304b8adaf8479b67947acce67724` |
| Notched `.glb` | `848d5b3908862ab489d021a8cdf770edde43696f4e79a539ebf5b715d3827c1b` |
| Tapered `.blend` | `3c4b0fe72fac569a575e02ac142d8d838b74a734a95f0ba2e5f2a9fd343cffac` |
| Tapered `.glb` | `fdef3262b550903f512337442e10b51ffd4d869b6505f0c9c93f5cfd118dd500` |
| Model source | `ee2a847414de7918bd11c78faa8005de612452a6ec6911424560a73706e587b3` |
| Entry source | `e2e41c49095336397ff1fd89196b4a252c1a7c06032e21a2021ce5bd5c527d13` |
| Prepared source list | `c175562af8320bfbb18f249a890c9a70c2352d81d23649f5ee161306245ba591` |
| Frozen delivery list | `c8d2a70389ef1e669cb2e072e38d51136c0cd01f20db4dec96979bcdb5209e7e` |

The [execution manifest](generated/attempt-20261020T172856Z-81044/comparison/manifest.json)
records all source/model identities, explicit geometry hashes and counts.
The [126-file frozen list](generated/attempt-20261020T172856Z-81044/frozen-sha256.txt)
covers sources, models, raw renders, native images, sheets, receipts and logs;
it excludes itself and compile caches. `delivery-*-check.txt` files preserve
the subsequent file/hash verification.

The prelaunch design documents remain byte-identical and retain their
historical UNRENDERED status; this delivery records the actual later execution.
Original identity, lore, role, stats, audio, R3 controls and earlier attempts
remain unchanged. Coilblade and Mossguard remain unqualified and untouched.
No full atlas, game integration, UI edit or shipped-art acceptance is included.
