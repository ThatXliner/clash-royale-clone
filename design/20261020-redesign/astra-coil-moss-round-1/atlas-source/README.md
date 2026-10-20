# Mossguard and Coilblade sprite atlases

This payload packs 24 accepted original fixed-frame renders for Mossguard R1 and 24 accepted frames for the independently selected Coilblade R3 variant B. The source frames cover River and Ember teams, idle/walk/contact poses, and north/east/south/west actor-facing headings.

The atlas PNGs use 64×64 cells on a 256×384 transparent canvas. Columns are east, north, south, west. Rows are River idle, River walk, River contact, Ember idle, Ember walk, Ember contact. Each cell keeps the source crop and shared ground pivot `(32, 54)`. The source camera contract is 50° elevation and orthographic scale 8.025. Team colors are baked from the source renders.

The builder reads only the copied `inputs/raw-256/` sources and `source-map.json`; it uses only the Python standard library. It verifies every copied source SHA-256, RGBA8 dimensions, PNG CRCs, and the embedded sRGB/gamma/chromaticity profile before reduction. Each output pixel is the source renderer's deterministic 4×4 alpha-premultiplied area average, rounded to nearest with ties to even. All 48 reduced cells were compared pixel-for-pixel with their review-approved 64×64 renders. The output PNG uses RGBA8, non-interlaced rows, filter 0, zlib level 9, and sRGB/gAMA/cHRM profile chunks. Source metadata chunks are not carried into the atlas.

Rebuild from this directory:

```sh
python3 scripts/build-moss-coil-atlases.py
```

To build to a separate directory:

```sh
python3 scripts/build-moss-coil-atlases.py --output-dir /tmp/moss-coil-atlas-check
```

`source-map.json` records every raw 256×256 source path/hash and the corresponding review-approved 64×64 path/hash. The `evidence/` directory carries the review manifests, source render receipts, Coilblade selection report, and project license used for the provenance record. `atlases/provenance.json` records output sizes and hashes, exact cell mapping, source evidence hashes, encoding, authorship, and license.

The artwork is original Moss & Ember project art and is licensed under GNU AGPL-3.0-only. The review scope is standalone art and pose approval; this payload does not claim live renderer integration or motion acceptance. A separate critic must judge the rendered atlas output before visual acceptance.
