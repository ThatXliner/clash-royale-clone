# CARDS-022K round 2 builder evidence

Base: `7ef53c7ca1a914d62a60b2ea3b148ca452d575f7`. The repair is limited to the simulation graph allowlist, its adversarial audit, exact roster/admission fixtures, a Brackenwheel direct-occurrence fixture, and a public RL contact/restore test. The eleven production source files from the frozen candidate are byte-identical before and after.

The nondeterminism guard now admits only the exact melee-area authority file alongside its existing exact files. Tests confirm the real shared authority is in the AST and runtime-probe closure, injected clock/RNG accesses are rejected, clock/RNG callers remain rejected, and importing an unauthorized shared sibling still fails closed.

The catalog audit adds the single exact `brackenwheel` occurrence, including its deterministic area-contact binding. Admission totals advance by one; exclusions and question-only counts remain unchanged. The RL test drives the public action and observation APIs to tick 234, restores the authentic checkpoint, then verifies the identical tick-235 HP changes and area-contact replay. The RL API itself reports HP observations rather than events; replay is reconstructed from its authentic serialized GameSession snapshot.

Final checks with direct exits: `npm ci` 0; nondeterminism guard 10/10; game-roster admission 7/7; Brackenwheel RL/contact 5/5; the original adjacent-core command 25/25; release/host suite 29/29 with `TMPDIR=/tmp` to keep the workspace-parent and temporary-root cases distinct. The first release-host retry and first guard-test attempt are retained under their original names with raw output and exits. Round 1 critic failures and source fence were copied byte-for-byte and their hashes are in `round1-copy-receipt.json`.

The round does not change runtime production code or claim full historical mechanics parity. Browser endurance is outside this bounded repair.
