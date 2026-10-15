# Packet contents

- `qualification-note.md`: source and outcome ledger, including accepted-main comparison.
- `attempt-1-missing-validator/`, `attempt-2-stale-helper-fingerprint/`, `attempt-3-preexisting-game-battle-failures/`: raw serialized gate records, source/toolchain fences, actual PIDs/exits, and retained generated evidence.
- `accepted-main-game-battle-reproduction/`: isolated accepted-main `game-battle.test.js` command, environment, sources, and raw result.
- `recorders/`: exact shell recorder copies used for each attempt and the accepted-main reproduction.
- `source-patches/`: exact two-line validator-binding repair and one-line source-fingerprint refresh commits.
- `historical-source-extraction-audit/`: untouched original file-only audit, clearly separated from later runtime qualification.
- `SHA256SUMS`: SHA-256 for every packet file other than this manifest.

Caches, `node_modules`, runtime temp directories, and whole repository trees are excluded.
