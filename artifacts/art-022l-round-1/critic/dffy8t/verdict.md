PIECE: ART-022L — Brackenwheel scale-specific native and painted art
VERDICT: PASS
EVIDENCE:
- Fresh independent screenshots: `screenshots/13-css-light.png`, `13-css-dark.png`, `26-css-light.png`, `26-css-dark.png`; all are full 540x960 PNGs from Chrome 155 at DPR 1. The 13px cases selected native SVG and measured 12.9935546875 CSS px; 26px selected the exact frozen WebP and measured 25.9918212890625 CSS px. All four pages reported zero errors. `browser-evidence.json` records metrics and image hashes.
- Visual inspection at actual scale shows the auburn curled head silhouette, rust sleeves, teal apron, open copper C-shaped sickle, and separate feet on both arena tones. The 26px frozen artwork retains the same family identity; no facial-detail requirement was applied.
- Fresh tests passed with recorded direct exit codes: helper 6/6, visual-asset-manifest 6/6, shipping guard 13/13, release build 22/22, shipping isolation release 4/4. All exits are 0.
- SHA-256 values for the source PNG, painted WebP, and painted provenance exactly match commit afd9b341cdf2082937b4c7fad53f664f90be5b1c. The source diff adds one manifest entry and only the isolated art helper/fixture/provenance/tests; there are no sim, package, or existing game-UI integration changes.
- Candidate `b9dd02595506300978db16601278faa0a7acad52` is clean after release-test side effects were restored. `dist` stayed byte-identical. Playwright temporary Chrome profile check exited 0 with none remaining; the user Chrome profile was not used.

BIGGEST GAP: At 13px on the dark arena, the boot fills have modest contrast against the background, though the two feet remain visibly separate and meet the requested silhouette bar.
