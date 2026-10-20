# Frozen character-model candidate

**Generated and structurally validated. Independent visual critique remains pending.**

Candidate directory: [`generated/attempt-20261020T144102Z-22183/models/`](generated/attempt-20261020T144102Z-22183/models/).

| Character | Editable Blender file | Portable model | Three-quarter render |
| --- | --- | --- | --- |
| Coilblade | [coilblade.blend](generated/attempt-20261020T144102Z-22183/models/coilblade.blend) | [coilblade.glb](generated/attempt-20261020T144102Z-22183/models/coilblade.glb) | [PNG](generated/attempt-20261020T144102Z-22183/models/previews/coilblade-three-quarter.png) |
| Mossguard | [mossguard.blend](generated/attempt-20261020T144102Z-22183/models/mossguard.blend) | [mossguard.glb](generated/attempt-20261020T144102Z-22183/models/mossguard.glb) | [PNG](generated/attempt-20261020T144102Z-22183/models/previews/mossguard-three-quarter.png) |
| Copperskiff | [copperskiff.blend](generated/attempt-20261020T144102Z-22183/models/copperskiff.blend) | [copperskiff.glb](generated/attempt-20261020T144102Z-22183/models/copperskiff.glb) | [PNG](generated/attempt-20261020T144102Z-22183/models/previews/copperskiff-three-quarter.png) |

[Shared scene](generated/attempt-20261020T144102Z-22183/models/moss-and-ember-characters.blend) · [Rendered lineup](generated/attempt-20261020T144102Z-22183/models/previews/lineup.png) · [Model manifest](generated/attempt-20261020T144102Z-22183/models/manifest.json) · [Measured projection receipt](generated/attempt-20261020T144102Z-22183/models/sprite-projection.json) · [Preview provenance](generated/attempt-20261020T144102Z-22183/models/preview-provenance.json)

## What actually ran

A new isolated Blender 5.1.2 process ran with `--background --factory-startup`, Eevee, and a quick four-image preview set. PID 22195 exited 0. The Python syntax check exited 0. Source hashes matched before/after. The runtime was released after the process finished and the latest lineup was inspected.

The exact command, non-secret environment, source snapshot, version, raw stdout/stderr, PIDs, exit codes, and source-stability receipts are one directory above the model files. All prior failed or defective attempts remain intact; see [attempts.md](attempts.md).

Generator source SHA-256:

```text
d243516258802c67925455a7980661d4dd1c7bb54a8c443c2381308dd5b6f5b3
```

The current source at this handoff matches that frozen generator. The palette hash is `44c93283d6dee1e6e43d0c204ef77c4d10f65e25845ad87a7cfa31a4bae9d58c`.

The [frozen SHA-256 receipt](generated/attempt-20261020T144102Z-22183/frozen-sha256.txt) covers the captured source files, model exports, manifests, projection data, and preview images.

## Measured structural results

| Character | Editable meshes | Evaluated triangles | Materials | GLB nodes | Animation tracks / channels |
| --- | ---: | ---: | ---: | ---: | ---: |
| Coilblade | 64 | 9,668 | 8 | 80 | 12 / 13 |
| Mossguard | 70 | 5,904 | 8 | 85 | 11 / 12 |
| Copperskiff | 52 | 8,356 | 8 | 65 | 6 / 7 |

Each GLB contains exactly one scene, only names belonging to that character's authored collection, no external image textures, and nonzero animation channels. The unwanted startup cube from the preceding attempt is absent. The `.blend` exports contain only the authored scene dependencies.

Animation is currently exported as Blender's separate per-object scene tracks. They share the source timeline and must be sampled together to assemble a complete pose. Named merged game clips remain a later integration step; `.blend` is the primary pose source.

The measured common sprite camera has 50° elevation and orthographic scale 2.59. Its ground anchor is `[0.5, 0.6541491]`, shared across all source frames. All 288 combinations of three characters, eight directions, and twelve source poses passed the crop-bound check. Maximum floating-point anchor spread was `8.4e-7` of a tile. No atlas cell is reframed by its alpha bounds.

## Limits of this delivery

These files establish actual editable models, portable exports, and initial rendered previews. They do **not** establish a visual PASS. In particular:

- Triangle counts exceed Claude's proposed 1,500–3,000-triangle LOD target.
- The source contains staged idle/walk/attack key poses; it does not yet contain the full final motion suite.
- Eight-direction atlases, LOD-S geometry, inverted-hull outlines, team mask passes, merged named clips, and hero masters are not generated in this candidate.
- The 13 px live-arena, grayscale team, reduced-motion, and matching-tick restore checks are unperformed.
- The generation changes no shipped asset, runtime UI, card mechanic, stat, name, lore, or audio.

All meshes and materials are original procedural work. The accepted painted portraits and lore guided identity; nothing from `reference/` was imported or used as a model asset.
