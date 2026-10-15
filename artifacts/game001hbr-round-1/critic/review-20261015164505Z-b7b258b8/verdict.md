# GAME-001HBR critic verdict

**PIECE:** GAME-001HBR source-aligned shared-resource lifecycle, candidate `c1d17ec2a5591e9871659dfdea9a4e9f4688ea6d`.

**VERDICT:** **Scoped PASS** for the HBR lifecycle and its requested Node proofs. This verdict does not certify the complete game release or authorize adoption of the separate pending Brackenwheel R1 work.

The version-2 receipt pins 540 ticks per generation interval, 3,900 ticks of lifetime, and +1 on destruction as source-aligned. The April 4, 2022 Supercell notes report a 9-second interval, 65-second duration, and +1 at destruction; the pinned building row independently carries 9,000 ms, 65,000 ms, and `mana_on_death=1`. The periodic amount remains datamine-only QUESTION. Recipient, cadence anchor/reset, capacity, placement, simultaneous order, same-tick behavior, and expiry ordering remain explicit QUESTION. HP and deployment time remain unverified QUESTION. No complete historical-role claim is made.

**Node checks:** policy 6/6, runtime 16/16, standalone resource fixture 13/13, roster buildings 11/11, nondeterminism guard 10/10, roster admission 7/7, and Brackenwheel 5/5. The attempted `npm run test:game-roster-buildings` is not a defined package script; its wired direct runner passed 11/11. Each exact command, raw stdout/stderr, and direct exit status is in this evidence directory.

**Independent compatibility proof:** corrected harness exit 0; all parent/candidate comparisons are equal. The JSON compares legacy v1 snapshots/replays at initialization and deployment, immediately before and after the tick-510 pulse, immediately before and after tick-4,200 expiry, and after restore. It also runs actual opposing Mossguard combat through legacy v1 Aether death at tick 479, verifies no v2 payout is added, and compares the shipped eight-card session at ticks 0, 1, 511, and 4,200. Use `legacy-compare-corrected.stdout` and `legacy-compare-corrected.exit`; the first harness run and its output are retained but are not relied on.

The candidate worktree was the existing `/private/tmp/game-001hbr-builder` checkout, verified at clean HEAD c1 both before and after. The HBR source files match commit 59c exactly; package files are unchanged from 7ef; the 523,788-byte `src/sim/battle-continuation-kernel.js` hash is `115c43146f5818c69a98120e856ddaa5d20243fced3609320d90edc7ae933bea` and its diff from 7ef is empty. The seven copied c72 guard/fixture files match c1 byte-for-byte; the source graph correction is in `sourcegraph.md`.

The known integration-audit and editable-deck count failures were not rerun: the full audit has documented stale 67-vs-68 assertions, and editable-deck has a documented 21-vs-22 assertion. This scoped HBR PASS is not a whole-release PASS.

**BIGGEST GAP:** root adoption still depends on separately accepting the pending Brackenwheel R1/K3 source and combined source-guard work. HBR’s scoped PASS must not implicitly accept that dependency.
