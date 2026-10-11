# ART-016P builder round 2 evidence

## Round 1 gap

The independent ART-016P critic found that the original Coppershade Flock
portrait became a single warm cluster at native 64×64: the six birds' copper
wings and detailed workshop background merged. The critic's actual earlier
render is retained at
`artifacts/cards-expansion-round-4/art-asset-critic/coppershade-flock-64px.png`.

## Revision

I used the built-in imagegen edit tool with the prior Coppershade WebP as its
only input image. The exact prompt and input hash are in
`docs/art/coppershade-flock-provenance.json`.

- Output handle: `exec-b9543711-0978-4097-bdd4-a23eb07b5972`
- Generated source: `/Users/me/.codex/generated_images/01a12c7a-0d19-7f43-aa21-32b6b7ae4111/exec-b9543711-0978-4097-bdd4-a23eb07b5972.png`
- Retained full source: `demo/assets/coppershade-flock-painted.png`
- Shipped portrait: `public/assets/coppershade-flock-painted.webp`
- Declaration: `AGPL-3.0-only`

The new 1254×1254 source is 2,280,778 bytes, SHA-256
`ae5b7361274dee316fb2c3f0062b74718e3af1687f3766f857a3573b8250c203`.
The encoded 512×512 WebP is 36,532 bytes, SHA-256
`521167c772916265e797c51c28183d91f090c2670ec7d527bf59e60a85684dec`, using
`cwebp 1.6.0 -q 82 -m 6 -mt -resize 512 512`.

## Native 64px inspection

I decoded the shipped WebP with `dwebp 1.6.0` and rendered a Lanczos 64×64
thumbnail with ImageMagick 7.1.2-27. The exact 64×64 image is
`coppershade-flock-64px.png`; `coppershade-flock-64px-nearest-8x.png` enlarges
those same pixels for diagnosis. At native size, six separate feathered
silhouettes read in two rows of three, with visible teal gaps between nearby
birds and strong pale-face/copper-wing contrast. The 8× view is for pixel
inspection only; the count judgment is from the native 64×64 image.
The native thumbnail is 64×64, SHA-256
`988f5e968f05cbcaad3f68461f3889d00da7cac5514d96c46072c547a82eb19d`.

## Verification

- `node --test tests/card-expansion-art.test.js` — **2/2 passed**.
- `npm run test:visual-asset-manifest` — **6/6 passed**, including output
  hashes/dimensions and no byte overlap with the reference corpus.
- Re-encoding the full PNG with the recorded `cwebp` 1.6.0 settings reproduced
  the shipped WebP byte-for-byte. The prior edit input also matches its recorded
  hash when read from commit `5acec5bf2dae658fc299dc05417df84722ad1d0d`.
- The default portrait atlas remains SHA-256
  `16307a59bde57889e11bcd7b86b54d69ba9985eae6ef436d9703e528fba58e4f`.
  Gloamwing source and WebP hashes remain
  `2537f0de61793fc87866fb65894e0c83c98614f00c6c459ed3dc49604c92025a` and
  `176687230a5e9b3b57364437692308f568e2933b7b0225e46694cfbbfb4b6cf8`.

The public app phone and desktop screens remain part of the separate ART-016
integration gate and are not claimed here.
