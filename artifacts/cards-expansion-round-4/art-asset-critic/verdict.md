# ART-016P asset critique

**Verdict: FAIL — native 64 px count/readability gap.** The committed art and provenance satisfy the packaging and registry checks, and both portraits are clear at 512 px and 256 px. At 64 px, Coppershade still reads as a warm flock, but its six separate birds blend into the copper wings and workshop background; the required six-member count is not reliable at that thumbnail size. Gloamwing's five forms remain more separable, though their faces are too small to read at 64 px. This is the single largest gap for this asset gate.

The two portraits use the project's original painted fantasy style and do not contain visible text, logos, UI, or benchmark imagery. The original atlas style samples in `original-atlas-style-samples.png` are from the candidate's own existing atlas. The separate public collection/detail screen gate remains for ART-016 after CARDS-016I; this review makes no public-screen or full-parity claim.

## Rendered evidence

`asset-scales-contact-sheet.png` shows each committed WebP decoded at native 512 px, downsampled to 256 px, and downsampled to 64 px. Each sample is placed at its native pixel dimensions; the 64 px samples also have standalone files (`gloamwing-cluster-64px.png` and `coppershade-flock-64px.png`). The two `*-64px-nearest-8x.png` images enlarge those exact 64 px samples with nearest-neighbor pixels for inspection; they are diagnostic views, not claims about display size. `original-atlas-style-samples.png` shows all eight existing atlas portraits for style comparison, without using `reference/`.

## Asset and provenance checks

| Asset | Source PNG | Source SHA-256 | Shipped WebP | Output SHA-256 |
| --- | --- | --- | --- | --- |
| Gloamwing Cluster | 1254×1254, 2,341,041 bytes | `2537f0de61793fc87866fb65894e0c83c98614f00c6c459ed3dc49604c92025a` | 512×512, 40,140 bytes | `176687230a5e9b3b57364437692308f568e2933b7b0225e46694cfbbfb4b6cf8` |
| Coppershade Flock | 1254×1254, 2,568,802 bytes | `616965fb390c6749c347f02087dc37491b9faf0056d414971ae678a9af032d9e` | 512×512, 53,578 bytes | `8d56aad804ca150372aa7a08af118f43ad33a2577f2604bee2ddcaaea1bac624` |

Both outputs are below 1 MiB. The records specify `built-in imagegen`, no input images, `AGPL-3.0-only`, in-repo authorship, the full prompts, and `cwebp 1.6.0` with `-q 82 -m 6 -mt -resize 512 512`. I re-encoded both source PNGs with that exact tool version and option set; each reproduced the committed WebP byte-for-byte. Strict portrait lookup, exact two-sentence lore, provenance, output bytes/dimensions/hashes, and manifest mapping pass `node --test tests/card-expansion-art.test.js` (2/2) and `npm run test:visual-asset-manifest` (6/6); full logs are retained beside this report.

The original 1774×887 atlas is unchanged from the candidate's parent commit: SHA-256 `16307a59bde57889e11bcd7b86b54d69ba9985eae6ef436d9703e528fba58e4f` in both commits. The visual manifest suite also reports zero byte overlap with the reference corpus and no protected-game source references in provenance.

## Scope

Reviewed immutable candidate `5acec5bf2dae658fc299dc05417df84722ad1d0d` from a clean `git archive` extraction with only `node_modules` linked. No app/browser session was opened, so there is no live handle to report. Final phone/desktop collection and detail renders remain the separate ART-016 gate.
