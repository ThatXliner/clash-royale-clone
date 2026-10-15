# ART-022L builder record

Base: `91b99fb967b650e5a58ed1df0d96c69b396e7dfe` in a fresh detached checkout.

The small renderer emits repository-authored SVG paths for requested body heights below 26 CSS pixels. At 26 CSS pixels and above it selects the original frozen WebP. The PNG source, WebP, and existing generation provenance were copied from `afd9b341cdf2082937b4c7fad53f664f90be5b1c` without re-encoding or edits; their source/output SHA-256 values are recorded in the asset provenance and focused test.

The native drawing uses broad shapes from the same head, rust sleeve, teal apron, copper sickle, and boot palette as the accepted portrait reference. It emits an open C-shaped sickle stroke and two outlined boot paths with a deliberate gap. The helper takes explicit `bodyCssPixels`, uses no DOM layout measurement, wall clock, global counter, or randomness, and uses stable semantic DOM attributes. No gameplay-state or combat renderer integration was added.

The first focused run found a boot-gap assertion failure caused by a one-unit threshold and floating-point precision. I expanded the right boot path, kept the test strict, and retained both invocation outputs. The corrected focused helper contract passed 6/6. The visual asset manifest passed 6/6 and the shipping isolation guard passed 13/13.

Chrome 155.0.8059.40 / Playwright 1.58.2 captured the full 540x960, DPR 1 fixture at 13 and 26 CSS pixels on both light and dark arenas. The 13px outputs select native SVG and measure 12.9936 CSS px from source geometry; the 26px outputs select the unchanged 512px frozen WebP and measure 25.9918 CSS px. All four pages reported no errors. Full-size screenshots, exact PNG hashes, separate 12x diagnostics, and composited pixel-bound measurements are recorded in `browser-evidence.json`, `pixel-bounds.json`, and `docs/art/brackenwheel-scale-art-provenance.json`. The capture record is evidence for independent review and makes no visual pass claim.

After `npm ci` installed only lockfile-declared dependencies, `release-build` passed 22/22 and `shipping-isolation-release` passed 4/4. Their first invocation failed before test execution because `vite` was absent; the raw first failure and corrected invocation logs are retained. Before those suites, 77 `dist` files and both pre-existing evidence files were hashed and copied aside. The release suite rewrote `artifacts/release-001b-round-2/evidence.json`; its original bytes were restored and verified. `dist` and the pre-existing shipping isolation evidence were unchanged. The shipping suite's new evidence is stored under this builder folder.

`git diff --check` and `node --check` passed for the renderer helper, fixture module, and focused test. The builder does not judge the character; the independent critic review remains outstanding.
