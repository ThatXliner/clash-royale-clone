# ART-022B round 2 builder record

This candidate responds to the round-one native-scale failure: the full figure now has a deliberately large head, a broad teal apron, rust-red sleeves, a large copper crescent, and widely separated boots. The accepted Brackenwheel portrait was used only as an identity reference. The image is original and has a true transparent alpha channel.

The built-in `image_gen.imagegen` call produced one 1254×1254 RGBA PNG. Its tool output is `/Users/me/.codex/generated_images/01a1406a-6dc0-7f83-9a35-a2a6e94ebc17/exec-339893fe-298d-4b4b-b860-7383468630e5.png`; that output was copied byte-for-byte to `demo/assets/brackenwheel-battle-sprite.png`. The source SHA-256 is `220db2a560c349a126477ccebbe62d3c9d42c795f775668ef4ee4fc961c7167a`. The prompt and recovered tool path are preserved in `raw-generation/attempt-01-prompt.txt` and `raw-generation/attempt-01-tool-receipt.json`.

The unchanged source alpha≥128 bounds are 993×1219 pixels, giving a width-to-height ratio of 0.8146. The shipped WebP alpha≥128 bounds are 405×498 pixels, giving a ratio of 0.8133. The source body is therefore broader than round one's 792×1205 bounds. These are image geometry measurements only; they do not establish readability in the arena.

`cwebp 1.6.0` encoded the PNG to a 512×512, 67,688-byte WebP using `-q 92 -alpha_q 100 -m 6 -mt -resize 512 512`. Repeating the same command produced a byte-identical output; the direct encoder exit was 0. The shipped file SHA-256 is `cb7dbd4c5c0be22b0bcfc9e7d6afc5dd8dccd89aa1063872f6e8958e5a8944ca`.

Independent critic review is pending. It should capture the actual 540×960 arena at DPR 1 with the body measured at 13 and 26 CSS pixels on light and dark arena tones, and retain native captures plus separate enlarged diagnostics. The 13-pixel render determines readability. This builder record makes no pass/fail claim.
