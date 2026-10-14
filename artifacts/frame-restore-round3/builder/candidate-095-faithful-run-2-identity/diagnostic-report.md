# FRAME-RESTORE-001 candidate identity diagnostic, run 2

This was one bounded run on the private accepted-095 candidate checkout. It is a failed diagnostic, not a product pass. The candidate renderer source was unchanged during the run.

## Run identity

- Private source base: `095a8c55a6721c74f7555939a9ce21182bec3f2a`.
- Candidate source hashes: `src/ui/game-ui-projection.js` `19831d7084a0796df7e215a7306c8fcf86bcfe4f11da454b9039177e8de7a285`; `src/ui/game-browser-loop.js` `f84c5f1b6928241c0c91b5c6b9501626be414b6e41a045334cb7ee0c8990c7c5`; focused tests `5ad1b2c5d832b86202f5927fc51415e4db7fc554069e8c97bf90811a46dc42bd` and `4e037881bf066c848185e721a409e981cd3027b1ac87e1c62133a33287702234`.
- Browser runner PID `68354`, exec session `31889`, completed with exit 1 at the unchanged exact-viewport gate.
- Full run output: `frame-restore-001-causal-evidence.json`; first normal failure receipt: `first-normal-restore-preassert.json`; fatal assertion: `frame-restore-001-causal-fatal.txt`.

## Captured failure and identity change

At the first normal-motion restore, the viewport was 390×844 and the expected frame geometry matched: the slot was 390×659 and the scaled battle frame was x=9.65625, y=117, width=370.6875, height=659. The source attack happened at tick 170; the exact checkpoint/render was tick 171. Restore moved from tick 179 back to 171.

The screenshot was stable on both sides of restore, but the strict pixel comparison failed: five decoded pixels at x=105, y=700–704 differed, with maximum channel delta 3. Their before/after values are retained in the JSON. The pre-restore and post-restore PNGs are retained as `normal-contact-before-restore.png` and `normal-contact-after-restore.png`.

An intercepted native `replaceChildren` call on the existing HUD layer records the concrete DOM mutation: layer identity 7 (parent 8) replaced its sole `.game-ui-hud-frame` child identity 366 (`data-tick=179`) with new frame identity 374 (`data-tick=171`). This also replaced the nested HUD hand and all four cards. At the actual checkpoint, Brassbolt identity changed 355→376; its hand parent changed 356→377, projection ancestor 357→378, and frame ancestor 353→374. Other card identities changed 361→379, 362→380, and 363→381. The HUD layer itself stayed identity 7.

The differing screen pixels map under the measured frame scale/offset to the native-coordinate left edge of the Brassbolt card: the card rectangle is x=185, y=1121, width=112, height=128; the five viewport pixels fall at approximately native x=185.2 and y=1132–1140. Corresponding card HTML, computed style, and rectangle are exactly equal before and after; its border/shadow style is unchanged. In the later reduced branch, the same card rectangles and computed style also match while identities change.

This establishes that full HUD-frame replacement coincides with the reproducible five-pixel Brassbolt edge change in this faithful lifecycle. It does not establish that preserving card nodes alone removes the pixel change, because this run did not alter renderer behavior.

## Other gates and limits

The prepared run continued through its bounded lifecycle before failing the final aggregate assertion. A public `stepMany(0)` was accepted and proved byte-identical across browser/session/controller/input/audio/replay and viewport snapshots. The reduced-motion 173→174→173 restore added no pixels; all requested paired captures were stable. The overall candidate gate remains failed solely because `normalRestoreExact` is false.

CDP backend-node/layer-tree samples were collected only for the later reduced branch, not at the first normal restore. There, HUD backend node 445 remained the single composited HUD layer and the individual card nodes had no separate compositor layers; card backend IDs changed after restore. These observations cannot supply first-normal backend IDs. No further browser run, CSS injection, pixel masking, retry, or source edit was made.

## Next diagnostic implication

The next fix should preserve the retained HUD subtree for same-state restore without weakening full teardown or cleanup semantics. A focused follow-up must verify the identical natural 390×844 lifecycle and the exact whole-viewport pixel gate before claiming the five-pixel defect is fixed.
