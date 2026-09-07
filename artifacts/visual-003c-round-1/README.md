# Combat art, round 1 builder evidence

Scope: the eight cards exposed by the shipped default deck and opponent create nine unit kinds: coilblade, mossguard, brassbolt, reedsting, briar-runner, briar-darter, cinderling, copperskiff, skymaul. Both factions render each kind with a color and crest shape distinction. Expanded witness-only kinds use explicit ground/air family silhouettes and are not claimed as finished roster artwork.

All vector paths in `src/ui/combat-art.js` were authored in this repository for this round, CC0-1.0, on bounded 64×64 canvases, using the Rivermark bible palette. They are inline source artwork, like existing inline arena/card artwork; no image/font asset files or external bytes were added. The shipping build includes the module through its normal dependency collection.

`contact-sheet.png` mounts canonical fixture entities in the actual shipped arena at a 720×1280 viewport. Labels identify fixture art; labels are not shipped. `gameplay.png` is a real seed-2 terminal-profile session after 1000 deterministic steps. `render-evidence.json` records rendered sizes, path signatures, hidden link status, and exact restore parity.

Existing target-link and projectile-path DOM remains for compatibility with validated geometry tests but is display:none. Canonical position moves authored bodies; target events tilt them and recent damage brightens them. Canonical removal handles death. Projectiles, contact impacts and area sigils remain derived solely from the existing validated combat-effect feed.

Limits: this is asset work, not complete lifecycle animation. Current combat projection has no deploy-age, locomotion phase, or status pose fields; no new source was invented. Anticipation, deploy, movement gait, status poses, and death animation need the subsequent deterministic-motion work. Projectile silhouettes distinguish carrier directions, not every source archetype. Reference footage directory contains only NEEDED.md; no licensed gameplay still exists for a blind reference-parity comparison. No reference parity or independent PASS verdict is claimed here.

Run: `npm test -- visual-combat-assets ui-combat-state ui-combat-effects game-ui-projection` and `npm run build`.
