# Gameplay capture manifest

No third-party gameplay was copied into this repository. Public videos and screenshots are generally copyrighted, and there was no clearly licensed download route that would make local redistribution appropriate. Capture these from gameplay you own, a creator who grants permission, or an explicitly reusable source.

These captures are **optional during initial development**. The clone can begin with reasonable, centralized estimates for uncertain timing, positioning, collision, and visual parameters, then use this footage later to tune them. This manifest is for calibration and fidelity verification, not a blocker for implementing the core rules.

Use the **pre-Evolutions ruleset** (ideally a recording made no later than February 2023), standard 1v1, level 11 tournament standard, default arena camera, no crop/zoom, and original HUD. Prefer 1080p/60 fps screen recordings. Save stills as lossless PNG and clips as H.264 MP4 with 1 second of lead-in/out. Do not use these assets in shipped game content; they are comparison references only.

## Required shots

1. **`01_empty_arena_start.png` — empty arena geometry.** Capture the first frame after both opening hands appear and before either player deploys. Show the entire arena, both bridges, all six towers, timer, hand, next-card slot, and full elixir bar. This is the calibration frame for playfield and tower coordinates.

2. **`02_deployment_grid_blue.png` — own-side placement mask.** Hold a 1-tile troop over several legal and illegal positions without releasing it. Capture when the legal blue deployment tint/grid is maximally visible, including the river, tower exclusions, and strips behind the King Tower.

3. **`03_destroyed_tower_deploy_pocket.png` — extended deployment zone.** After the opponent's right Princess Tower is destroyed, hold a troop at the forward-most legal enemy-side tile in that lane. Include the intact opposite tower and enemy King Tower so the unlocked pocket boundary can be counted.

4. **`04_hog_bridge_approach.mp4` — Hog Rider bridge path.** Place a lone level-11 Hog Rider at the back-right, with no defenders. Record from two tiles before the bridge until its first Princess Tower hit. The clip must include the exact bridge entry, path bend, target acquisition, jump/stride cadence, and first-hit startup.

5. **`05_hog_bridge_crossing.png` — Hog position calibration.** Extract a still from item 4 with the Hog's collision center approximately on the river midpoint. Keep the full arena visible so its center can be measured against bridge and tower centers.

6. **`06_knight_attack_cycle.mp4` — baseline melee timing.** Record a lone level-11 Knight attacking an equal-level, stationary high-HP target from acquisition through at least five attacks. Avoid Rage, Slow, stun, knockback, and nearby units. This checks the 1.2 s cycle and first-hit timing.

7. **`07_ranged_target_acquisition.mp4` — range and sight.** Place a Musketeer or Princess so an enemy walks into range without other targets. Record several seconds before acquisition through the first two shots; include both unit centers and nearby tile seams.

8. **`08_fireball_impact.mp4` — Fireball timing and radius.** Target a Princess Tower plus one troop near the edge and one just outside the expected 2.5-tile radius. Record from cast release through impact, knockback, damage-number/HP change, and lingering effect.

9. **`09_fireball_impact_peak.png` — spell VFX silhouette.** Extract the frame of maximum Fireball bloom from item 8. Preserve the full HUD and arena scale; do not exposure-correct or motion-blur the still.

10. **`10_elixir_single_midmatch.mp4` — single-elixir cadence.** Between 2:00 and 1:15 remaining, spend down to 0–2 elixir and record at least 12 seconds with the elixir bar, timer, hand costs, and next card unobstructed. Avoid Elixir Collector and elixir-generating modes.

11. **`11_elixir_double_transition.mp4` — rate transition.** Record continuously from 1:05 to 0:50 regulation time, keeping the elixir bar visible. Spend enough elixir that the bar does not cap at 10; capture the “Double Elixir” cue and the tick-rate change.

12. **`12_elixir_triple_transition.mp4` — overtime triple transition.** In a tied match, record from 1:05 to 0:50 remaining in overtime. Keep elixir below cap and capture both the timer/HUD cue and the transition from 1.4 s to roughly 0.933 s per elixir.

13. **`13_crowded_double_elixir.png` — visual-density stress case.** During double elixir, capture 12 or more visible units across both lanes, at least one building, one airborne troop, one active spell effect, both hands/HUD edges, and no end-of-match overlay. Prefer units around both bridges rather than a single clump.

14. **`14_tower_activation.mp4` — King Tower wake-up.** Use Tornado or another reproducible interaction to damage/activate an undamaged King Tower while both Princess Towers remain. Record from before the pull through the King's first three cannon shots to measure wake-up and aim timing.

15. **`15_princess_tower_destruction.mp4` — crown/tower teardown.** Destroy a Princess Tower with a single clearly readable final hit. Record 2 seconds before impact through the crown award and rubble/deployment-state transition; keep the scoreboard and surviving towers visible.

16. **`16_king_tower_destruction_match_end.mp4` — three-crown ending.** Capture the final King Tower hit, destruction animation, three-crown award, frozen battlefield, and transition to results. Start early enough to distinguish projectile travel from the destruction delay.

17. **`17_building_placement_footprint.png` — tile footprint.** Hold Cannon and then a 3x3 building at the central “anti-Hog” placement while tile highlights are visible. If one still cannot show both footprints, provide `17a_cannon_footprint.png` and `17b_large_building_footprint.png`.

18. **`18_air_ground_layering.mp4` — depth and occlusion.** Record Balloon or Baby Dragon crossing above a bridge while ground troops pass beneath/alongside and both Princess Towers fire. This is for shadow offsets, sprite ordering, projectile arcs, and flying-height comparison.

## Capture log

Alongside each asset, add a same-basename `.txt` file containing:

- source owner and permission/license;
- original recording date and game version if known;
- device resolution and frame rate;
- arena/mode;
- card and tower levels;
- any playback speed or edit applied (prefer `none`);
- exact source timestamp if extracted from a longer authorized recording.
