# Source copy timing

`post-run/` contains read-only copies made after the focused candidate tests finished. They are not represented as pre-run copies. For each test, the pre-launch SHA-256 manifest records the exact static relative-import closure plus runner, test, package metadata, and lockfile. The post-run copied bytes are checked against those pre-launch hashes, the unchanged worktree bytes, and the candidate Git blobs in `source-copy-verification.tsv`.

`prelaunch-wrapper/trace-imports.mjs` is the import-closure recorder that was present before each test launch.
