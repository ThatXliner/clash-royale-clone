PIECE: ART-005MR — Original Mossguard vector pose rig

VERDICT: FAIL

EVIDENCE: Focused test `node --test tests/mossguard-vector-rig.test.js` passed 1/1. A fresh 1440×1200 CSS viewport capture in installed Chrome 155.0.8059.40, deviceScaleFactor 1, driven through lock-pinned Playwright 1.58.2, completed with no page/console/request errors and no `--enable-unsafe-swiftshader`, `--disable-gpu`, `--use-angle`, or `--use-gl` arguments in the browser process family. The actual comparison screenshot shows the baseline and all 16 poses at a measured 13 CSS-pixel body height. Independent stroke-aware path bounds measure the baseline at 12.9990 CSS px and all 16 rig bodies at exactly 13 CSS px; every body is within (4,6,60,58), every body bottom is y=58, and the shadow-inclusive art bounds stay inside the 64×64 viewBox. The 96 gradient IDs are unique and all 256 gradient references resolve within their own SVG. The wood mask, leafy mantle, leaf shield, unarmed wooden fist, and both team colors are present, with visible shading in the enlarged diagnostic.

At the required 13 px body scale, however, the four phase silhouettes remain too close to read reliably across all facings. Walk A/B mostly retain the same head and torso silhouette and differ in tiny limb/fist shifts; windup/contact rely on a small fist moving a few native pixels. The enlargement reveals the authored path changes, but the native grid still reads as nearly the same idle guard unless the cell labels are used.

BIGGEST GAP: At 13 CSS px, walk A/B and melee windup/contact do not form four reliably distinct silhouettes across all four facings; most phase separation is confined to one or two pixels of limb/fist movement.
