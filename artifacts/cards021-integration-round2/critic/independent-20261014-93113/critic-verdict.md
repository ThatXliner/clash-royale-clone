PIECE
CARDS-021I — Buried Coil collection/detail, portrait/lore and combat presentation/projection integration.

VERDICT
PASS for the scoped integration candidate at 4328451baff001721460e91b5611ee5f10b21883. The candidate meets the requested interaction and UI bar under the independent focused and full browser checks. This does not establish historical gameplay or visual parity.

EVIDENCE
- npm ci completed successfully with the required lockfile hash. test:ui-combat-state passed 13/13; game-ui-projection.test.js passed 36/36; test:visual-asset-manifest passed 6/6; card-expansion-art.test.js passed 2/2. The exact tests/cards021-browser-integration.test.js full journey passed 1/1, exit 0, in 313.9 seconds. Total focused test cases: 58/58.
- The browser run used Node 22.22.3, Chrome 155.0.8059.40 and Playwright 1.58.2. It recorded 56 PNGs and full JSON evidence, with no screenshot mismatches or browser errors. Six checkpoints (hidden, revealed, damaged, in-flight, reconcealed, expired) each cover phone/desktop and normal/reduced motion; before/after restore snapshots and screenshots match.
- Evidence shows the collection at 21 choices while retaining the prior 20 and default eight. The custom eight-card seed-zero run placed the actual structure for player and AI, charged cost 4, advanced the hand/cycle, accepted trusted pointer-driven commands, and materialized the deployments.
- The real combat path completes against hostile canonical and DOM sides for ground and air. Ground contact is attack tick 102, damage/contact tick 103, health 1766→1536, with the scaled health bar and vital-damage cue. Air contact is attack tick 352, damage tick 353, and live cursor tick 354; 230 raw damage against 221 health applies 221, kills the target, removes its marker and emits vital-damage plus unit-fall. These are separate event and cursor ticks.
- Both structures expire at tick 1800 with deathCause expiry, and the live cursor advances to 1801; they are not reported as destroyed. The browser reaches its natural terminal at tick 6645, restores, restarts the same custom eight and seed 0, then accepts a trusted cost-4 post-restart drop at tick 1 with cycle 1.
- The hidden WebP, revealed SVG and portrait are original project assets; the revealed SVG uses the required 512×512 viewBox. The manifest check passes without reference imports/bundling. Team-color pixel audits meet the minima in phone and desktop contexts. The structure uses 8.4% sizing versus 4.8% for troops. Default/prior-card rendering remains guarded by the passing UI and projection suites.
- Post-run hashes match the pre-run source fence. The non-artifact change against the requested parent is exactly the five UI source paths plus the browser integration test. Protected assets, manifest, package/lock and non-owned source guards match the parent. The assigned shared checkout remains at HEAD 161743ef9f1d305f54efa0386eca7dfdb3057663 and its index retains SHA-256 8e79bb09cef07999afb8d2c991c3f1a9b5562528a82d74eef865a39582def914.

BIGGEST GAP
reference/stats/SOURCES.md does not establish the non-cost Buried Coil values as authoritative. The prototype's damage, health, range, attack timing and lifetime must remain QUESTION values; this run proves the integrated behavior, not pre-evolution stat accuracy or the historical 109-card core. Historical footage was unavailable, so no visual parity claim is supported. Existing structure damage-flash work remains the separate VIS-003SH pending item; this evidence proves health/contact/audio and death presentation, not global hit-motion parity.

EVIDENCE CAVEAT
buried-coil-air-contact-death-phone-390x844.png is mislabeled: browser-evidence.json records its actual viewport as 1440×933. The phone and desktop checkpoint matrices are separately recorded at their correct 390×844 and 1440×933 viewports, so this is a filename error in one extra screenshot, not a missing viewport checkpoint.

RAW MATERIAL
See browser-evidence.json, terminal-browser-snapshot.json, raw *.tap and *.exit files, source-pre-hashes.txt, source-post-hashes.txt, 56 PNG screenshots, fence-audit.txt, and checksums.sha256 in this directory.
