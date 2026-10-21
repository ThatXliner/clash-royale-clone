# Skymaul R4 original model and reproducible native atlas

Original procedural 3D authorship: Astra, following actual Claude character direction. License: AGPL-3.0-only, the repository's license. No reference assets were imported. See `provenance.json` for exact model/source/round origins and `evidence/function-origins.json` for the unchanged verification functions.

The saved Blend and actor GLB are the independently accepted standalone R4 artifacts (R550). The editable geometry generator and its small shared dependencies are included under `source-package/`. The runtime battle atlas has a separate qualification; this package does not accept live rendering or motion. Painted product card portraits remain unchanged.

`bundle-manifest.json` pins every package file. `cell-map.json` pins the 24 exact native color PNGs, directions, frames 1/51/100, six rows and pivot (32,54). The 48 accepted input copies retain their original bytes. Full state JSON retains unrounded numbers and signed zeros. Historical absolute paths in receipts/origin records are provenance data; none are execution inputs.

The supported reproduction path loads the accepted saved Blend. It never saves, exports or regenerates a model. The original source can be studied and edited in a separately authorized future model round; this package does not claim that a clean procedural rebuild produces byte-identical Blend files.

Requirements: Blender 5.1.2 for saved-model verification/renders, Python 3 for the lossless atlas packer, and Python 3 with Pillow 12.3.0 for the unchanged native metric script. The shared helper files are byte-exact copies; `r3_readonly.py`, `r4_audit_helpers.py` and `r4_portrait.py` retain the listed original function source text exactly. The portable entry point changes input/output plumbing only.

Every entry point requires its explicit runtime grant flag. Set it only after the task owner grants runtime. Use a fresh external output directory for each stage, and run Blender with `--background`, `--threads 2` and `--python-exit-code 1`:

```sh
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 Blender --background <bundle>/model/skymaul.blend --threads 2 --python-exit-code 1 --python <bundle>/source-package/scripts/verify_rerender_r4.py -- verify --output <fresh-output>/verify
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 Blender --background <bundle>/model/skymaul.blend --threads 2 --python-exit-code 1 --python <bundle>/source-package/scripts/verify_rerender_r4.py -- portrait --output <fresh-output>/portrait
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 Blender --background <bundle>/model/skymaul.blend --threads 2 --python-exit-code 1 --python <bundle>/source-package/scripts/verify_rerender_r4.py -- native --output <fresh-output>/native
python3 <bundle>/source-package/scripts/skymaul_metrics.py --attempt <fresh-output>/native
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 python3 <bundle>/source-package/scripts/validate_portable_outputs.py --verify <fresh-output>/verify --portrait <fresh-output>/portrait --native <fresh-output>/native --output <fresh-output>/completion.json
SKYMAUL_R4_ATLAS_RUNTIME_GRANT=1 python3 <bundle>/source-package/scripts/build_atlas.py --source-dir <bundle>/native-64 --map <bundle>/cell-map.json --output <fresh-output>/skymaul-battle-sprite.png --receipt <fresh-output>/atlas-receipt.json
```

The verifier requires exact complete state before and after operations; 848 crop rows and 106 rest/clip checks; the original portrait alpha gates and whole-core threshold128 equality; and exact decoded RGBA against the accepted 24 cells and portrait/masks. Run the unchanged metric script to obtain all 286 required native gates and 28 diagnostics. `validate_portable_outputs.py` requires the actual completed receipts and retains failures. Fresh independent review remains necessary.

Packing copies every RGBA byte in each whole 64×64 cell without filtering or compositing. Its atlas is 256×384, columns east/north/south/west, rows River idle/walk/contact then Ember idle/walk/contact. Ground rings are included. Do not pack the beige-backed measurement sheet or apply another 256→64 reduction. PNG timestamp text can differ for new Blender renders; decoded dimensions/RGBA must be exact. Packing output repeatability is checked separately in the recorded Python/zlib environment.

For portability qualification, copy only this bounded bundle to a fresh location and deny reads of the original external round/repository directories. The verifier must still complete. Keep new output captures outside this source bundle; do not fold the full verification capture tree into the shipped package.
