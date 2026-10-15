ART-023B matching gate packet

Product source commit: `1d026c4987b0d99e3043d3b1004e6c00e7502081` (parent `330f2804ebd5b421b5f952ca0187fcb76d4c6af6`), isolated from later changes. The source tree remained unchanged during verification. The five ART-023B paths and `package-lock.json` match the pre-run SHA-256 fence; see `runtime-and-pre-source-fence.json` and `post-source-fence.json`.

Runtime: Node v22.22.3, npm 10.9.8, private local Playwright 1.58.2, native Google Chrome Google Chrome 155.0.8059.40. The recorded gates were run sequentially from this assembly. Python used `subprocess.Popen(..., shell=False)` to preserve each exact argv, stdout bytes, stderr bytes, direct child exit code, PID, and sampled process tree.

Qualified gate results on the assembly source (50 passing tests total):

- `node --test tests/aether-well-battle-art.test.js`: 5/5, exit 0 (`focused-helper-5/`).
- `npm run test:visual-asset-manifest`: 6/6, exit 0 (`manifest-6/`).
- `npm run test:shipping-isolation-guard`: 13/13, exit 0 (`shipping-guard-13/`).
- `npm run test:release-build`: 22/22, exit 0 on the qualified rerun `release-22-native-155/`, with `GAME_BROWSER_PLAYWRIGHT` set to the assembly-local Playwright 1.58.2 module and `GAME_BROWSER_CHROME` set to native Chrome 155.0.8059.40.
- `npm run test:shipping-isolation-release`: 4/4, exit 0 (`shipping-release-4/`), with the same explicit local Playwright and native Chrome paths.

An initial `release-22/` attempt also passed 22/22 but is **unqualified and excluded**: the missing env overrides made Playwright launch cached Chrome for Testing 145.0.7632.6. Its raw output and process tree are retained; only the explicit Chrome 155 rerun qualifies.

`native-capture-05` is preserved unmodified at `../native-capture-05/`. Its capture manifest records a base commit of `20089e41225d17043d20c61b37a4aa60cff2212e`; `native05-source-reconciliation.json` proves all source fingerprints from the capture match the corresponding source files at the assembled commit, and verifies all 8 original PNG hashes. The capture measured visible SVG body geometry at 13/26 CSS px across phone 390×844 and desktop 1440×933, light/dark, north/south teams, stable repeated and reduced-motion renders. Attempts native-capture-01 through -05, including earlier failed/clipped attempts, remain intact.

`release-build-side-effects/` retains copies of four generated release-test JSON reports from this run. The four original tracked reports were restored to their HEAD blobs after copying. No source, UI, simulation, package, manifest, or lockfile paths changed. No custom GPU flags were supplied. Browser and build processes closed before packaging; existing user Chrome PID 93861 was not touched.
