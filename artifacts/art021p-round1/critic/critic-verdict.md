# ART021P independent asset critique

**Verdict: FAIL against the accepted native-size readability criterion.** The portrait and asset provenance pass, and the hidden form reads as a flat hatch. The revealed form rises visibly above it, but at 13 CSS px its shared base and fine color bands do not read clearly as three separated feet with a coil crown.

## Verification

The exact candidate commit is `407fd61c83f9f962280d363e85af364041c5f223`, parent `76e202ff85d8d5920fc58a248b1324f56da5b3f2`, archived privately with only a `node_modules` symlink. `npm run test:visual-asset-manifest` passed 6/6 tests (TAP at `manifest-test.tap`). The manifest went from 24 to 27 records: the prior 24 are byte-equivalent and the diff appends exactly the three Buried Coil records (33 added lines, 0 removed). All seven protected pre-existing public assets match the parent blobs byte-for-byte; the candidate changes no `reference/` paths, gameplay files, stats, or card/UI mappings.

All provenance source/output hashes, byte lengths, and dimensions match independently decoded PNG/WebP files. Re-encoding with the recorded `cwebp 1.6.0` settings reproduces all three shipped WebPs byte-for-byte. Every output is 512×512 and under 1 MiB:

| Asset | Generated PNG | Shipped WebP |
|---|---:|---:|
| Portrait | 2,863,911 B · `9467e8565c451b265eca65a8849bf7b1c6600996d82f6ff5a281e6ed0fb99097` | 75,334 B · `e52c43cc2c56f4aef3d3410a8a7adb1df63de581eb2fd93f443d85271ae62d5b` |
| Hidden | 1,335,049 B · `5a590c7ebe699392a014d3d14b81ba686bb1bcbdbadfddaa254363dfece3e814` | 43,144 B · `5ee469494f97eab0652cc150d6b23b75c5bca44eba90b84a88cf8faf98d1a469` |
| Revealed | 1,000,851 B · `3e80ea133991990319e55f83f846c6c6db18ef4c05521211553fa5ce1326b9d4` | 37,414 B · `bca30fdf3ad8cf989affc42b7efb03ba38d4c33fda8e92131cc90c7c2d356cea` |

## Native-size finding

I rendered the shipped WebPs in Playwright Chromium 145.0.7632.6 at DPR 1 in 390×844 and 1440×933 viewports. Browser measurements confirmed 13×13 CSS px battle forms and 64×64/78×78 CSS px portraits; console errors: 0. The portrait remains recognizable at both thumbnail sizes.

The exact pixel-aligned 13×13 CSS crops are `hidden-css-13px-dpr1.png` and `revealed-css-13px-dpr1.png`. At alpha threshold 32, hidden has 108 visible pixels and revealed 130; the hidden mask is wholly contained in the revealed mask (108-pixel intersection, 130-pixel union, IoU 0.831). Visually, the hidden disk reads flat and the revealed asset has an upright center, but its lower feet and upper loops blend into the same broad copper body at normal arena scale. This misses the accepted concept's explicit requirement that the revealed silhouette read as a three-footed tower with a coil crown at 13 px. The builder's Lanczos scale-board result does not reproduce this actual CSS render.

The review HTML, phone/desktop screenshots, native crops, browser measurements, independent metadata/hash audit, re-encoding check, and source pre/post fence are in this directory. They are asset diagnostics only; there is no live-app or team-color claim. The largest remaining gap is a more legible revealed-state silhouette at 13 px, especially the separated supports and crown.
