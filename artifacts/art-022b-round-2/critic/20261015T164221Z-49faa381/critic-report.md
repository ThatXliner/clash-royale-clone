PIECE: ART-022B — Brackenwheel battle cutout, round 2
VERDICT: FAIL

The candidate meets the file, provenance, encoding, manifest, and automated gate checks, but it misses the native-scale silhouette bar.

The shipped asset is a 512×512 transparent WebP (67,688 bytes, below 1 MiB). Its source is the full built-in image-generation PNG (1,405,765 bytes); the source prompt matches the licensed provenance record exactly. `cwebp` 1.6.0 with libsharpyuv 0.4.2 reproduces the shipped bytes exactly from the untouched PNG. The manifest adds one record and preserves existing records. The candidate contains exactly four product paths: `demo/assets/brackenwheel-battle-sprite.png`, `docs/art/brackenwheel-battle-sprite-provenance.json`, `public/assets/brackenwheel-battle-sprite.webp`, and `src/content/visual-asset-manifest.js`. Other commit additions are builder provenance/evidence. No UI integration or whole-game historical claim was evaluated.

I judged the actual shipped WebP in headed Chrome 155 at 540×960, DPR 1, on light and dark arenas. The rendered body measured 12.994 CSS px at the 13 px target and 25.996 CSS px at the 26 px target. At 13 px the figure reduces to a rust/teal mark; its head, apron, copper root sickle, and separate feet do not read as one coherent full-body riverworker. At 26 px the person is more apparent, but sickle and feet still do not resolve clearly at arena scale. The 8× nearest-neighbor crop is a diagnostic only; acceptance is based on the four native screenshots.

The requested test gates passed 45/45 cases: manifest 6/6, shipping isolation guard 13/13, release build 22/22, and corrected shipping isolation release 4/4. `npm ci` completed with exit 0. The first release-isolation attempt is preserved separately: it used a `file://` Playwright value where the test calls `fs.access(PLAYWRIGHT)`, causing a preflight failure (3/4, exit 1) at `tests/shipping-isolation-release.test.js:413`. That method failure is not counted or hidden; the corrected filesystem-path attempt passed all four cases.

After testing, the four tracked evidence files modified by the release gates were restored from candidate HEAD. The isolated checkout is clean; all 77 tracked `dist` files match the saved pre-test byte lengths and SHA-256 hashes. The source PNG hash is unchanged. All owned test Chrome PIDs and eight temporary Playwright profiles are gone; the pre-existing user Chrome PID 93861 was left untouched.

BIGGEST GAP: The 13 CSS px sprite must preserve a clearly separated head, apron, copper root sickle, and feet on both arena tones.

Evidence bundle: `/tmp/art-022b-round2-critic-20261015T164221Z-49faa381/`. See `candidate-fence.json`, `environment.json`, `test-census.json`, `native-visual-review.json`, raw gate stdout/stderr/exit files, the four native PNGs, asset provenance/report, and `checksums.sha256`.
