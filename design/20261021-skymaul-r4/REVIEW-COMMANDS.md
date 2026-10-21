# Reserved package/atlas commands — no execution yet

These are the first atlas/package BAR only. The later 96-state live contract is still a proposal. Root must grant runtime separately. No Node/Chrome is required. Run serially, retain all exits/stdout/stderr, and close each owned Blender before the next command. The unrelated user Blender GUI is never touched.

Use the following literal task paths; each output must be absent. If a path already exists, stop and ask root to pin a new attempt path rather than overwrite it. For the relocation proof, execute with working directory `/private/tmp`.

```sh
SKY_ROUND=/Users/me/.codex/clash-qualification/20261021-skymaul-atlas-source-proposal
SKY_CANDIDATE="$SKY_ROUND/candidate/attempt-01"
SKY_RELOCATED=/private/tmp/20261021-skymaul-r4-portable-proof-01
```

Materialize only the 48 pinned existing inputs and the explicitly listed new source/docs. The construction tool's original absolute paths are used only at this step, outside the portable bundle.

```sh
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 python3 "$SKY_ROUND/prepare_bundle.py" --output "$SKY_CANDIDATE/bundle"
mkdir "$SKY_RELOCATED"
cp -R "$SKY_CANDIDATE/bundle" "$SKY_RELOCATED/bundle"
mkdir "$SKY_RELOCATED/proof"
```

The pinned sandbox policy makes all original qualification/repository source directories unreadable to the child and the relocated bundle unwritable. It is loaded by `sandbox-exec` before those restrictions apply. Preserve its hash and commands in the execution receipt. A separate negative read probe should confirm `PermissionError` for the known-existing original R4 model and original R2 native helper while the relocated copies are readable; a missing-file error does not prove sandbox isolation.

```sh
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 /usr/bin/sandbox-exec -f "$SKY_ROUND/RELOCATION-POLICY.sb" /Applications/Blender.app/Contents/MacOS/Blender --background "$SKY_RELOCATED/bundle/model/skymaul.blend" --threads 2 --python-exit-code 1 --python "$SKY_RELOCATED/bundle/source-package/scripts/verify_rerender_r4.py" -- verify --output "$SKY_RELOCATED/proof/verify"
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 /usr/bin/sandbox-exec -f "$SKY_ROUND/RELOCATION-POLICY.sb" /Applications/Blender.app/Contents/MacOS/Blender --background "$SKY_RELOCATED/bundle/model/skymaul.blend" --threads 2 --python-exit-code 1 --python "$SKY_RELOCATED/bundle/source-package/scripts/verify_rerender_r4.py" -- portrait --output "$SKY_RELOCATED/proof/portrait"
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 /usr/bin/sandbox-exec -f "$SKY_ROUND/RELOCATION-POLICY.sb" /Applications/Blender.app/Contents/MacOS/Blender --background "$SKY_RELOCATED/bundle/model/skymaul.blend" --threads 2 --python-exit-code 1 --python "$SKY_RELOCATED/bundle/source-package/scripts/verify_rerender_r4.py" -- native --output "$SKY_RELOCATED/proof/native"
/usr/bin/sandbox-exec -f "$SKY_ROUND/RELOCATION-POLICY.sb" python3 "$SKY_RELOCATED/bundle/source-package/scripts/skymaul_metrics.py" --attempt "$SKY_RELOCATED/proof/native"
SKYMAUL_R4_PACKAGE_RUNTIME_GRANT=1 /usr/bin/sandbox-exec -f "$SKY_ROUND/RELOCATION-POLICY.sb" python3 "$SKY_RELOCATED/bundle/source-package/scripts/validate_portable_outputs.py" --verify "$SKY_RELOCATED/proof/verify" --portrait "$SKY_RELOCATED/proof/portrait" --native "$SKY_RELOCATED/proof/native" --output "$SKY_RELOCATED/proof/completion.json"
```

Do not regenerate the model or export/save a Blend to repair a mismatch. Preserve all failed invocations and exact state/pixel differences. Portable execution must leave every bundle input byte-identical. The fresh outputs are external evidence and are excluded from the bounded shipping bundle.

Assemble two new atlas files from the accepted 24 bundled cells, not from rerendered replacement cells. This isolates lossless packing from portable render reproducibility. Inputs must match `CELL-MAP.json` before and after. Compare both output files' complete bytes and decode/unpack every cell independently with Pillow.

```sh
SKYMAUL_R4_ATLAS_RUNTIME_GRANT=1 /usr/bin/sandbox-exec -f "$SKY_ROUND/RELOCATION-POLICY.sb" python3 "$SKY_RELOCATED/bundle/source-package/scripts/build_atlas.py" --source-dir "$SKY_RELOCATED/bundle/native-64" --map "$SKY_RELOCATED/bundle/cell-map.json" --output "$SKY_RELOCATED/proof/skymaul-battle-sprite.png" --receipt "$SKY_RELOCATED/proof/atlas-receipt.json"
SKYMAUL_R4_ATLAS_RUNTIME_GRANT=1 /usr/bin/sandbox-exec -f "$SKY_ROUND/RELOCATION-POLICY.sb" python3 "$SKY_RELOCATED/bundle/source-package/scripts/build_atlas.py" --source-dir "$SKY_RELOCATED/bundle/native-64" --map "$SKY_RELOCATED/bundle/cell-map.json" --output "$SKY_RELOCATED/proof/skymaul-battle-sprite-repeat.png" --receipt "$SKY_RELOCATED/proof/atlas-repeat-receipt.json"
```

After successful actual checks, retain a compact execution receipt, package manifest, atlas and independent decoder results in the new candidate, seal them, and release all owned processes. Do not copy the native verification render tree into the package. A separate fresh critic gets the immutable package/atlas and fresh external output paths. No live game adoption follows from the builder's completion.
