# Source graph correction

This records the exact ancestry and byte fences while preserving the frozen builder note unchanged.

- HBR source commit `59c4e3c7483ace05f570146f6d57ba83222e5e0b` and guard candidate `c72cd1695258be2af6d3ab4145218bcd673aa1cf` are siblings with parent `7ef53c7ca1a914d62a60b2ea3b148ca452d575f7`.
- `git diff --exit-code c72 7ef -- src/` exits 0: c72's production source equals the 7ef parent.
- `git diff --name-status c72 59 -- src/` lists exactly the four HBR runtime files: `src/content/cards/buildings-resource.js`, `src/content/session-card-catalog.js`, `src/sim/session-building-profile-receipts.js`, and `src/sim/session-building-runtime.js`. This is the HBR delta over their shared parent, not a missing c72 production change.
- `git diff --exit-code 59 c1 -- src/` exits 0: c1's production source is exactly the HBR source commit.
- All seven c72 guard/fixture files compare byte-for-byte equal in c1. The HBR-owned roster test count adjustment is an additional fixture/test edit.
- The candidate's tracked tree and index are clean at c1; direct `git diff HEAD` and `git diff --cached HEAD` both exit 0.

The frozen `artifacts/game001hbr-round-1/builder/combined-candidate.md` statement about c72 production source being identical to the HBR base is ambiguous if read as c72-versus-59. The derived graph above is the precise comparison: c72 source equals 7ef; 59 differs by HBR; c1 source equals 59. The raw builder note was left untouched.

The official publisher page opened for this review is [Balance Changes April 2022](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-april-2022/), dated 4 April 2022. Its Elixir Collector section states +1 at destruction, duration 70s to 65s, and generation interval 8.5s to 9s; it also says total lifetime production stayed 8. At 60 ticks/second, the independently corroborated interval and duration are 540 and 3,900 ticks. The pinned scope evidence at commit d268715d0822c3d7386be44999daa83a2a440fde ties the synthetic local Aether Well signature to the unique pinned Elixir Collector rows and preserves the consumer-semantic limits. The review did not promote those unresolved choices.
