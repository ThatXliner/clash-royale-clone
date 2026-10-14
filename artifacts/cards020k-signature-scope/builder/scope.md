# Pinned source signature scope: card 26000043

Status: preparation only. This note records the pinned raw signature and the existing core seam; it does not establish full-role parity or implement a card. No product or reference-source files were changed. Source snapshot: https://github.com/RoyaleAPI/cr-api-data/commit/54fdef52c5086393b085f57faeeab8ef86b28160 (commit date and cutoff recorded in `reference/stats/SOURCES.md`). Current checkout observed at HEAD `6198883470fa48f6746974d7590168ae3011ac37`; the worktree already contains unrelated dirty changes, which this note does not describe as part of this artifact.

## Provenance and extraction integrity

The local provenance ledger identifies commit `54fdef52c5086393b085f57faeeab8ef86b28160` as RoyaleAPI's final constants snapshot before 2023-03-01, committed 2023-02-18. It rates roster identity/cost/rarity/type high confidence and character constants medium-high as a datamine snapshot; the normalized row retains its own per-field corroboration flags. Raw distances and times are expressed in thousandths of a tile and milliseconds; raw speed values 45/60/90/120 map to 0.75/1/1.5/2 tiles per second. The ledger explicitly says the common schema omits abilities, charge/dash stages, shields, death effects, lifetimes, buffs and some other mechanic families, and component arrays do not model a complete recursive death-spawn graph. See [local source ledger](reference/stats/SOURCES.md#L9-L45) and [schema](reference/stats/SCHEMA.md#L3-L40).

The following byte counts, SHA-1 Git blob IDs and SHA-256 digests were computed from the downloaded pinned JSON and checked against the pinned Git tree; each local Git blob ID matches its tree entry. The aggregate file's troop/character entries are deep-equal to the standalone rows.

| Pinned source file | Bytes | Git blob SHA-1 | SHA-256 | Row / lookup evidence |
| --- | ---: | --- | --- | --- |
| `docs/json/cards.json` | 41785 | `9a26927d54fbf358138e10d2f5bb5519e6f8602e` | `312574f75ada2ff5ad605e1eb122c3b620d1163c5a675d67cd9e64122b3d6946` | cards.json#L475-L485 |
| `docs/json/cards_stats_troop.json` | 261572 | `2fc9257051c37521f0ca2ad4a1931686ef94842b` | `a6e044cb510ec280dacfd54e546558276e5f40d50fbd16f47f3ff16126add33a` | cards_stats_troop.json#L3571-L3653 |
| `docs/json/cards_stats_characters.json` | 1156641 | `a86a93da5b27a27ae891cfa3c67b13b7f3b2080e` | `37734d1508584e43851395c01b2d10046667eb6dc27daef37e5df56e74f933ac` | cards_stats_characters.json#L13034-L13353 |
| `docs/json/cards_stats_projectile.json` | 137874 | `091987427e84379a4c1d0ebacc1ce1fecd2d0364` | `c883516f54f6c17ee77c15cf484b01da9ded22602214c3b0d42b1ab823bd3197` | no linked row; dataset has 79 entries |
| `docs/json/cards_stats_character_buff.json` | 75549 | `68ce48cb8a2087f48f2d24d4a8a36cc210fd2e62` | `20da44c09a3e51c06b97291530f6b8fee909c57d2b5c7a7c64adf1721e0999f0` | no linked row; dataset has 38 entries |
| `docs/json/cards_stats.json` | 2795170 | `0098d94065703fdb81a7ee98255ce5652c358b5e` | `5a75c35e37b895a2c64223d4050f08008d8722531af248ac9fd251e9390f5e95` | aggregate duplicates of the Elite Barbarians troop and AngryBarbarian character rows are deep-equal to standalone files |

Primary pinned row links: [card roster](<https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards.json#L475-L485>), [troop deployment row](<https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json#L3571-L3653>), [summoned character row](<https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L13034-L13353>). The commit is the version pin; branch-head sources are not used.

## Identity and linked-object graph

The roster card row maps `id=26000043` → `key=elite-barbarians` → `sc_key=AngryBarbarians`. The matching troop record `AngryBarbarians` has `key=elite-barbarians`, summons `AngryBarbarian` twice at level-index 0, has no second character, and carries `summon_deploy_delay=100`. Its raw description says “a pair”; the normalized card has count 2. The direct outgoing character is therefore an unambiguous two-member initial composition in this dump.

The troop row's `projectile` and `custom_first_projectile` are null and its projectile count/interval/angle/wave values are zero. The character row's `projectile`, `custom_first_projectile`, `projectile_special`, `projectile_effect_special`, `spawn_projectile`, and `death_spawn_projectile` are null. There is no direct projectile name or ID to join; the pinned projectile file contains 79 records and none is linked by this row. The character-buff file has 38 records and no `AngryBarbarian` mention; the character's outgoing buff pointers are null. The troop row's `hero_ability` and `passive_ability` and the character row's `ability` are null. The pinned source tree exposes no separate ability JSON table.

These are facts about this export and its links. They mean “the pinned export supplies no linked projectile/buff/ability record,” not “the game proves no ability, status, or special behavior.” The source ledger's stated schema limits make that stronger conclusion unsafe.

## Normalized row and unverified mechanics

[The existing normalized row](reference/stats/cards.json#L2315-L2365) resolves the level-11 common character arrays at index 10 to two identical members: 1,341 HP; 384 damage; 1.4-second attack cycle; 0.9-second source load time; 1.0-second deploy time; 1.2-tile range; 6.0-tile sight; base raw speed 90 → 1.5 tiles/second (categorical “fast”); ground attacks; count 2; and no normalized area radius. Its `unverified_fields` are exactly `hitpoints`, `damage`, `hit_speed_seconds`, `first_hit_seconds`, `deploy_time_seconds`, `range_tiles`, `sight_range_tiles`, `movement_speed_tiles_per_second`, `movement_speed`, `targets`, and `count`. Those values remain QUESTIONS; the raw datamine is not second-source verification.

The full raw records follow so the source review does not collapse the card to that common row.

### Raw card record — `cards.json`, lines 475–485

```json
{
  "key": "elite-barbarians",
  "name": "Elite Barbarians",
  "sc_key": "AngryBarbarians",
  "elixir": 6,
  "type": "Troop",
  "rarity": "Common",
  "arena": 10,
  "description": "Spawns a pair of leveled up Barbarians. They're like regular Barbarians, only harder, better, faster and stronger.",
  "id": 26000043
}
```

### Raw troop deployment record — `cards_stats_troop.json`, lines 3571–3653

```json
{
  "name": "AngryBarbarians",
  "icon_swf_china": null,
  "icon_file": "angry_barbarian",
  "highres_placeholder_asset": "sc/ui_card_info_fx.sc#card_info_fx_common_empty",
  "highres_image_filename": "image/chr/elite_barbarians_dl.png",
  "unlock_arena": "Arena_L",
  "unlock_level": 0,
  "rarity": "Common",
  "not_visible": false,
  "tribe": null,
  "mana_cost": 6,
  "prestige_count": 2,
  "mana_cost_from_summoner_mana": false,
  "not_in_use": false,
  "mirror": false,
  "custom_deploy_time": 0,
  "summon_character": "AngryBarbarian",
  "summon_number": 2,
  "summon_character_level_index": 0,
  "summon_character_second": null,
  "summon_character_second_count": 0,
  "summon_radius": 700,
  "summon_width": 0,
  "summon_deploy_delay": 100,
  "summon_deploy_delay_second": 0,
  "character_skin": null,
  "character_skin2": null,
  "radius": 0,
  "height": 0,
  "projectile": null,
  "projectile_interval": 0,
  "projectile_angle": 0,
  "projectile_waves": 0,
  "projectile_wave_interval": 0,
  "spell_as_deploy": false,
  "can_place_on_buildings": false,
  "can_place_on_water": false,
  "instant_damage": 0,
  "duration_seconds": 0,
  "instant_heal": 0,
  "heal_per_second": 0,
  "pushback": 0,
  "multiple_projectiles": 0,
  "custom_first_projectile": null,
  "buff_time": 0,
  "buff_time_increase_per_level": 0,
  "buff_number": 0,
  "buff_type": null,
  "buff_on_damage": null,
  "only_own_troops": false,
  "only_enemies": false,
  "can_deploy_on_enemy_side": false,
  "touchdown_limited_deploy": false,
  "cast_sound": null,
  "area_effect_object": null,
  "tid_info": "TID_SPELL_INFO_ANGRY_BARBARIANS",
  "indicator_file_name": null,
  "indicator_prestige_swf": null,
  "indicator_prestige_export_name2": null,
  "indicator_prestige_export_name3": null,
  "hide_radius_indicator": false,
  "release_date": null,
  "elixir_production_stop_time": 0,
  "dark_mirror": false,
  "stats_under_info": false,
  "hero_ability": null,
  "passive_ability": null,
  "hp_modifier": 0,
  "damage_modifier": 0,
  "deploy_w_tile_margin": 0,
  "full_lane_deploy": false,
  "ability_cooldown": 0,
  "deploy_start_y": 0,
  "deploy_end_y": 0,
  "pve_defense_type": "Attacker",
  "type_of_spell": null,
  "name_en": "Elite Barbarians",
  "hitpoints_per_level": null,
  "damage_per_level": null,
  "dps_per_level": null,
  "key": "elite-barbarians"
}
```

### Full raw character record — `cards_stats_characters.json`, lines 13034–13353 (278 fields)

```json
{
  "name": "AngryBarbarian",
  "rarity": "Common",
  "flags": null,
  "tribe": null,
  "sight_range": 6000,
  "deploy_time": 1000,
  "charge_range": 0,
  "speed": 90,
  "hitpoints": 524,
  "hit_speed": 1400,
  "load_time": 900,
  "damage": 150,
  "damage_special": 0,
  "crown_tower_damage_percent": 0,
  "load_first_hit": false,
  "load_after_retarget": false,
  "stop_time_after_attack": 0,
  "stop_time_after_special_attack": 0,
  "projectile": null,
  "custom_first_projectile": null,
  "multiple_projectiles": 0,
  "multiple_targets": 0,
  "all_targets_hit": false,
  "range": 1200,
  "minimum_range": 0,
  "special_min_range": 0,
  "special_range": 0,
  "special_load_time": 0,
  "special_ignore_buildings": false,
  "special_attacks_to_ignore_list": false,
  "attacks_ground": true,
  "attacks_air": false,
  "death_damage_radius": 0,
  "death_damage": 0,
  "death_push_back": 0,
  "attack_push_back": 0,
  "melee_pushback": 0,
  "is_melee_pushback_all": false,
  "life_time": 0,
  "projectile_special": null,
  "projectile_effect_special": null,
  "area_damage_radius": 0,
  "target_only_buildings": false,
  "target_only_troops": false,
  "target_only_towers": false,
  "target_only_king_tower": false,
  "special_attack_interval": 0,
  "buff_on_damage": null,
  "buff_on_damage_time": 0,
  "starting_buff": null,
  "starting_buff_time": 0,
  "mesh": null,
  "prestige_swf": "sc/chr_prestige6_dl.sc",
  "prestige_export_name2": "angry_barbarian_prestige",
  "prestige_export_name3": null,
  "prestige_red_export_name2": null,
  "prestige_red_export_name3": null,
  "attached_character": null,
  "attached_character_height": 0,
  "damage_effect_special": null,
  "spawn_effect_once": false,
  "crowd_effects": false,
  "pushback": 0,
  "ignore_pushback": false,
  "scale": 100,
  "collision_radius": 500,
  "mass": 4,
  "tile_size_override": 0,
  "area_buff": null,
  "area_buff_time": 0,
  "area_buff_radius": 0,
  "health_bar": "Medium",
  "health_bar_offset_y": 0,
  "show_health_number": false,
  "flying_height": 0,
  "fly_direct_paths": false,
  "fly_from_ground": false,
  "hovering": false,
  "grow_time": 0,
  "grow_size": 0,
  "morph_character": null,
  "heal_on_morph": false,
  "area_effect_on_morph": null,
  "morph_time": 0,
  "morph_keep_target": false,
  "attack_start_effect_special": null,
  "dash_immune_to_damage_time": 0,
  "dash_cooldown": 0,
  "jump_height": 0,
  "dash_push_back": 0,
  "dash_radius": 0,
  "dash_damage": 0,
  "dash_filter": null,
  "dash_constant_time": 0,
  "dash_landing_time": 0,
  "dash_min_range": 0,
  "dash_max_range": 0,
  "dash_distance": 0,
  "dash_count": 0,
  "dash_secondary_range": 0,
  "dashing_damage": 0,
  "dashing_pushback": 0,
  "dash_to_target_radius": false,
  "jump_speed": 0,
  "spawn_start_time": 0,
  "spawn_interval": 0,
  "spawn_number": 0,
  "spawn_limit": 0,
  "destroy_at_limit": false,
  "spawn_pause_time": 0,
  "spawn_character_level_index": 0,
  "spawn_character": null,
  "spawn_character_with_deploy": false,
  "spawn_character_level_index2": 0,
  "spawn_character2": null,
  "spawn_character_level_index3": 0,
  "spawn_character3": null,
  "spawn_projectile": null,
  "spawn_deploy_base_anim": null,
  "spawn_radius": 0,
  "spawn_attach": false,
  "spawn_attach_max_rotation": 0,
  "death_spawn_deploy_base_anim": null,
  "death_spawn_count": 0,
  "death_spawn_character": null,
  "death_spawn_count2": 0,
  "death_spawn_character2": null,
  "death_spawn_character3": null,
  "death_spawn_is_same_unit": false,
  "randomize_death_spawn": false,
  "death_spawn_projectile": null,
  "death_spawn_radius": 0,
  "death_spawn_min_radius": 0,
  "death_spawn_allow_over_river": false,
  "spawn_angle_shift": 0,
  "spawn_max_angle": 0,
  "death_spawn_deploy_time": 0,
  "death_spawn_pushback": false,
  "death_inherit_ignore_list": false,
  "kamikaze": false,
  "kamikaze_time": 0,
  "spawn_pathfind_speed": 0,
  "spawn_pathfind_morph": null,
  "spawn_pushback": 0,
  "spawn_pushback_radius": 0,
  "spawn_area_object": null,
  "spawn_area_object_level_index": 0,
  "ingame_pathfind_speed": 0,
  "ingame_pathfind_stop_deploy_base_anim": null,
  "projectile_start_radius": 450,
  "projectile_start_z": 450,
  "stop_movement_after_ms": 0,
  "wait_ms": 0,
  "dont_stop_move_anim": false,
  "is_summoner_tower": false,
  "no_deploy_size_w": 0,
  "no_deploy_size_h": 0,
  "attack_sequence": 0,
  "attack_seq_state_effect1": null,
  "attack_seq_state_effect2": null,
  "attack_seq_state_effect3": null,
  "variable_damage_time1": 0,
  "variable_damage2": 0,
  "melee_pushback2": 0,
  "is_melee_pushback_all2": false,
  "variable_damage_time2": 0,
  "variable_damage3": 0,
  "melee_pushback3": 0,
  "is_melee_pushback_all3": false,
  "targetted_damage_effect1": null,
  "targetted_damage_effect2": null,
  "targetted_damage_effect3": null,
  "damage_level_transition_effect12": null,
  "damage_level_transition_effect23": null,
  "flame_effect1": null,
  "flame_effect2": null,
  "flame_effect3": null,
  "target_effect_y": 0,
  "self_as_aoe_center": false,
  "hides_when_not_attacking": false,
  "hide_time_ms": 0,
  "hide_before_first_hit": false,
  "special_attack_when_hidden": false,
  "targeted_hit_effect_special": null,
  "targeted_effect_visual_pushback": 0,
  "up_time_ms": 0,
  "appear_pushback_radius": 0,
  "appear_pushback": 0,
  "appear_area_object": null,
  "mana_collect_amount": 0,
  "mana_generate_time_ms": 0,
  "mana_generate_limit": 0,
  "mana_on_death": 0,
  "mana_on_death_for_opponent": 0,
  "has_rotation_on_timeline": false,
  "turret_movement": 0,
  "projectile_y_offset": 0,
  "charge_speed_multiplier": 0,
  "deploy_delay": 400,
  "deploy_animation_override": null,
  "jump_enabled": false,
  "sight_clip": 0,
  "area_effect_on_dash": null,
  "sight_clip_side": 0,
  "walking_speed_tweak_percentage": -20,
  "shield_hitpoints": 0,
  "shield_die_pushback": 0,
  "load_attack_effect1": null,
  "load_attack_effect2": null,
  "load_attack_effect3": null,
  "load_attack_effect_ready": null,
  "rotate_angle_speed": 0,
  "deploy_timer_delay": 0,
  "retarget_each_tick": false,
  "retarget_after_attack": false,
  "attack_shake_time": 0,
  "visual_hit_speed": 0,
  "visual_hit_speed2": 0,
  "visual_hit_speed3": 0,
  "burst": 0,
  "burst_delay": 0,
  "burst_keep_target": false,
  "burst_affect_animation": false,
  "activation_time": 0,
  "attack_dash_time": 0,
  "looping_filter": null,
  "building_target": false,
  "spawn_const_priority": false,
  "buff_when_not_attacking": null,
  "buff_when_not_attacking_time": 0,
  "area_effect_on_hit": null,
  "attack_state_damage": 0,
  "speed_before_attack": 0,
  "move_effect2": null,
  "reflected_attack_buff": null,
  "reflected_attack_buff_duration": 0,
  "reflected_attack_radius": 0,
  "reflected_attack_damage": 0,
  "reflect_attack_crown_tower_damage": 0,
  "reflected_attack_targeted_effect_sources": 0,
  "ignore_targets_with_buff": null,
  "deprioritize_targets_with_buff": false,
  "override_attack_finish_time": false,
  "attack_finish_time": 0,
  "buff_on_kill": null,
  "buff_on_kill_time": 0,
  "buff_on50_hp": null,
  "buff_on50_hp_time": 0,
  "buff_on_xhp": null,
  "buff_on_xhp_percent": 0,
  "buff_on_xhp_time": 0,
  "suck_elixir_speed": 0,
  "capturable_building": false,
  "sight_range_for_characters": 0,
  "attack_state_count": 0,
  "neutral_object": false,
  "buff_after_hits_count": 0,
  "buff_after_hits_time": 0,
  "buff_after_hits": null,
  "morph_after_hits_count": 0,
  "convert_on_kill": null,
  "move_speed_by_friendly_mass": 0,
  "move_radius_by_friendly_mass": 0,
  "ignore_buff": null,
  "target_lowest_hp": false,
  "ability": null,
  "ignore_clone": false,
  "custom_spawn_filter": null,
  "custom_clone_filter": null,
  "ignore_resurrect": false,
  "allow_area_dmg_when_invisible": false,
  "avoid_counting_for_buff_amount_stats": false,
  "untargetable_when_spawned": false,
  "boost_items": null,
  "name_en": "Elite Barbarian",
  "hitpoints_per_level": [
    524,
    576,
    634,
    696,
    765,
    838,
    922,
    1011,
    1110,
    1220,
    1341,
    1472,
    1619,
    1776,
    1949,
    2143,
    2358,
    2593,
    2855
  ],
  "damage_per_level": [
    150,
    165,
    181,
    199,
    219,
    240,
    264,
    289,
    318,
    349,
    384,
    421,
    463,
    508,
    558,
    613,
    675,
    742,
    817
  ],
  "dps_per_level": null
}
```

## Mechanics and fields outside the common row

The source establishes the initial pair and ordinary character statistics, but the complete export signature contains additional values that the current ordinary profile projection does not represent:

| Raw field | Pinned value | What the source lets us say | What remains unresolved for core |
| --- | --- | --- | --- |
| Card `summon_radius`, `summon_width` | 700, 0 | Card-specific deployment geometry inputs; `summon_radius` is a raw radius value under the source unit convention. | Exact two-member coordinates, orientation, spread/anchor meaning and collision adjustment. The common formation helper is not a recovered formula. |
| Card `summon_deploy_delay` | 100 ms | This row carries the same 100 ms interval documented for multi-unit deployments. The [Supercell June 2020 standardization](<https://supercell.com/en/games/clashroyale/it/blog/release-notes/modifiche-di-bilanciamento-della-stagione-12/>) supports a 0.1 s gap between troops on multi-unit cards; a [second official-language release page](<https://supercell.com/en/games/clashroyale/blog/release-notes/season-12-balance-changes-2/>) confirms the dated standardization. This is interval evidence, not first-member onset. The local [formation/stagger audit](reference/research/air-swarm-formation-source-audit.md#L11-L34) records that limit. | Apply an evidenced six-tick inter-member gap if admitted. First member boundary and the `deploy_delay` interaction still need source-defined semantics. |
| Character `deploy_time`, `deploy_delay`, `load_time` | 1000 ms, 400 ms, 900 ms | Three distinct raw fields coexist; normalized `deploy_time_seconds=1.0` and `first_hit_seconds=0.9` retain only the first and third. | The local roster/kernel consumes `deployTimeTicks` and the squad interval, not raw `deploy_delay`. Do not add 400 ms to deploy time or discard it without a source-backed rule. |
| Character `speed`, `walking_speed_tweak_percentage` | 90, -20 | `speed=90` maps to 1.5 tiles/s by the repository's encoding convention. | No checked source consumer explains whether -20 changes simulation speed, animation pace, or another property. Do not compute 72 speed or assume the field is visual-only. |
| Character `collision_radius` | 500 | The field is present and its raw distance units are millitiles by the source ledger. | The ordinary roster currently estimates a multi-member body radius of 300, not 500. The field name/unit alone do not establish that deployment, pathfinding, attack contact, and collision all use this exact body radius. Keep the current gap visible. |
| Character `mass` | 4 | Raw character constant. | The current troop/session source record and battle-unit projection have no mass field/consumer. Its effect on pushback or other interactions is not established by the local source ledger; do not silently discard it if those interactions are in scope. |
| Character `projectile_start_radius`, `projectile_start_z` | 450, 450 | Nonzero raw coordinates exist despite all projectile pointers being null. | Do not infer a projectile or ranged attack from these alone; preserve as unresolved source fields. |
| Character `area_damage_radius`, `damage_special`, `special_range`, death-damage fields | 0 | Raw row reports zeros; normalized area radius is null. | This is no active value in the export, not independent proof against undocumented or schema-omitted effects. |

The character's direct attack signature is `attacks_ground=true`, `attacks_air=false`, `range=1200`, `damage=150` base with level-11 array value 384, and null projectile pointers. Raw targeting selectors `target_only_buildings`, `target_only_troops`, `target_only_towers`, `target_only_king_tower`, and `building_target` are false. These flags support a ground-only direct attack classification in the dump; they do not define target priority, building/tower eligibility, retarget order or contact edge rules. Those parts remain QUESTIONS.

The row has no obvious active charge/jump/dash signature: `charge_range=0`, `charge_speed_multiplier=0`, all `dash_*`/`dashing_*` numeric fields are 0, `jump_height=0`, `jump_speed=0`, and `jump_enabled=false`; special range/load/attack interval are zero. It has no positive shield, lifetime, morph, burst/ramp, death-spawn, or buff pointer/value: `shield_hitpoints=0`, `life_time=0`, `spawn_number=0`, all `spawn_*` counts zero and character pointers null, all `death_spawn_*` counts zero/pointers null, `ability=null`, all damage/status buff pointers null, and `mana_on_death=0`. The complete character record above is the field-by-field backing for this summary; these zero/null/default encodings still do not prove gameplay absence beyond this export.

## Sibling patterns and local source-confidence gap

The raw fields `walking_speed_tweak_percentage=-20`, `deploy_delay=400`, `collision_radius=500`, and `mass=4` also occur on the ordinary pinned `Barbarian` row and on `RageBarbarian`; exact identity/field excerpts are `Barbarian`: {"name":"Barbarian","speed":60,"walking_speed_tweak_percentage":-20,"deploy_delay":400,"deploy_time":1000,"collision_radius":500,"mass":4} and `RageBarbarian`: {"name":"RageBarbarian","speed":120,"walking_speed_tweak_percentage":-20,"deploy_delay":400,"deploy_time":1000,"collision_radius":500,"mass":4}. See [Barbarian](<https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L2845-L3164>) and [RageBarbarian](<https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_characters.json#L9341-L9648>). The standard `Barbarians` troop record also uses `summon_radius=700`, `summon_width=0`, and `summon_deploy_delay=100` ([pinned row](<https://github.com/RoyaleAPI/cr-api-data/blob/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_troop.json#L666-L748>)).

Across all 113 pinned character records, `walking_speed_tweak_percentage` is zero on 102; nonzero values are -20 on Barbarian/RageBarbarian/AngryBarbarian, -10 on Bomber/Wizard, -12 on GiantSkeleton, -26 on IceWizard/ElectroWizard, +15 on Golem, and +20 on Pekka/Miner. `deploy_delay` is zero on 73, 400 on 36, and 300 on 4. `collision_radius` is 500 on 60 characters and has other values on the rest. This is evidence these are reusable character-stat columns, not unique Elite-only ability references. It does not resolve their runtime meaning or make them safe to omit.

The current source-confidence authority tracks the common projected fields (count, damage, deploy time, first hit, hit cadence, HP, base movement speed, range, sight and target mode) and adds a 100 ms/six-tick interval receipt. It has no source-confidence field for `walking_speed_tweak_percentage`, `deploy_delay`, `collision_radius`, or `mass`. The session troop profile schema likewise admits only normalized common fields. In the current roster adapter, member body radius is a QUESTION estimate of 300 when `count>1`; movement is projected directly from normalized `movementMillitilesPerSecond`. The live battle kernel schedules members by the interval receipt and initializes movement from the projected speed/radius; it does not read the four raw character fields above. Relevant code: [session troop source-confidence authority](src/shared/session-troop-source-confidence-authority.js#L1-L80), [roster projection](src/content/session-troop-roster.js#L45-L53), [body-radius/delivery/layer projection](src/content/session-troop-roster.js#L315-L365), [member scheduling/materialization](src/sim/battle-continuation-kernel.js#L9108-L9148), and [homogeneous squad catalog boundary](src/content/cards/swarms.js#L268-L305).

Recommendation for 020K: split the proposed ordinary role behind a source-semantics gate. Current evidence does **not** support full-role admission as “two fast ordinary melee members.” No raw flag points to a charge, jump, death-spawn or status-specific card module, so a unique special-ability implementation is not indicated. The role is still blocked because its ordinary projection drops shared character fields that may affect deployment, movement, collision and pushback. Resolve and model those fields through a shared character-stat/runtime path before full-role admission; otherwise keep the role out of the full-role count. Do not “solve” the gap by attaching QUESTION labels while the fields are absent from the runtime.

## Concrete core tests required after source semantics are resolved

1. **Pinned-source witness:** pin commit/blob/SHA-256 evidence; assert card ID/key/sc_key joins; assert the two initial `AngryBarbarian` members, level index, delay, radius/width, direct character row, all linked nulls, and the full 278-field character signature. Assert every normalized `unverified_fields` item remains a QUESTION. The witness must retain raw `walking_speed_tweak_percentage`, `deploy_delay`, `collision_radius`, and `mass` instead of projecting only the common row.
2. **Shared stat semantics:** first settle each raw field's meaning from a dated source/consumer or calibrated capture; then test the common decoder/runtime against Barbarian, RageBarbarian and AngryBarbarian. For -20, test the evidenced speed/animation behavior without a speculative multiplier. For 400 ms delay, test exactly which spawn/action boundary changes. For radius 500, test deployment spacing, path/bar movement and melee-contact edges under the sourced interpretation; test mass 4 against a sourced pushback interaction if mass participates.
3. **Two-member deployment:** through actual `GameSession`, assert exactly two stable member IDs and the 6-tick inter-member spacing, plus snapshot/restore/fork equality at the staged-spawn boundary. Keep first-member onset and exact placement as QUESTIONS until measured; test any resolved `deploy_delay` behavior separately from the 100 ms member interval.
4. **Independent ground melee:** exercise each member against a ground target and an air target, assert the grounded direct-attack gate and no projectile event, and verify the admitted damage/cadence/range/startup policy values. Keep tower/building targeting, priority/retargeting, collision edge conventions and all source-unverified stat values marked as QUESTIONS until corroborated.
5. **Negative-special boundary:** test the extracted source facts (null ability/projectile/buff/death-spawn pointers and zero/false charge/jump/dash/death/status fields) as export facts. Do not write a test whose assertion is “the game has no ability” without independent cutoff-matched evidence or controlled footage.

No implementation or runtime test was run for this source-scope review. The required next decision is whether 020K first receives a shared raw-character-stat semantics/runtime slice or remains blocked before full-role admission.
