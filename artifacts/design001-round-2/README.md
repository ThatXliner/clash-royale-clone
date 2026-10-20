# DESIGN-001 Round 2 review packet

Round 520 reviews the Claude-authored static proposal in `candidate/`. The verdict is FAIL for source accuracy. The six requested frames pass their target-size and layout checks, but the desktop collection says “Collection · 16” and presents an “All” filter while the base-source collection contains 23 choices: 19 troops, one spell, and three buildings. The board omits Duskwing Trio, Coppershade Flock, Kilnkeeper, Squall Orb, Ember Basin, Buried Coil, and Aether Well.

The original critic verdict, browser JSON, raw six PNGs, exact HTML input, runner, launch fences, and stdout/stderr are retained under `critic/`. The complete four-file Claude proposal is under `candidate/`. `lineage/` contains the prior copied board and the two-label copy-fix patch that produced the rendered HTML. No checkout or dependency cache is included.

The HTML and runner match the prelaunch hashes recorded in `critic/prelaunch.txt`. Every PNG's intrinsic dimensions and SHA-256 match the browser record. Source blob IDs are pinned to base commit `a754b30a18f4bc99af4617c0265b2a9055df74bc`. The capture used Node v22.22.3, Playwright 1.58.2, and Chrome 155.0.8059.85; it exited 0 with no external HTTP or font requests. Review of this proposal does not qualify a live application integration.

No shipped product change is included. The separate Claude Round 3 retry reached its session limit and supplied no deliverable; no R3 result is claimed.

Publication sanitization: environment values are retained only for an explicit runtime allowlist; all other values are redacted. The first unpublished commit was blocked by GitHub push protection for a credential in the original capture. That commit is replaced, not pushed or bypassed. The original environment capture remains private.
