# CARDS018I critic verdict

**PASS, with a browser startup timing qualification.** Candidate `7f8baee2922a7eff197f43d1804a526ffacacd22` (tree `d5245888b86d4ee82a061b9a300ecf3a5de72e19`) was reviewed from a clean `git archive` at `/tmp/cards018-critic.tthHLB`.

The bounded checks passed: browser integration 1/1, visual asset manifest 6/6, shipping isolation 13/13, publication pages 5/5, and `build:pages` emitted 47 release files totaling 5,668,348 bytes. The browser journey recorded two Ember attacks at ticks 126 and 222, with two source-identified 222-damage splash impacts at ticks 127 and 223. Same-tick tower damage was also included in the target health reconciliation. Damaged and in-flight states restored byte-for-byte and pixel-for-pixel at 390×844 and 1440×933 in both motion settings. The structure expired on event tick 1800 and appeared expired in state tick 1801; restart retained the custom deck.

I inspected the phone and desktop screenshots, the card details and deck views, and the original battle sprite. The PNG source is 1254×1254 RGBA with real transparent pixels; its released WebP is 512×512, 70,090 bytes, SHA-256 `9c805943147cbbe48030edb3ed2d197936319af6753a170af70d8210f1b5a7c9`. The release manifest and provenance hashes match. Card combat estimates remain explicitly marked QUESTION; the displayed four-elixir cost is source-backed. The asset isolation checks report zero byte overlap with the reference corpus.

The concrete qualification is that a separate exact-candidate browser attempt was startup-sensitive: autoplay advanced placement to tick 7, the first hit landed at 133, and the expected second hit by 229 did not occur; this clean-archive run placed at tick 0 and recorded the expected 126→222 cadence. This is evidence of a browser fixture timing race, not a reproduced cadence defect in the simulation.

Raw outputs and screenshots are retained beside this verdict. Changed source SHA-256: `src/content/visual-asset-manifest.js` `0599a400bf998cf704ffd2b2d946b2757ea9fe4373682a30d49e36a5b3586a12`. Browser integration test SHA-256: `tests/cards018-browser-integration.test.js` `a66f6d45e99d26b5fbddd2213be4836a4eb417002e432b4b3dfcd08d2e8e36ab`.
