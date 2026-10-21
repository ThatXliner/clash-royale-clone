# Fresh critic commands — wait for root runtime grant

Evaluate only the saved R4 artifact against BAR.md. Builder source/acceptance claims are not a verdict. R547 and R545 remain FAIL. Do not author, save or export a model, edit the frozen sources, or change any threshold.

The renderer intentionally restricts --output to the candidate attempt. Use the fresh reserved subtree `candidate/attempt-01/critic-r4-newoutputs/` for portrait/native outputs. This creates new critic files; every path already listed in CANDIDATE-MANIFEST.json must remain byte-identical. Keep the verification output and separate review ledger under top-level `critic-r4/`. All destinations below must be absent before their respective first invocation.

After root explicitly grants runtime, run these commands separately and capture stdout/stderr in fresh critic logs:

```sh
SKYMAUL_CORE_R4_RUNTIME_GRANT=1 /Applications/Blender.app/Contents/MacOS/Blender --background /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/candidate/attempt-01/model/skymaul.blend --threads 2 --python-exit-code 1 --python /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/author_rim_depth.py -- verify-saved --attempt /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/candidate/attempt-01 --output /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/critic-r4/verification
```

```sh
SKYMAUL_CORE_R4_RUNTIME_GRANT=1 /Applications/Blender.app/Contents/MacOS/Blender --background /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/candidate/attempt-01/model/skymaul.blend --threads 2 --python-exit-code 1 --python /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/render_saved_rim_derivative.py -- portrait --attempt /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/candidate/attempt-01 --output /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/candidate/attempt-01/critic-r4-newoutputs/portrait
```

```sh
SKYMAUL_CORE_R4_RUNTIME_GRANT=1 /Applications/Blender.app/Contents/MacOS/Blender --background /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/candidate/attempt-01/model/skymaul.blend --threads 2 --python-exit-code 1 --python /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/render_saved_rim_derivative.py -- native --attempt /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/candidate/attempt-01 --output /Users/me/.codex/clash-qualification/20261021-skymaul-core-round-4/candidate/attempt-01/critic-r4-newoutputs/native
```

The frozen native wrapper compares its portrait to the first retained builder portrait using exact decoded dimensions/RGBA, and records encoded PNG-byte equality separately. Independently compare the fresh critic portrait and masks to each other and to the first portrait; no source edits are needed. Preserve original threshold128 whole-core semantic membership and exact support-set comparison. Assess actual full portrait identity and brightness from pixels.

The unchanged native measurement implementation is the sealed R2 `source-package/scripts/skymaul_metrics.py`; its --attempt interface assumes child `renders/`, `model/every-frame-crop.json`, and creates a new `measurements/`. Never run it over the sealed attempt again because that would collide with existing outputs. For independent remeasurement, a fresh lightweight review layout under top-level `critic-r4/` can point to the new critic native directory and fresh verification crop JSON, then run that same implementation without copying model files or altering script/gates. Alternatively prove every decoded fresh native/semantic image equal to its measured sealed candidate counterpart, and inspect the unmodified286-gate evidence alongside the actual fresh images. Record the method explicitly.

Before and after review, hash every existing manifest entry and source-freeze entry. Do not treat newly created files beneath the explicitly reserved critic output subtree as mutations to the sealed entries. All old candidate paths, source files, BAR, pins, Blend, GLB, and R2/R3 artifacts remain immutable. Close every owned Blender process before releasing runtime. Protected user GUI63639 is not critic-owned. No Node/Chrome needed.
