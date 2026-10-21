# Copperskiff readability R3 source origin

R3 is a new external candidate copied from the frozen R2 candidate at
`/Users/me/.codex/clash-qualification/20261020-copperskiff-desktop-restore-paint-r2`.
The included tree is byte-identical to R2 at copy time, with only these bulky or
comparison-only paths excluded: `artifacts/`, `source-base.tar`, `reference/`,
and `node_modules/`. The 16 pinned 256×256 RGBA source frames under
`design/20261020-redesign/astra-round-4/generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/raw-256/`
are retained unchanged; R2's builder pins all 16 SHA-256 values and its sprite
provenance ties them to the original in-repository R4 model.

R2's isolated tree omitted the tracked root configuration files
`.gitattributes`, `.gitignore`, and `.nvmrc`; R3 restores those three files from
canonical `16b8ad1664117dcb928ce3bcf3e2fdac45ab23a9` so the exact-source preflight
can verify the full `src/`, `public/`, package, and config inventory.

The canonical main source for the R3 qualification is
`16b8ad1664117dcb928ce3bcf3e2fdac45ab23a9`. R2's older
`docs/art/copperskiff-source-freeze.json` records an earlier R1 baseline and is
historical evidence only; R3 browser qualification must use the root-pinned
source, unchanged original eight-case test SHA
`df5c179fb8641ff7c6150414ae3c4add0b0ea330d24d0d4b75193120ec758a2b`, and the
R2 stability rules.

The original R1 source-freeze JSON is preserved byte-for-byte at
`history/copperskiff-source-freeze-r1.json`; the R3 candidate replaces the
copied historical receipt with a new exact 16b8ad1 receipt. That receipt pins
all six current R2 runtime paths, explicitly limits postselection runtime hash
refreshes to the Copperskiff atlas and visual-asset manifest, records the
associated provenance-file update, pins all sixteen R4 source-frame hashes,
and now verifies the original game-browser gate hash itself. The R3 freeze
generator is candidate-only and does not launch Node, a browser, or tests.
The preserved R1 receipt SHA-256 is
`c2dcdac2767c3a6e4ec446ce2a232c23dd42cb759fe5f91555bd95a600e03b50`; the
initial R3 receipt SHA-256 is
`6928b60981b72d425062d1f473c2c48f79fcf17909a4dd5e99141e7057765bc8`.

The copied candidate retains the accepted R2 paint fixes in
`public/ui-arena-shell.html` and `src/ui/combat-art.js`. R2 remains immutable and
its separate round-2 critic report remains a FAIL for native-size readability.
No sprite variants have been generated or adopted yet. No simulation,
mechanics, card statistics, inputs, test assertions, viewports, or display-size
targets are changed in this source-preparation phase. The R3 prototype builder
will write only under the external R3 `prototypes/` directory; the shipped
public atlas and runtime manifest remain at their R2 bytes until a variant is
selected and independently reviewed.

The exact prototype command, after the root grants browser/runtime access, is:

```sh
python3 scripts/build-copperskiff-readability-prototypes.py \
  --output-dir /Users/me/.codex/clash-qualification/20261020-copperskiff-readability-r3/prototypes
```

This script produces A (the byte-identical R2 atlas), B (center-sampled 4×
reduction), C (the same center-sampled reduction plus a one-pixel `#191D22`
ink contour), per-cell alpha bounds, source hashes, output hashes, and an
external provenance checksum. It does not replace product assets. Browser
comparison at the original 390×844/1440×933 game contexts and the unchanged
eight-case exact-restore gate remain required after runtime access is granted.
After a variant is selected and the exact candidate freeze is refreshed, the
unchanged eight-case gate is launched with:

```sh
python3 scripts/run-copperskiff-one-case-probe.py --full-matrix
```

The wrapper first runs `scripts/check-copperskiff-source-freeze.py`, then
invokes the untouched `node --test tests/copperskiff-live-sprite-game-browser.test.js`
gate with the root-provided Node, Playwright, and Chrome paths.

The copy was checked against R2 for these critical files before further source
preparation: `public/ui-arena-shell.html`
(`c5ba0470bb4fbfba717e079c78a2da4cda351fa33458b2826e9efdd38eb14eb4`),
`src/ui/combat-art.js`
(`076e8439aafcdb8c22b840cd98ef80e12cdb45b4662b2652988e9566e0bf2ae2`),
`src/content/visual-asset-manifest.js`
(`55728175441d54bb8e3cb7811afc0c70cfd7952e15782c2d6792045a0a7a7f98`), the
untouched full browser test
(`df5c179fb8641ff7c6150414ae3c4add0b0ea330d24d0d4b75193120ec758a2b`), and the
current R2 atlas (`b7a308ee781303c4f8f84effedcc05195e36e7702a9a839c5c23cf10d856ace8`).
The hashes for the accepted paint-fix source files and browser test match R2.
