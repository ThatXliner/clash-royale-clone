PIECE: ART-020P — Original Rivet Runners collection portrait
VERDICT: PASS
EVIDENCE:

Fresh render of the built Pages WebP in Google Chrome 155.0.8059.40 at DPR 1 reports 64×64 and 128×128 CSS boxes, with 512×512 intrinsic art. The saved crops are exact 64×64 and 128×128 PNGs. At both native sizes, the otters' faces stay distinct and the mallet heads and handles remain visible; at 128 px, the copper bands and fasteners are easy to read. The warm river workshop, amber lamps, and painterly treatment fit the existing Coppershade Flock style input while showing different subjects and composition.

![Fresh Chrome render at 64 CSS pixels, DPR 1](/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/art-020p-round-1/critic/rivet-runners-chrome-css64-dpr1.png)

![Fresh Chrome render at 128 CSS pixels, DPR 1](/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/art-020p-round-1/critic/rivet-runners-chrome-css128-dpr1.png)

The preserved source is 1254×1254 RGB PNG, 2,819,557 bytes, SHA-256 `b84c733e475b50d746d955ec805d0c5da1e998ca4e2fc9f76305f661ce942de0`; it is byte-identical to the file at the recorded built-in imagegen path. The style input is 512×512, 36,532 bytes, SHA-256 `521167c772916265e797c51c28183d91f090c2670ec7d527bf59e60a85684dec`. The shipped WebP is 512×512, 76,868 bytes, SHA-256 `6df560ccabb6c7f7347225bdb4c0fe2f9eadbb3aa1f769b6b540cd6f96c35b77`, under 1 MiB. Its provenance and manifest both specify `AGPL-3.0-only`; the recorded cwebp 1.6.0 command and settings reproduce the output byte-for-byte.

`npm run test:visual-asset-manifest` exited 0 with 6 passed and 0 failed. `npm run build:pages -- --out /tmp/codex-art020p-pages-output` exited 0 and reported 50 release files totaling 5,882,827 bytes. The independent audit found the exact WebP once at `game/public/assets/rivet-runners-portrait-painted.webp`; the preserved source PNG and its hash, provenance JSON, and all `reference`, `demo`, `docs`, `tests`, `artifacts`, and `node_modules` paths are absent from publication. The only modified runtime source path is the manifest; its diff adds one 11-line record, and deleting that record yields a byte-for-byte match with parent `14b5826dd7eb2205677a1e2a92a4be652be76f6d`. No portrait lookup, UI, or gameplay integration was added. The two concrete lore sentences are preserved verbatim in the concept, and `Rivet Runners` has no exact normalized name or key match in the comparison card catalog.

Raw run logs, the independent JSON audit, the clean archive path, browser metrics, screenshot hashes, and audit scripts are under `artifacts/art-020p-round-1/critic/`.
BIGGEST GAP: The mallet heads sit close to the outer frame at 64 px, leaving less margin around their silhouettes than at 128 px.
