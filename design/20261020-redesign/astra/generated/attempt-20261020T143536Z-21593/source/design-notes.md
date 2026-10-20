# Riverworks Diorama — editable character sources

**Status: source authored; the first Blender attempt stopped before export on a color-management enum error. The source fix, model exports, renders, and independent visual critique are pending.** See [attempts.md](attempts.md) for the preserved raw evidence. Runtime work is serialized with the shared qualification run.

The builder is GPT-6 Astra. Claude supplies the interface and art direction in [art-direction.md](../claude/art-direction.md), [character-to-3D-handoff.md](../claude/character-to-3D-handoff.md), and [motion-direction.md](../claude/motion-direction.md). A fresh critic must judge the generated work; this builder does not supply a PASS verdict.

## Identity and source boundary

The identity pin is `c693d0cc0b36a3f1f179bbb93cb23998b68012b8`. I read the accepted versions of `src/ui/card-lore.js`, `src/ui/card-portrait-art.js`, `src/content/cards/basic-melee.js`, `src/content/cards/basic-flying.js`, and `docs/art/card-portraits-provenance.json`. I viewed the existing painted portrait atlas after checking that it had no diff against the pin.

All geometry in `build_models.py` is original explicit-coordinate procedural work. No geometry, texture, footage, name, audio, or text from `reference/` is used or imported. Existing names, two-sentence lore, card roles, stats, timing authority, and the painted portrait atlas remain unchanged. The design files are not imported by the game.

## Character decisions

| Character | Existing identity and role | Large forms | Team zone |
| --- | --- | --- | --- |
| Coilblade | A clockwork duelist assembled from a cracked kiln bell and riverworks copper; single-target ground melee | Long copper legs, a flared bell head with one round ember lens, dark moss scarf trailing behind, a bright single-edged saber held forward and low | A broad front and back cloth tabard |
| Mossguard | A wooden grove keeper carrying a shield cut from a bough; single-target ground melee | Broad scalloped leaf mantle, a gentle carved heartwood face, stumpy branch limbs, splayed root toes, a tall shield leading the left arm | Rounded wooden shield rim |
| Copperskiff | A patched copper kettle hull under a rain-scented canvas sail; flying ranged unit targeting air and ground | Pale canvas lens, copper hoops, a clear rigging gap, rounded boat hull, portholes and kettle lid, a stern pusher propeller, a leaf pennant | Hull band and pennant |

Coilblade's three-turn waist spring and back winding key are removable additions from Claude's brief, justified by “Coilblade” and “clockwork.” Copperskiff's short curved kettle spout is the brief's optional addition from the kettle origin; it is a presentation launch point, not a new weapon or projectile mechanic. Mossguard receives no sword, club, or other new weapon.

The source favors large material planes and readable negative space. Small seams, knuckles, pins, and veins are editable close-up details; they must not become the identification cue at 13 px. The three characters retain different shapes when rendered as black silhouettes: narrow fencer with forward saber, broad leaf dome with tall shield, and wide pale envelope above a suspended boat.

## Materials

`palette.json` is the only palette input. It follows Claude's exact established team colors:

- `TEAM`: river `#2E7F86` or rival ember `#C6452E`.
- Copper `#E9A83A`, shaded copper `#B8672E`, and seam verdigris `#6FB3A2`.
- Rootwood `#4A332A`, mid wood `#7A5236`, and heartwood `#C79A63`.
- Deep moss `#2F4A2E`, leaf `#5C8A46`, and leaf highlights `#9BBB76`.
- Canvas `#E7DCC0`, canvas patch `#CDBF9C`, blade `#F4EBD6`, dark joints `#191D22`, and emberseed light `#FFD27A`.

Materials use Principled BSDF inputs, editable material slots, and no external textures. Copper is moderately rough metal; cloth, wood, and leaf planes are matte. Close-up polish and phone readability must be assessed from renders. Literal material names are prefixed to avoid collisions, except the shared `TEAM` material requested by the handoff.

## Scene and file contract

The generator refuses to run inside an interactive Blender session. Start a **new background Blender process** with no input `.blend`. It creates a new `ME_20261020_character_gallery` scene and separate Coilblade, Mossguard, and Copperskiff collections. It never factory-resets Blender, deletes an existing scene, or touches a live Blender file. If the generated scene already exists, it stops instead of deleting or reusing it.

The recording runner passes `--factory-startup` only to its fresh background process so user preferences and add-ons are excluded. This does not reset or alter the user's running Blender session. Asset `.blend` files contain only the authored scene and its dependencies.

Every component remains a named mesh or transform pivot. The models use a simple FK hierarchy of editable object pivots, rather than an armature; this keeps the authored geometry easy to change and the exported transforms straightforward. The generated `.blend` opens on an orthographic gallery with its own studio lighting and plinths. Every GLB contains only its character, with the gallery translation removed for export.

The authoring axes are `+Z` up and `−Y` forward. The placement origin is the ground contact or ground-shadow anchor. Model scale is a presentation convention, not a simulation radius or hitbox. Copperskiff's body is elevated relative to its ground anchor.

The default output directory is `generated/`, under this directory. The command rejects outputs elsewhere.

## Reproduction commands

Run only after the parent agent releases the shared runtime window. Use the installed Blender executable; these commands do not install software.

The preferred first run records a unique attempt, syntax result, source snapshots and hashes, Blender version, non-secret environment, actual command, PID, raw output, and exit status. It generates all model files and four small Eevee previews:

```sh
bash design/20261020-redesign/astra/run-model-build.sh
```

Direct commands remain useful for later artifact production:

```sh
BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender"
"$BLENDER_BIN" --background --python design/20261020-redesign/astra/build_models.py -- \
  --output design/20261020-redesign/astra/generated/river --team river
```

The first command builds and exports without rendering. It is still a real Blender job and must wait for the runtime handoff.

```sh
"$BLENDER_BIN" --background --python design/20261020-redesign/astra/build_models.py -- \
  --output design/20261020-redesign/astra/generated/river --team river \
  --previews --samples 32
```

To create the optional future sprite sources for both teams:

```sh
"$BLENDER_BIN" --background --python design/20261020-redesign/astra/build_models.py -- \
  --output design/20261020-redesign/astra/generated/river --team river \
  --sprites --sprite-size 128 --samples 32
"$BLENDER_BIN" --background --python design/20261020-redesign/astra/build_models.py -- \
  --output design/20261020-redesign/astra/generated/ember --team ember \
  --sprites --sprite-size 128 --samples 32
```

The default renderer is Cycles on CPU with a fixed seed of zero. `--engine eevee` selects an available Eevee renderer when a later isolated runtime supports it. No unseeded randomness, wall-clock animation, external generation service, downloaded mesh, or downloaded texture is used.

Expected outputs after a successful run:

- `moss-and-ember-characters.blend`, with three independently editable character collections.
- `coilblade.blend`, `mossguard.blend`, `copperskiff.blend`, each containing one character and its own portrait camera.
- `coilblade.glb`, `mossguard.glb`, `copperskiff.glb`.
- `manifest.json`, including file hashes, byte counts, Blender version, per-character base geometry counts and signatures, authorship, and the accepted identity source pin.
- `sprite-projection.json`, recording measured anchors and evaluated projected mesh bounds.
- With `--previews`: lineup; front, side, and three-quarter views; and arena-angle idle, walk, and contact poses.
- With `--sprites`: one eight-direction transparent PNG source atlas per character and a measured layout record.

## Animation and 3D → 2D pipeline

The `.blend` timeline is 60 fps. It stages four idle poses, four walk key poses, and anticipation/contact/recovery poses. The attack source contact is frame 100; anticipation keys are at offsets −10 and −4, recovery at +6. These keys are an art source, not a change to an attack's simulation cadence or startup.

The runtime must choose a pose from its accepted snapshot, movement progress, attack phase, and simulation tick. A clip's source frame number must never become a new game clock. Walk poses are future distance-indexed source keys, not a claim that the existing runtime has adopted Claude's proposed stride divisors. Restoring the same snapshot must select the same pose.

Per the parent task, the optional source atlas uses eight azimuths without mirroring. Columns are south, southwest, west, northwest, north, northeast, east, southeast. Rows are four idle, four walk, and four attack source poses. The current four-direction subset is north/east/south/west at source columns 4/6/0/2. Claude's proposed four-row, twelve-column runtime atlas is a later integration target; this source atlas is not drop-in compatible and is not shipped.

The arena camera has a proposed 50° elevation. Before export, the generator evaluates all authored source poses in all eight directions, projects the mesh vertices, and computes **one common orthographic scale and camera target height** with a transparent border. It then measures the ground origin with Blender's `world_to_camera_view`. Every character, direction, and pose uses that same scale and anchor. The run fails if a rendered key pose reaches the crop border or the anchor changes. The actual angle still requires comparison with the real arena.

The live app must place each sprite using the measured ground anchor. Normalizing each frame independently by its alpha bounds would move the feet and is expressly excluded. Renderer output alone is insufficient evidence: the critic must inspect each team and direction at actual 13 px body height on the 540×960 arena, including grayscale silhouettes, adjacent units, and matching-tick restore captures.

## Remaining implementation and verification

This is an initial model-source delivery, with these items explicitly pending:

- Run Blender in the released isolated runtime; fix any API or export errors.
- Inspect the actual meshes and rendered front/side/three-quarter views, then revise proportions and poses from a separate critic's evidence.
- Measure evaluated triangle counts and reduce geometry toward Claude's 1,500–3,000-triangle target; base source meshes retain editable detail.
- Produce true LOD-S simplifications and an inverted-hull outline. Neither is falsely represented as implemented by a smaller render resolution.
- Bake AO into vertex color if the independent material review calls for it. Current materials contain no claimed AO bake.
- Expand staged poses into Claude's full follow-through, hit, deploy, and six-key hover delivery; verify planted feet and scarf/leaf lag from actual motion.
- Produce `TEAM` mask renders and ring/crest shape cues during integration. The current assets provide the team material only; color alone is not claimed to distinguish teams in grayscale.
- Produce 1024² hero masters, compare portraits against existing atlas cells, and create final four-direction LOD atlases when the model critique passes.
- Render real-app phone 390×844 and desktop 1440×933 evidence, the native 540×960 arena, reduced-motion states, and restore identity at matching ticks.
- Optimize shipped WebP files to the skill's ≤ 1 MiB per-character limit and register source/output provenance and the manifest only in the later authorized integration round.

No test, render, export, live-app verification, shipping change, or critic verdict is claimed by the presence of this source.
