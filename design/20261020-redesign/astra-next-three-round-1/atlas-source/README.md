# APP-REDESIGN-ATLAS-002 source pack

This directory contains the original standard-library atlas builder and validator, exact submitted source map, all 72 raw 256×256 RGBA renders and 72 approved native64 RGBA references, their source-copy manifest, upstream model receipts/license/provenance, one canonical clean-a output set, and validation evidence. The PNG inputs, scripts, source map, upstream evidence, and clean-a outputs were copied without rewriting their source bytes.

The fixed layout is four columns (east, north, south, west), six rows (River idle/walk/contact followed by Ember idle/walk/contact), 64×64 RGBA cells in 256×384 atlases, with the shared ground pivot at (32,54). These are original Moss & Ember character assets. The upstream project license is retained at evidence/upstream/LICENSE.

To build and validate in this directory with Python 3 and the standard library, run:

    python3 scripts/build-next-three-atlases.py --output-dir builds/rebuilt-a
    python3 scripts/build-next-three-atlases.py --output-dir builds/rebuilt-b
    python3 scripts/validate-next-three-atlases.py --build-a builds/rebuilt-a --build-b builds/rebuilt-b --output evidence/rebuilt-validation.json

No rebuild was run while curating this packet. The independent critic ran the submitted generator and validator from its byte-checked review copy and retained both fresh output sets, validation, independent audit, mutation rejection, logs, and three pixel-comparison sheets in ../../../../artifacts/next-three-atlas-round-1/. The canonical single atlas set retained here is builds/clean-a; the critic's build-a and build-b are the two separately retained review results.

The exact source-map.json preserves its original execution-path fields. evidence/source-input-crosswalk.json maps its historical absolute render references to the copied inputs and its model references to canonical model paths already tracked in base f8f6cfe35f8b7756f169225eea57b20ed25720a9. The full external native-r1 attempt directory is intentionally not copied. The canonical editable models and the source package's three model-generator files remain in design/20261020-redesign/astra-next-three-round-1/models/ in base; no duplicate model files are added here.

The upstream report copy in evidence/upstream/accepted-critic-report.md is byte-identical to artifacts/next-three-native-round-1/report.md in base. Its linked native-art evidence is resolved from the canonical base report location; this atlas pack does not duplicate those images or receipts.

The independent critic passed fixed-frame atlas packing. No public asset registration, live renderer integration, runtime motion, all-cast coverage, or APP-REDESIGN-001 foundation acceptance is claimed. This packet curation did not rerun the build or validator.
