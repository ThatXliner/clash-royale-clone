# Astra next-three model source package

**SOURCE ONLY — Blender, GLB export, renders, and independent visual review have not run.** This is an isolated proposal package for Skymaul, Brassbolt, and Reedsting. It changes no repository file or runtime asset.

`DESIGN.md` records exact original identity cues, explicit additions, source boundaries, and unexecuted gates. `input-manifest.json` freezes canon from Git commit `90efeb43555d35569a9bb66fab7ea8de83aa5045`. `observed-renderer-input-manifest.json` freezes the separately authorized, previously successful native renderer by its immutable manifest hashes.

Owned sources:

- `scripts/skymaul.py`, `scripts/brassbolt.py`, `scripts/reedsting.py`: independent original editable model and pose generators.
- `scripts/model_common.py`: verified primitive imports, original materials, direct local pivots, named NLA clips.
- `scripts/pipeline.py`: saved common camera, studio, team rings, strict state proofs, projection/triangle/material limits, GLB export validation.
- `scripts/build_models.py`: isolated per-character build/export/save step.
- `scripts/render_saved.py`: fresh reopened Blend rendering for both teams, four headings, idle/walk/contact, masks, body-only silhouettes, portrait; exact state restoration.
- `scripts/measure.py`: raw-pixel checks and native color/grayscale/silhouette/mask sheets, original-atlas portrait comparison HTML.
- `run.py`: serial build/render/measure orchestration and source integrity before/after.

Safe source-only check:

```sh
cd /Users/me/.codex/clash-qualification/20261020-astra-sky-brass-reed-models
python3 run.py --check
```

Ready command **only after the parent grants fresh heavy-runtime access**:

```sh
cd /Users/me/.codex/clash-qualification/20261020-astra-sky-brass-reed-models
python3 run.py --blender /Applications/Blender.app/Contents/MacOS/Blender --runtime-grant 'REPLACE_WITH_FRESH_PARENT_GRANT' --attempt native-r1
```

That command runs one Blender process at a time with two threads, writes only a new `attempts/native-r1/`, and refuses to reuse an existing attempt. It builds and reopens each character before moving to the next. Failure preserves its raw stdout, stderr, argv, PID, and exit receipt and stops dependent work. It does not launch a browser or Node process.

Expected output after successful execution: three per-character Blend/GLB pairs; 108 fresh native 64 px cells (72 color + 24 team masks + 12 body-only); three 512 px portrait studies; raw 256 px source images; state/projection/geometry/export receipts; native and 4× inspection sheets; `comparisons/study.html`. These are expected outputs, **not files claimed to exist now**.

All state preservation compares full unrounded local vertex coordinates, topology, pivots, material inputs, visibility, cameras, and local animation transforms at every integer frame from 1 to 106. No joint is temporarily moved to the origin, no mesh coordinate is rounded, and a failed equality is never normalized away. The common camera contract uses geometric tolerances only for actual measured projection; these do not weaken exact state equality.

The installed Blender 5.1 exporter was inspected as text to verify its NLA track option and merge semantics. It was not executed. The runner pins that inspected source by hash and validates exported clip names in the resulting GLB when execution is authorized.

The independent critic still must judge the actual images: same-character continuity with the painted atlas, recognizable native silhouettes, readable facing, visibly distinct poses, and grayscale team rings. A completed renderer or numeric check is not an art PASS. This package implements no full 12-column runtime animation, gameplay integration, phone/desktop application screenshots, restore qualification, or reduced-motion behavior.
