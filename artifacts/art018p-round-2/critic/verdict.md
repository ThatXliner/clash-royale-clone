# ART-018P round 2 critic verdict

**Verdict: PASS for the asset-stage portrait.** The exact candidate reviewed was `a3ebdb1d41e8a6527b2d50a9928a883b429a5ba0` in a clean detached worktree. This verdict covers the original portrait asset and its provenance. It does not review the live collection, battle, or arena integration reserved for CARDS018I.

At the actual 64 × 64 render, the raised diagonal firing channel, paired copper rails, visible pivot and supporting braces make the structure read as a defensive launcher. The wide bowl is still the largest lower shape, but the launcher no longer reads as an ambiguous brazier or cauldron. The planted rootwood supports and stone footing remain visible; the square image does not crop the mechanism. At 128 × 128 the open channel and hardware are more explicit. There is no visible text, logo, card frame, humanoid or animal figure.

The clean candidate commit changes exactly nine files, limited to the v2 source, shipped output, provenance and builder evidence. The v1 edit input is still byte-identical to its recorded SHA-256. The fresh browser fixture decoded the source at 1254 × 1254 and shipped WebP at 512 × 512, with thumbnail boxes exactly 64 × 64 and 128 × 128 CSS pixels. The source is 2,717,595 bytes, SHA-256 `3429f3eb00374226c7779857816c8e0fec15711cc89f670fb12322aa5afe7490`; the shipped WebP is 74,608 bytes, SHA-256 `fbeb95f34410348c34bf68892deb25b7df387783c7d88819ee7a7b37038c87a3`, within the 1 MiB limit. The preserved v1 input is 2,743,443 bytes, SHA-256 `15656baececa9314f1f9ed8b7d2a9539c54acf90e9c53ec1bad8edad14d60926`.

Provenance records the built-in image editor/tool, complete edit prompt, exact input and output hashes, dimensions, byte lengths, AGPL-3.0-only license, and cwebp 1.6.0 settings (`-q 85 -m 6 -mt -resize 512 512`). Lore is exactly two concrete sentences, describing the creek, copper lip, emberseeds, workshop, braces and launch channel. No comparison assets or text appear in the changed-file scope or rendered image.

**Biggest gap:** the background stays visually busy at 64 px and some dark channel/support edges merge into it. The bright copper rails and strong diagonal still preserve the launcher silhouette at card size, so this is a polish opportunity rather than a blocker.

Fresh actual-size renders: `fresh-render-64px.png` (64 × 64), `fresh-render-128px.png` (128 × 128), and `fresh-render-fixture.png` (360 × 220). Machine checks are in `portrait-evidence-check.tap`; the executed browser receipt and audit script are retained beside this verdict.
