PIECE: CARDS-016K — two additional air-swarm runtime roles

VERDICT: FAIL

EVIDENCE:

- Reviewed the frozen commit `e3413fdc529a366a56e2d0b35afb7fa7b14dcd6f` from a clean `git archive` at `/tmp/cards016k-core-critic.qVCQJH`, with only a `node_modules` symlink. Source was not changed. The current workspace HEAD had advanced during review, so all execution and probes target the frozen archive.
- Focused command is captured in `focused-tests.log`: 80/80 passed, exit 0, 84,990 ms. It covers the swarm catalog, strict source admission, profile and projectile contracts, public shared-session deployment, seeded AI choice, interactions, and restore.
- `npm test -- nondeterminism-guard shipping-isolation-guard` passed: nondeterminism 10/10 and shipping isolation 13/13, exit 0. These checks retained the 524,288-byte canonical string cap; `kernel-check.txt` records the unchanged kernel source hash and diff result.
- Independent public `GameSession` probes in `session-probes.json` deploy both cards for player and seeded natural opponent, assert five/six entities, exact spend and cycle, and byte-exact snapshot restore. The two-card AI hand chooses Coppershade and repeats exactly at seed 2. All four air/ground attacker-target pairings cause the expected first damage. Coppershade has an in-flight projectile at tick 91 and a death at tick 94; both snapshots restore and continue exactly. A forged source delivery policy is rejected.
- Reference mapping was checked test-only against the pinned Bats and Minion Horde rows. All mapped values match, but the low-confidence mechanics are not carried as runtime questions; see `confidence-gap.md`. No source rows or reference assets are bundled.
- Default setup remains exactly byte-identical to baseline commit `6dcf64b81751f69f9fe7520878ac136bda9143ed` for seeds 0 and 23 at ticks 0, 120, and 900 (`default8-comparison.json`). The editable boundary is 15 troop IDs plus `squall-orb` = 16 total; the default playable count is 8. Both swarm IDs are rejected by editable troop, mixed editable, and RL environment witnesses.
- Catalog audit reports 55 admitted session card IDs/60 occurrences from 61 IDs/66 occurrences claimed, and 39 admitted troop profile IDs/41 occurrences from 41 IDs/43 occurrences claimed, with two question-only troop IDs/occurrences. These admission totals do not establish full-roster execution.
- The source evidence explicitly leaves `summon_radius` 750/600 interpretation, the 100 ms deploy-delay semantics, and historical formation/stagger unresolved. The implementation's whole-squad deployment event and generic deterministic formation are supported as scoped runtime behavior only, not historical parity.

BIGGEST GAP: runtime confidence metadata omits the source-flagged HP, damage, cadence, first-hit, deploy, range, sight, speed, targets, and count fields for both swarms. That violates CARDS-016K's explicit-QUESTION requirement even though the evidence prose correctly discloses the datamine limitations.

SCOPE LIMIT: no fresh 18,000-tick endurance was run for this runtime hash. The earlier 146-run cannot establish endurance for this changed core. UI/public selection and art remain outside this core verdict.
