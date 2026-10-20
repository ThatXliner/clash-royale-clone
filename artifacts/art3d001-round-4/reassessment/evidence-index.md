# Copperskiff R4 reassessment evidence

Scope: selected frozen `tapered_canopy` Copperskiff model and 64×64 sprites only. This does not qualify Coilblade, Mossguard, or full ART-3D integration.

- **Verdict:** `VERDICT.md` (scoped PASS).
- **Selected render run:** `/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment/run-20261020T180144Z/`.
  - Blender PID `91459`; direct exit `1`. It wrote all 16 raw 256×256 RGBA sprites, then failed while serializing the audit receipt (`Scene` object not JSON serializable). Raw stdout/stderr and argv are preserved in this directory. The Blender process did not write `fresh-render-receipt.json`; `reconstructed-render-evidence-receipt.json` explicitly records that post-render failure and the validated disk outputs.
  - Native/context postprocess PID `91509`; direct exit `0`. It produced 16 native 64×64 cells, `selected-team-contact-native.png`, `selected-team-contact-arena-context-native.png`, and `native-evidence-receipt.json`.
  - All 126 frozen delivery entries passed the prelaunch and postrun checks. Source/asset input hash listings are identical before and after. Blender executable SHA-256 is identical before and after: `e0b80264bea559673212e0afc819fb33f3cef8b3dcfcc8d994b195132857ac8a`.
- **Saved heading probe:** `/Users/me/.codex/clash-qualification/20261020-sprite-heading-audit/`.
  - Blender PID `90334`; direct exit `0` (`attempt-3-direct-exit-code.txt`). `projection-receipt.json` records actual evaluated bow/stern projections through stored camera names. Its blend SHA-256 before and after is `3c4b0fe72fac569a575e02ac142d8d838b74a734a95f0ba2e5f2a9fd343cffac`; all four measured directions match their labels.
- **Preserved initial setup failure:** `/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment/run-20261020T180055Z/`. Blender PID `91331`; direct exit `1` before rendering because the first probe treated the `copperskiff_body` Empty as a mesh.

Frozen asset identities: `.blend` SHA-256 `3c4b0fe72fac569a575e02ac142d8d838b74a734a95f0ba2e5f2a9fd343cffac`; `.glb` SHA-256 `fdef3262b550903f512337442e10b51ffd4d869b6505f0c9c93f5cfd118dd500`; model source SHA-256 `ee2a847414de7918bd11c78faa8005de612452a6ec6911424560a73706e587b3`.
