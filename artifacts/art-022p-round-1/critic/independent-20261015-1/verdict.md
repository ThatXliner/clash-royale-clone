PIECE: ART-022P — original Brackenwheel collection portrait
CANDIDATE: cb20144cfde7c0cbe32a9d218117c75e0695a8b8 (parent 3e0734ef95c5cd5b926e9289e5588a020fc0e752)
VERDICT: PASS

BASIS
- The original square portrait is legible at both actual DPR-1 sizes: Chrome 155.0.8059.40, Playwright 1.58.2, Node 22.22.3. The fixture captured exact 64×64 and 128×128 CSS boxes at devicePixelRatio 1, both loaded from the 512×512 asset. Face, curled auburn hair, teal/rust work clothes, curved copperroot sickle, and amber emberseed accents remain visually distinct at 64px and clearer at 128px. Page errors, console errors, and failed requests: zero. Native capture exit: 0.
- Source PNG: 1254×1254, 2,650,041 bytes, SHA-256 `ad0654107fe957283b1e9e107a3be155934f1032820600bb62f6ddd6851a56bc`; it byte-matches the recorded built-in imagegen output. Shipped WebP: 512×512, 62,014 bytes (<1 MiB), SHA-256 `8c46fd063956905674aab420a0a2513ed83013c31c12c4e45456880f43246096`. Provenance records the exact prompt, built-in imagegen source and mode, AGPL-3.0-only license, source/output hashes and sizes, and reproducible cwebp 1.6.0 encoding. The prior portrait atlas is declared as style-reference-only.
- Manifest comparison against the parent has 27 prior entries and 28 candidate entries: exactly one new Brackenwheel entry, with all prior records byte-equivalent. The current manifest SHA-256 `0e2a67256be42195027a569478b3d7400ba2c37982f57835b9bb23aaa499f91c` matches the candidate comparison and the pre/post-release manifest hashes.
- Independent gates passed: visual-asset-manifest 6/6 (exit 0), shipping-isolation selector 13/13 (exit 0), and release build 22/22 (direct exit 0). Release size audit measured 55 files / 6,199,797 bytes against 8,388,608 bytes; largest emitted JavaScript file was 474,883 bytes. The source kernel is 523,788 bytes against 524,288; the release cap configuration and kernel source are unchanged from the parent. Release-generated tracked evidence was restored byte-for-byte after the test.
- The candidate changes no tests and changes only `src/content/visual-asset-manifest.js` under `src/`; the art, provenance, and manifest records are the reviewed scope. No live-card, arena, or gameplay-parity claim is made.

BIGGEST GAP
The existing kernel source sits only 500 bytes below its 524,288-byte limit. The separate size audit did not report a named kernel-graph entry (`kernelGraphEntry` is null), so the evidence records the measured source size and the largest emitted JavaScript chunk rather than claiming a specific graph attribution.

EVIDENCE
- `asset-verification.json`, `manifest-compare.json`, `sourcepost-resource-release-check.json`
- `native-capture-corrected/` contains the suffixed capture copies, unchanged raw capture metadata/logs, and an explicit verified filename map. The initial fractional-coordinate capture and its 129×128 result remain preserved beside it.
- `release-build.stdout.raw`, `release-size-audit-attempt-2.stdout.raw`, direct-exit files, and generated-evidence before/after/restore records
- `method-notes.md` preserves the initial native-fixture and release-size-audit method failures.
