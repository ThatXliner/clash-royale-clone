# Official footage source audit

Audited 2026-09-24 for VIS-001 and VIS-002. The audit was read-only; no video frames were downloaded, extracted, or copied.

## Official pre-Evolutions sources

- [The Miner Update TV Royale](https://youtu.be/zWW1dtcsDGk) is linked from Supercell's [29 March 2022 update post](https://supercell.com/en/games/clashroyale/blog/release-notes/the-miner-update-info-2/). It presents the Mighty Miner, badges, and card mastery. Its date and update context make it useful for broad era and appearance reference.
- [The Miner Update launch trailer](https://www.youtube.com/watch?v=hcDgrI15j0w) was published by the verified Clash Royale channel on 30 March 2022. It is promotional update footage.
- [The Summer Update TV Royale](https://www.youtube.com/watch?v=P-UeChdsoWA) was published by the verified Clash Royale channel on 24 June 2022 and announces Battle Banners.
- [The October 2022 TV Royale](https://www.youtube.com/watch?v=Zm0LjUBZyUY) was published by the verified Clash Royale channel on 22 October 2022. Supercell's [26 October 2022 update post](https://supercell.com/en/games/clashroyale/blog/release-notes/new-update-october-2022/) links the video and documents the Monk, Phoenix, and Path of Legends update.

These videos can offer qualitative examples of the period's arena, HUD, cards, and selected combat motion. The public pages do not identify an exact app build, device viewport/resolution, frame rate, arena/mode for each gameplay segment, or level-11 tournament-standard match. Update episodes and trailers are edited presentations rather than reproducible captures. No candidate timestamps were verified in this audit. The sources therefore cannot establish that the required empty start, deployment masks, or controlled motion and HUD states occur in usable frames. They cannot satisfy the VIS-001/VIS-002 acceptance bars as documented.

## Rights and provenance

`reference/footage/NEEDED.md` says public videos and screenshots are generally copyrighted, identifies no clearly licensed download route for local redistribution, and directs capture from gameplay the project owner may use, a creator who grants permission, or an explicitly reusable source. Supercell's [Fan Content Policy](https://supercell.com/en/fan-content-policy/) permits specified fan content, including gameplay videos, but does not clearly grant a license to extract and store Supercell's own YouTube footage as a comparison corpus for this clone. YouTube's [Terms of Service](https://uk.youtube.com/t/terms) restrict reproduction, downloading, or other use of content unless authorized by the service, permitted by law, or covered by prior written permission. No permission or license covering local frame extraction was found. Treat these links as viewing references only; a documented licensed capture is still required.

## Missing controlled captures

The exact source of record is [`reference/footage/NEEDED.md`](../footage/NEEDED.md). It calls for pre-Evolutions gameplay (ideally recorded by February 2023), standard 1v1, level 11, default camera, no crop or zoom, original HUD; preferably 1080p/60 fps. Stills should be lossless PNG; clips H.264 MP4 with one second of lead-in and lead-out. These are comparison references and must not ship in the game. A same-basename log for each capture must record source owner and permission/license, original recording date and game version if known, device resolution and frame rate, arena/mode, card and tower levels, playback speed or edit (prefer none), and exact source timestamp if extracted from a longer authorized recording.

The absent shot set is:

1. `01_empty_arena_start.png`: first frame after both opening hands appear and before either deployment; show full arena, both bridges, all six towers, timer, hand, next-card slot, and full elixir bar.
2. `02_deployment_grid_blue.png`: hold a one-tile troop over legal and illegal own-side positions without releasing; capture maximum blue tint/grid, river, tower exclusions, and strips behind the King Tower.
3. `03_destroyed_tower_deploy_pocket.png`: after the opponent's right Princess Tower falls, hold a troop at the forward-most legal enemy-side tile in that lane; show the intact opposite Princess Tower and enemy King Tower.
4. `04_hog_bridge_approach.mp4`: lone level-11 Hog Rider from two tiles before the back-right bridge to first Princess Tower hit, with bridge entry, path bend, target acquisition, jump/stride cadence, and first-hit startup.
5. `05_hog_bridge_crossing.png`: still from shot 4 with the Hog collision center at the river midpoint; retain full arena for measurement against bridge and tower centers.
6. `06_knight_attack_cycle.mp4`: lone level-11 Knight against an equal-level stationary high-HP target, acquisition through at least five attacks; no Rage, Slow, stun, knockback, or nearby units.
7. `07_ranged_target_acquisition.mp4`: Musketeer or Princess as an enemy walks into range with no other targets; include several seconds before acquisition through its first two shots, both unit centers, and nearby tile seams.
8. `08_fireball_impact.mp4`: Fireball on a Princess Tower, one troop near the expected 2.5-tile radius edge and one just outside; cast through impact, knockback, HP/damage change, and lingering effect.
9. `09_fireball_impact_peak.png`: peak Fireball bloom from shot 8, full HUD and arena scale, with no exposure correction or motion blur.
10. `10_elixir_single_midmatch.mp4`: between 2:00 and 1:15 remaining, spend to 0–2 elixir and record at least 12 seconds with bar, timer, hand costs, and next card unobstructed; no Elixir Collector or elixir-generating mode.
11. `11_elixir_double_transition.mp4`: continuous regulation-time capture from 1:05 to 0:50, elixir below cap, showing the Double Elixir cue and rate change.
12. `12_elixir_triple_transition.mp4`: tied overtime from 1:05 to 0:50 remaining, elixir below cap, showing timer/HUD cue and change from 1.4 seconds to about 0.933 seconds per elixir.
13. `13_crowded_double_elixir.png`: at least 12 visible units across both lanes during double elixir, one building, one airborne troop, one active spell, both hands/HUD edges, no end overlay; prefer units around both bridges.
14. `14_tower_activation.mp4`: reproducibly damage an undamaged King Tower while both Princess Towers remain; record before the pull through the King's first three cannon shots.
15. `15_princess_tower_destruction.mp4`: clearly readable final hit destroying a Princess Tower; include two seconds before impact through crown award, rubble/deployment-state transition, scoreboard, and surviving towers.
16. `16_king_tower_destruction_match_end.mp4`: final King Tower hit, destruction, three-crown award, frozen battlefield, and results transition; start early enough to distinguish projectile travel from destruction delay.
17. `17_building_placement_footprint.png`: with tile highlights, hold Cannon and a 3x3 building at the central anti-Hog placement; if needed, supply `17a_cannon_footprint.png` and `17b_large_building_footprint.png`.
18. `18_air_ground_layering.mp4`: Balloon or Baby Dragon crossing above a bridge while ground troops pass beneath or alongside and both Princess Towers fire; show shadows, sprite ordering, projectile arcs, and flying height.

Accordingly, official public media does not remove the capture dependency: VIS-001 needs shot 1, and VIS-002 needs the controlled bridge, combat, effect, tower, elixir, and overtime evidence in shots 2–18.
