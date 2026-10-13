# GAME001GPR5 overtime screen-defense trial

## Hypothesis

When overtime has only one South lane tower left and a living North unit currently targets that tower, an affordable singleton ground unit can intercept the closest current tower-targeter. Evaluate placement through the existing legal-deployment evaluator, then use the public target-acquisition routine on the actual materialized spawn position. Accept a counter only if it acquires that screen, is within the screen's current attack range, and has enough HP to survive the screen's current first-hit delay and cadence until the estimated kill.

The selection is state-based: current overtime phase, surviving lane, current tower-targeting units, current hand/elixir, target acquisition, and current unit attack/durability data. It does not use a future spawn time, a particular unit ID, or a seed-specific condition. The frozen 300-tick South planner remains the fallback outside a selected screen opportunity.

## Trial prediction

At the saved 13,200-tick state, North Mossguard 146 is the closest current tower-targeting screen at 1,112 HP and deals 202 damage per hit. The predicted singleton mirror at the nearest legal point should acquire it. Using its current first-hit delay and 72-tick attack cadence, the mirror is projected to take six 202-damage hits (1,212 total) before its estimated kill, within its 1,766 HP. Reedsting is expected to fail the survival gate, Copperskiff cannot be targeted by the ground screen, and Cinderlings do not acquire only the selected screen.

This duel projection does not prove it will save South's tower: another current attacker may also retarget the spawned body, and the estimate omits later target changes. The one full replay measures that outcome with ordinary simulation targeting and damage.
