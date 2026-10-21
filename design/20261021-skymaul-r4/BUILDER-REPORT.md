# APP-REDESIGN-ATLAS-003 — package and atlas evidence complete

Actual execution used the root-pinned first atlas/package BAR and source freeze `eff4a2627536cc6144ac59d8b2556a11e0c54d4815f986d80cfa807c232659ea`. No frozen source, threshold, mask definition or accepted input changed. Every command completed with exit 0; no failed invocation or setup repair occurred. This is builder evidence, not an independent verdict or live-game acceptance.

The package contains exactly 48 accepted input copies plus the declared new source/docs: **63 files, 5,471,644 bytes**, below the 6,291,456-byte cap. Package manifest SHA256 is `8d741df40d8fd7e856e2431e15ecd37f253db1799a1c222980b7b080988a16cb`. Accepted R4 Blend/GLB, geometry source, native cells and both canonical JSON baselines retain exact bytes.

The separate relocated package ran with original qualification/repository reads denied and the copied bundle protected from writes. A negative probe returned actual `PermissionError`, errno 1, for the known-existing original R4 Blend, R2 PNG helper and repo source. The relocated Blend remained readable. All operations completed using relative bundled dependencies.

Fresh saved verification and rendering reproduced:

- 848 crop rows, zero failures; minimum margin 4.1662750244140625 pixels; all 106 rest/clip/hammer checks.
- All 286 required native gates, 28 diagnostics, zero failures.
- Exact decoded RGBA for all 24 accepted native color cells; all 24 PNG files also happen to be byte-identical.
- Exact decoded RGBA for the accepted portrait and both whole-core masks; 8,194 visible and isolated core pixels, zero lost or extra.
- Twelve strict full-state proofs with numeric and canonical-byte identity. No save, export, rebuild, signed-zero normalization or new state exception.

Two independent invocations of the frozen packer used the accepted bundled native cells. Both produced a **27,488-byte, 256×384 atlas**, SHA256 `e6c02d3a0ce4634f060f508cca00f72a729551805536dc0a80930a74bf7b3fcb`. Their provenance receipts are byte-identical too. An independent Pillow decoder compared every full cell, including all edges and transparent RGB: **393,216 RGBA bytes, zero differences**, sRGB intent 0. Columns E/N/S/W, rows River idle/walk/contact then Ember idle/walk/contact, pivot (32,54), frames 1/51/100 are intact.

The atlas is `candidate/attempt-01/atlas/skymaul-battle-sprite.png`; the bounded source/model package is `candidate/attempt-01/bundle`. Compact receipts are beside them. Full raw captures and unrounded before/after state remain at `/private/tmp/20261021-skymaul-r4-portable-proof-01/proof`, outside the shipping bundle and included in the external seal inventory. Command logs and the negative probe are in `runtime-attempt-01`.

Owned Blender processes 2773, 2824 and 3321 exited. Protected processes 739, 4098 and user Blender GUI63639 remain alive. No Node/Chrome process was started. Root HEAD remains `99adf89dc995e00cdfcb353afa561f2abd470fde`; its known normal-index hash remains unchanged. R2/R3/R4 sources and all 48 selected original inputs are unchanged. No root/index or product file was edited.

Fresh independent package/atlas critique is the next step. R550 remains standalone-model acceptance; R541 remains the old three-character packing result. The later 96-state live/browser/motion contract is still a proposal. Brassbolt/Reedsting advice and their accepted R1 files remain in scope and unchanged.
