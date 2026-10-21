# Copperskiff R3 native-context readability prototype plan

R2 exact-restore and behavioral gates passed; the independent R2 critic failed
only native-size readability. The critic's unresampled 284×84 phone crop shows
the boats' pale centers and thin colored edges losing their silhouettes over
the grass and reflective bridge. The critic also verified the original full
64×64 cell and 32×54 pivot: the phone bodies are 19×12 CSS pixels and desktop
bodies are 38×24 pixels. R3 keeps those full cells, pivots, and 13/26 CSS-pixel
presentation inputs fixed.

The bounded image comparison is:

| Variant | Treatment |
| --- | --- |
| A | Current R2 shipped atlas, copied byte-for-byte |
| B | Center sample of each 4×4 block from each pinned R4 256×256 source frame |
| C | B plus one opaque, 8-connected `#191D22` contour pixel, added only to transparent pixels |

All sixteen 256×256 source frames remain byte-identical to the pinned R4 inputs.
No source frame is repainted, cropped, fitted, or reprojected. B and C retain the
entire 256×256 RGBA atlas and its sixteen 64×64 cell windows. C's verification
requires every original B pixel with nonzero alpha to remain byte-identical,
every new pixel to be the declared ink and a one-pixel neighbor of original
coverage within the same cell, and at least two transparent pixels between
every cell's alpha bounds and its boundary. Every output stays at or below
1 MiB and its dimensions, byte length, source hashes, cell bounds, postprocess
recipe, and SHA-256 are written to a separate provenance manifest.

Prototypes are written outside `public/` and are not product assets. After the
root grants browser access, compare A/B/C in real 390×844 and 1440×933 game
contexts with the original camera, viewport, movement, poses, and the same crop.
If a variant is selected, update only its asset and the associated visual-asset
manifest/provenance metadata, retain the R2 paint stability rules, then run the
unchanged eight-case exact-restore gate and required focused source/asset/release
gates. A fresh independent critic must review the selected built candidate.
