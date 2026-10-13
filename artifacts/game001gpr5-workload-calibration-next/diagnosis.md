# GAME001GPR5 target-aware latest-save trial

## Actual target competition at tick 13200

The frozen actual state had South's east lane tower at 289 HP and a tower-lethal forecast at tick 13352. North unit 159 (Reedsting, 260 HP, ground) was the immediate tower threat at `(14500, 16700)`. North unit 146 (Mossguard, 1112 HP, ground) was at `(14101, 14500)`, radius 500, with 202 damage. The Reedsting counter estimate was built against 159 as though the counter would target it.

The proposed Reedsting placement `(14500, 14750)` materializes at `(14500, 14500)` for a ground unit. Its distances are 399 to unit 146 and 2200 to unit 159, so the public target-acquisition API chooses 146. The trial's target-aware checks confirm that Reedsting, Copperskiff, and Mossguard each acquire unit 146 at their proposed spawn point. Cinderlings split across unit 146 and another current troop; none of its three members acquires the lethal source as a group-wide target.

The bounded placement probe checks all 3,341 legal command cells on the original planner's 250-millitile search grid. Reedsting acquires unit 146 at 1,206 points, unit 159 at zero points, and no current troop at 2,135 points. It also checks all 236 navigation nodes in the South half; zero acquire unit 159. The sweep is discrete. Separately, over the full legal integer own-half rectangle, the minimum squared center-distance difference `d²(159) - d²(146)` is 91,199 at `(17500, 14999)`, still positive. Therefore a singleton origin anywhere in that rectangle is closer to unit 146; if unit 159 is in Reedsting's sight, unit 146 is also in sight because it is closer and has the larger radius. This geometric bound is specific to singleton origins; the exact proposed Cinderlings formation is recorded member by member in the trial result.

## Timing and result

At tick 13200 the candidate rejected every counter and preserved the normal baseline Cinderlings command at `(14500, 5500)`. It made no emergency deployment. At tick 13260, Reedsting could acquire unit 159, but the estimated kill was tick 13383; Copperskiff and Mossguard estimates were ticks 13422 and 13434. All missed the 13352 tower deadline. At tick 13320, available counter members either selected another troop or could not kill unit 159 before the deadline.

The actual lane contacts from unit 159 were 131 damage at ticks 13268, 13309, and 13351. The third hit destroyed South's east lane, and the match ended at tick 13352 with North winning 2–1. The run stopped before the 18,000-tick requirement. It created 110 North and 52 South units; 8 North and 4 South were alive at the end. It recorded 90 tower contacts (48 against North, 42 against South), 47 North deployments, 24 South deployments, and 24 accepted South commands.

This candidate validates a target-selection guard and rejects the false tick-13200 counter. It does not solve GAME001GPR5. The affordable counter estimates against the actual acquired Mossguard are optimistic and still late: idealized earliest kills are tick 13530 for Cinderlings, 13617 for Reedsting, 13662 for Mossguard, and 13692 for Copperskiff. They omit movement, retaliation, attack interruption, and deaths; Cinderlings assumes all three members focus one target. The state requires an earlier intervention while the competing body is still approachable, before the late counter window becomes crowded and the tower has only 289 HP.

## Reproducibility

- Setup remains the seed-0 default-eight setup: 39,641 canonical bytes, SHA-256 `306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`.
- Candidate policy script SHA-256: `58352e7afd006443acbec9edcd819302bf71d1658175e2c9a3c51d8e1b5a2aaf`.
- Full result SHA-256: `04ef38dcf46327836f4617a290e252732031f5cd9e48ddd77e79afae6e917c37`.
- Trial process: PID 63061, attached exec session 15696.
- The original failed policy script and output are unchanged. No engine, test, or helper source was edited.
