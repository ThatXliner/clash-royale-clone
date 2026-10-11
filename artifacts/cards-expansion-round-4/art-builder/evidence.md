# ART-016P builder evidence

## Scope

Created standalone original card portraits for `gloamwing-cluster` and
`coppershade-flock`, retained both 1254×1254 generated PNG sources, added
two exact two-sentence lore entries, registered portrait URLs and licensed
WebP bytes, and recorded generation/encoding provenance. The 4×2 default
portrait atlas was left unchanged. No combat sprites were requested or added.

## Generation receipts

Both portraits used the built-in imagegen tool with no input images and an
opaque background. The full prompts, exact source/output hashes and byte
counts, dimensions, license, and `cwebp 1.6.0` settings are recorded in
`docs/art/gloamwing-cluster-provenance.json` and
`docs/art/coppershade-flock-provenance.json`.

- Gloamwing generated output handle: `exec-2db6755b-2332-43d5-8ccc-adcdc72eaa1d`
- Coppershade generated output handle: `exec-4ba05771-f078-4459-a26d-9170bf12f098`
- Tool generation directory: `/Users/me/.codex/generated_images/01a12c7a-0d19-7f43-aa21-32b6b7ae4111`
- Project sources: `demo/assets/gloamwing-cluster-painted.png`, `demo/assets/coppershade-flock-painted.png`
- Shipped portraits: `public/assets/gloamwing-cluster-painted.webp`, `public/assets/coppershade-flock-painted.webp`
- Project declaration: `AGPL-3.0-only`

The Gloamwing source is 1254×1254, 2,341,041 bytes, SHA-256
`2537f0de61793fc87866fb65894e0c83c98614f00c6c459ed3dc49604c92025a`; its
512×512 WebP is 40,140 bytes, SHA-256
`176687230a5e9b3b57364437692308f568e2933b7b0225e46694cfbbfb4b6cf8`.
The Coppershade source is 1254×1254, 2,568,802 bytes, SHA-256
`616965fb390c6749c347f02087dc37491b9faf0056d414971ae678a9af032d9e`; its
512×512 WebP is 53,578 bytes, SHA-256
`8d56aad804ca150372aa7a08af118f43ad33a2577f2604bee2ddcaaea1bac624`.

## Thumbnail inspection

I inspected both compressed WebPs at their native 512×512 size. The five
violet marsh gliders and the six copper-sailed river gliders remain
countable, with faces and wing silhouettes visible. Each shipped portrait
is below the 1 MiB limit.

## Verification

- `node --test tests/card-expansion-art.test.js` — **2/2 passed**. This
  checks both portrait mappings, standalone cells, two-sentence lore,
  retained source dimensions and hashes, WebP size/dimensions and hashes,
  provenance fields, and matching AGPL manifest entries.
- `npm run test:visual-asset-manifest` — **6/6 passed**. This checks every
  shipped image against the registry on disk, including dimensions, byte
  length and hash, and confirms no byte overlap with the reference corpus.

The real application phone and desktop renders remain with CARDS-016I
integration; this evidence does not claim an app-level visual gate.
