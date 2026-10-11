# GAME-SPELL-001 critic verdict

**Candidate:** frozen Git archive of `bccd0a979aad430b44905a2aec002fc7a4369930`.

**Verdict: PASS for the scoped v2 radius-damage spell.** The four requested runtime suites pass 41/41; `npm test -- app-shell` passes 1/1; `npm test -- visual-asset-manifest` passes 6/6. The requested actual Chrome journey also passes: the editable eight-card deck includes Squall Orb, a trusted point cast shows the 2,500-millitile telegraph, and impact deals 689 damage to an enemy troop. The four-elixir cast leaves six elixir, exact pending-impact restore succeeds, and the spell resolves after restore. See [browser-evidence.json](browser-evidence.json) and its desktop/phone captures.

The tests exercise enemy ground and air units, an enemy building, crown-tower damage at the estimated 30% modifier, a friendly crown tower left unchanged, an off-radius troop left unchanged, and exact tangency versus one millitile outside. I ran an additional live-battle probe on the frozen archive with a friendly troop, an enemy troop, and a distant enemy troop: only the enemy within radius took damage ([probe output](friendly-unit-probe-output.json)). Editable GameSession and AI selection, JS input bridging, RL action masking, spend/cycle, pending restore, and unchanged legacy no-profile bytes are covered by the 41 passing tests ([runtime test output](runtime-tests-output.txt)).

The UI and receipt keep the boundary honest: radius, target coverage, crown damage, rounding, and impact delay are identified as estimates; projectile flight and knockback are explicitly not simulated. I found no scoped spell behavior failure.

**Global release blocker on this frozen candidate:** `npm test -- nondeterminism-guard` fails 9/10 because `src/sim/battle-continuation-kernel.js` is 526,174 bytes against the unchanged 524,288-byte cap. This is a release-admission failure, not a spell parity failure. Exact output: [nondeterminism-guard-test-output.txt](nondeterminism-guard-test-output.txt).
