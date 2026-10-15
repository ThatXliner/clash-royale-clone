# ART-022B round 3 builder record

The selected asset is a new full-body chibi cutout for Brackenwheel, the original river-worker character. It uses an oversized auburn-haired head, broad teal apron, rust sleeves, dark separated boots, and a bright copper crescent. The accepted portrait was used only as an identity reference.

Two bounded built-in image-generation attempts are recorded under `raw-generation/`. Attempt 1 kept more modeled fabric and material detail than the native-scale direction called for, so attempt 2 targeted flatter blocks and a thicker contour. The selected source PNG is the byte-exact tool output; its prompt, tool receipt, input portrait hash, and source hash are recorded in the provenance file. `cwebp` 1.6.0 encoded it to a 512×512 WebP using `-q 92 -alpha_q 100 -m 6 -mt -resize 512 512`. Re-encoding produced a byte-identical WebP. The shipped output is 49,440 bytes.

The selected WebP was rendered in headed Google Chrome 155.0.8059.40 at DPR 1 on the repository’s 540×960 arena image, with the same light and dark tone filters used by the preceding round. The four captures measure 12.9959 CSS px at the 13 px target and 25.9995 CSS px at the 26 px target. The browser closure record lists the owned Chrome processes and confirms that none remained after capture; its temporary profile was removed.

These captures document builder-side rendering and do not make a pass/fail claim. The independent critic still needs to assess the unchanged 13 px and 26 px captures.

Automated validation passed 45/45 cases: visual asset manifest 6/6, shipping isolation guard 13/13, release build 22/22, and shipping isolation release 4/4. The release-isolation test changed five tracked evidence JSON files outside this round; their mutation hashes were recorded and the files were restored byte-for-byte to the base commit. All 77 tracked `dist` files match their pre-test hashes. `npm ci` completed with exit 0 using Node 22.22.3 and npm 10.9.8. The release test used the clone's filesystem path for `GAME_BROWSER_PLAYWRIGHT`.

Product paths in this round are exactly:

- `demo/assets/brackenwheel-battle-sprite.png`
- `public/assets/brackenwheel-battle-sprite.webp`
- `docs/art/brackenwheel-battle-sprite-provenance.json`
- `src/content/visual-asset-manifest.js` (one new record)
