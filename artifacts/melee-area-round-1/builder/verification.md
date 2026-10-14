# MELEE-AREA-001 builder candidate

This isolated candidate starts at `bd0507248059b54eacc8d5bb7213899cfaf712f2`. It adds a shared, opt-in melee area contact path to `BattleCombat` and `BattleTowerCombat`, and moves the existing projectile-splash victim selector into a pure shared module. No card catalog, roster, card choice, art, or reference file is changed.

## Runtime boundary and confidence

The only enabled behavior is the closed `melee-area-question-v1` runtime policy in an authenticated setup. Its implementation choices are all explicitly provisional: center at attacker position, 2,000 millitiles, inclusive circle overlap, base-attack damage for secondaries, ground-only targets, and no structure targets. It hits the selected primary once, scans living and targetable enemy ground units, excludes the primary from the secondary scan, and emits secondary hits in stable ID order in the existing simultaneous damage batch. The policy is opt-in and omitted from existing setup/snapshot shapes when absent.

These values and mappings are not authoritative historical stats and do not establish full melee-AoE parity or full-role admission. In particular, the signature fields `self_as_aoe_center`, mass, collision, and `attack_finish` remain unresolved questions; this candidate does not claim to implement their historical meaning. Structure damage, alternative area center/radius/damage/layers, timing and collision interactions, and card-specific mechanics also remain outside the claim. Existing combat snapshots without the policy retained byte-for-byte SHA-256 fixtures from the pristine baseline.

## Verification

All commands below completed successfully on this candidate:

| Command | Result |
| --- | ---: |
| `node --test tests/melee-area.test.js` | 5/5 |
| `npm run test:battle-combat` | 10/10 |
| `npm run test:battle-towers-kernel` | 7/7 |
| `npm run test:game-roster-troops-ordinary` | 25/25 |
| `npm run test:game-roster-troops-projectile` | 6/6 |
| `npm run test:melee` | 6/6 |
| `npm run test:area-damage` | 11/11 |
| `npm run test:game-session` | 9/9 |
| `npm run test:content-schema` | 20/20 |
| `npm run test:rl-environment` | 12/12 |
| `npm run test:nondeterminism-guard` | 10/10 |
| `npm run test:release-build` | 22/22 |

Coverage includes actual BattleCombat and BattleTowerCombat contact, clustered ground-unit selection, primary deduplication, dead/friendly/untargetable/air/outside-radius/structure exclusions, stable victim ordering, pre-contact restore and fork continuation, forged setup/snapshot rejection, and pristine baseline hashes for existing direct/projectile/tower snapshots. The shared projectile selector was also checked by the ordinary and projectile suites.

The byte-exact default snapshot SHA-256 values pinned by the new test are: direct `be7f2c2ff6317ce3c26355b0c674cccd2fc0be5192536ddf0e36780587f1d952`, projectile `4b6358927f4f8a69f72389e7676a74da78fdde485d67f5f441d3e23bf808598e`, and tower wrapper `f4239db6452bf5e2c7b0b44f5dcf9cab915aebab6aafe206aa4fe5a6cdb12a1b`.

Release-size bound: `src/sim/battle-continuation-kernel.js` is 524,103 bytes against the existing 524,288-byte cap. `git diff --check` and source syntax checks passed. The release-build test wrote four pre-existing RELEASE-001B evidence files as a test side effect; those exact paths were restored to the candidate base before freezing. No full endurance run was started for this candidate.

Raw TAP outputs for melee-area, battle combat, tower kernel, session, schema, RL, nondeterminism guard, release build, melee, and area damage are retained under `builder/logs/` where captured. Ordinary and projectile roster suite counts were recorded from their completed test runs.
