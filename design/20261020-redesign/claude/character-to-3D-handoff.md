# Character → 3D handoff: Coilblade, Mossguard, Copperskiff

Status: **design brief for Astra, UNRENDERED.** No model, sprite, or render
exists yet. Nothing here changes stats, mechanics, hitboxes, card data, or lore.

- Pin: `c693d0cc0b36a3f1f179bbb93cb23998b68012b8`. Identity sources (all read at
  HEAD):
  - `src/ui/card-lore.js`: lore, quoted verbatim below.
  - `public/assets/card-portraits-painted.webp`: atlas cells 0, 1, 2. Viewed
    from the checkout; `git diff` against HEAD is empty for this file.
  - `docs/art/card-portraits-provenance.json`: the original generation prompt.
  - `src/ui/combat-art.js`: current vector sprites and team zones.
  - `src/content/cards/basic-melee.js` and `basic-flying.js`: roles only.

**Identity rule:** the painted portraits are the canonical look. The 3D models
must read as *the same characters* in a new medium. Any addition is labeled
**[addition]** with its lore justification, and the owner can drop it without
breaking the design.

---

## Global spec (all three)

### Scale and units

- 1 Blender unit = 1 arena tile (1000 millitiles). This is **presentation
  scale only**. Body radius, reach, and hitboxes stay owned by the simulation.
- Ground plane is Z = 0, and the character origin is the centre of the foot
  contact (or, for air units, the centre of the ground shadow).
- Facing: model faces −Y (toward camera "south") in the rest pose.

### Geometry and materials

- Low-poly with deliberate, readable planes. Target **1,500–3,000 tris** per
  character. Nothing thinner than 0.03 BU, which would vanish below 64 px.
- Use flat material slots (≤ 8 per character) plus baked AO into vertex color.
  An optional 512² hand-painted overlay can add grain, hammer dents, and leaf
  veins. Painted detail must never carry the silhouette.
- Mark team zones as a separate material named `TEAM`. That lets the renderer
  output a **team mask pass** (white on black) as well as baked south (teal) and
  north (ember) variants.
- Outline: use an inverted-hull outline in ink `#191D22`. Size it so it lands at
  **1 px in the small LOD** and 2 px in the large LOD after downsampling (see
  Render).

### Rig

Use simple FK plus a few secondary chains. Keep bone counts small so animation
stays cheap to re-render.

### Animation

- Set the timeline to **60 fps, where 1 frame = 1 simulation tick**. Frame
  numbers in the clips below are tick offsets that match `motion-direction.md`.
  Only listed key frames are exported to the atlas.
- Walk cycles are keyed to *distance travelled*, not time. Model each cycle so
  the foot plants match the stride lengths in the motion doc, so feet don't
  slide at any speed.

### Camera and light

- **Camera:** orthographic, pitched 50° down from horizontal. Match this to the
  vertical foreshortening of the painted arena/keeps before final export and
  record the measured angle.
- Render 4 azimuths in the runtime's direction order **north, east, south,
  west** (`SPRITE_DIRECTIONS` in `combat-art.js`). Do **not** mirror east/west.
  All three characters are asymmetric: saber hand, shield arm, propeller and
  flag.
- **Lights** (matching the portraits' warm late-afternoon look):
  - Key: sun, warm `#FFE2B8`, from upper-left-back, 40° elevation.
  - Fill: sky dome `#9FB7B5` at 25%.
  - Rim: copper `#E9A83A` from behind-right at 60%. The rim light is what
    separates a 13 px sprite from moss-green ground, so don't drop it.

### Render outputs

- **LOD-L:** 256×256 cell, character inside a 200 px box, foot pivot at
  (128, 216). Used for desktop arena (≥ 24 px display), card detail, and site.
- **LOD-S:** 64×64 cell, separately rendered at 4× (256) and box-downsampled.
  The outline is scaled so it survives as 1 px. Small parts are hidden (see
  "LOD-S hides" per character). Used for phone arena (~13 px display).
- **Atlas layout:** rows = north, east, south, west. Columns =
  `walk0..walk3 | ant0 ant1 | strike | follow | recoil | hit | deploy-rise | idle`
  (12 columns).
- **Current runtime limit:** today's runtime only reads 2 walk and 2 attack
  columns (Briar Runner path). Those can be filled from walk0/walk2 and
  ant1/strike. Using the full 12 columns needs runtime work in a gauntlet round,
  not here.
- **Formats:** transparent PNG masters stay in `demo/assets/`. Shipped files are
  WebP, each **≤ 1 MiB**, registered in `visual-asset-manifest.js`, with
  provenance in `docs/art/*-provenance.json`. Record the tool, the `.blend`
  SHA-256, the render settings, and source/output SHA-256, per
  `character-creation/SKILL.md`.
- **Also produce:** a 1024² hero render per character (for the site and launch
  film) and a 512² portrait-angle render. The portrait render is a *comparison*
  against atlas cells 0–2. It does not replace the atlas, whose cells must be
  preserved.

### 13 px acceptance test (each character, each team, LOD-S)

Composite the sprite at **13 px tall** on the real painted arena ground, at
1× device pixels.

1. **Blind ID:** with only the black alpha silhouette at 13 px, a viewer can
   tell the three apart. Each has one dominant read (below).
2. **Team in grayscale:** the team is still identifiable from the foot ring
   shape (solid vs. notched) and the crest.
3. **Team ring:** at least 2 px thick, and it doesn't touch the outline of an
   adjacent unit 1 tile away.
4. **Facing:** the facing direction is readable in all 4 rows. The lead element
   (saber / shield / prow) points the way the unit moves.
5. **Restore:** the same tick must give the same frame (see motion doc).

### 13×13 silhouette masks (east-facing intent sketches)

Legend:

| Symbol | Meaning |
| --- | --- |
| `C` | copper |
| `S` | scarf / leaf |
| `T` | TEAM zone |
| `B` | bone blade |
| `W` | wood / joints |
| `O` | shield leaf face |
| `N` | canvas |
| `G` | seed-core glow |
| `.` | empty |

These are proportion targets, not pixel art to ship.

```
Coilblade        Mossguard        Copperskiff
.....CC......    ......S.S....    ......T......
....CCCC.....    ....SSSSSS...    ...NNNNNNN...
....CGCC.....    ...SSSWWSSS..    .NNNNNNNNNNN.
...CCCCCC....    ..SSSSWWSSSS.    NNNNNNNNNNNNN
.SSSSSSS.....    ..SSSSSSSSSS.    .NNNNNNNNNNN.
SS.TTTTTC....    ..WSSSSSSTTTT    ...C.....C...
...TTTTT.C...    ..WWWWWWTOOOT    ..CCCCCCCCC..
....CCC...B..    ..WWWWWWTOOOT    WCTTTTTTTTTCC
....CCC....B.    ...WWWWWTOOOT    .CCCCCCCCCCG.
...WW.WW....B    ...WWWWWTOOOT    ..CCCCCCCCC..
..WW...WW....    ...WW.WW.TOT.    .............
.CC.....CC...    ...WW.WW..T..    .............
.............    .............    ....-----....
 (tall, thin;     (low, wide;      (wide lens over
  scarf trails,    green dome +     small boat; prop
  blade sweeps     tall shield      trails, spout
  forward-low)     leads)           leads; shadow)
```

---

## 1. Coilblade

> A clockwork duelist was assembled from a cracked kiln bell and copper from the old riverworks. At dusk, its blade catches the forge light like a thin line of sunrise.

- **Role (HEAD, unchanged):** single ground unit, melee, targets ground, quick
  mover.
- **Dominant read:** *thin upright fencer with a long bright crescent blade.*
- **Shape family:** sharp/craft. Long diagonals and one circle (the bell
  head).

### Proportions

- Height 1.15 BU, max body width 0.45 BU, saber extends a further 0.55 BU
  forward.
- Head (bell) = 22% of height. Torso 30%, legs 48%: long-legged, a fencer
  not a brawler.
- Rest pose is a fencing lunge: front knee bent, rear leg straight, saber
  forward-low (as in the portrait), and the off-hand back for balance.

### Form cues (build order)

1. **Bell head.** An inverted kiln bell: dome on top, flared lip at the jaw line
   (lip radius 1.2× dome radius). Add a small cast loop on the crown (the bell's
   hanging loop) and a single round eye lens (`seed-core`, emissive 1.5) on the
   facing side, as in the portrait. A **crack** runs from the crown down to the
   lip on the left side, as a thin emissive seed-core seam (0.015 BU wide; LOD-L
   only).
2. **Moss scarf/hood.** `moss-deep #2F4A2E` cloth wraps the neck and drops two
   tails behind. It is a 3-bone chain per tail. The tails are the second
   silhouette element at 13 px: they trail opposite to the motion.
3. **Torso.** Copper chest plate with two horizontal hammer seams and dark
   joints (`ink-combat`) at shoulders and elbows. A **TEAM** cloth tabard hangs
   from the belt to mid-thigh: a flat 0.18×0.22 BU panel, front and back.
4. **The coil.** **[addition, from the name]** An exposed 3-turn copper spring
   replaces the waist, 0.12 BU tall, with verdigris in the gaps. It compresses
   in anticipation frames.
5. **Limbs.** Segmented copper tubes with ball joints, and riveted greaves that
   flare at the knee. Feet are wedge-shaped sabatons.
6. **Saber.** Long single-edged curve (portrait), length 0.85 BU, bone
   `#F4EBD6` edge with a copper spine. Small disc guard, wrapped grip. In LOD-L
   the edge gets a 1-px `seed-core` highlight line: the "thin line of sunrise".
7. **Wind key.** **[addition, from "clockwork"]** A small butterfly key in the
   upper back, 0.10 BU. It rotates a quarter turn per walk cycle. It is hidden
   in LOD-S.

### Materials

| Slot | Base | Metal | Rough | Notes |
| --- | --- | --- | --- | --- |
| copper | `#E9A83A` | 0.7 | 0.40 | hammer-dent normal noise |
| copper-shadow | `#B8672E` | 0.7 | 0.55 | inner faces, sabatons |
| verdigris | `#6FB3A2` | 0.2 | 0.80 | AO-masked into seams only |
| joint | `#191D22` | 0.4 | 0.60 | |
| scarf | `#2F4A2E` | 0 | 0.90 | |
| blade | `#F4EBD6` | 0.9 | 0.20 | |
| eye/crack | `#FFD27A` | — | — | emissive |
| TEAM | team hex | 0 | 0.80 | tabard |

- **LOD-S hides:** crack, wind key, rivets, scarf tail #2. The saber thickens
  ×1.6 so it survives as a 1-px bright line.
- **Avoid:** horned helmets, visor slits, bulky armored proportions, a
  two-handed greatsword, any face other than the single round lens.

---

## 2. Mossguard

> This grove keeper wears a shield cut from an old bough, with leaves pressed into the grain. Each leaf marks a trail the woodland guides promised to keep clear.

- **Role (HEAD, unchanged):** single ground unit, melee, targets ground, sturdy
  and steady.
- **Dominant read:** *round green leaf dome on top of a tall shield.*
- **Shape family:** grounded/grove. Broad ovals and squares.

### Proportions

- Height 1.00 BU, width 1.15 BU (the shield included). It is the widest of the
  three, matching its wider existing marker (7.5% vs. 6.2%).
- Head 18%, leaf mantle and shoulders 30%, torso 27%, legs 25%: short, stumpy,
  low centre of mass.
- Rest pose: shield held forward on the left arm, covering the torso. The right
  fist is low at the hip.

### Form cues (build order)

1. **Leaf mantle.** Three tiers of large serrated leaves around the shoulders
   and upper back, as in the portrait. Build it as 14–18 bent single-sided cards
   with thickness, not hundreds of leaves. The outer silhouette must be a clean
   scalloped dome, which is the 13 px read.
2. **Mask.** A carved wooden face (heartwood `#C79A63`), slightly elongated,
   with two round eye holes and a carved smile. A two-leaf sprout grows from the
   top. Keep the gentle, friendly expression from the portrait.
3. **Body.** Bough trunk torso with deep bark grooves, plus a rope belt. The
   arms are thick branches with knot knuckles. The legs are stumps with 3–4 root
   toes splayed for grip.
4. **Shield.** "Cut from an old bough": a tall heater/kite shape, aspect 1.6:1,
   0.62 BU tall. The face is planks of heartwood with **one large pressed leaf**
   in relief, with midrib and veins carved 0.01 BU deep. The leaf is lighter
   (`#9bbb76`), as in the portrait. A rounded **TEAM** wooden rim runs all the
   way around, 12% of the shield width, which keeps ≥ 2 px of team color at
   13 px.
5. **Trail notches.** **[addition, from "each leaf marks a trail"]** Small
   carved tally notches on the shield rim, one per leaf. LOD-L only.

### Materials

| Slot | Base | Metal | Rough | Notes |
| --- | --- | --- | --- | --- |
| bark | `#4A332A` | 0 | 0.90 | grooves |
| bough | `#7A5236` | 0 | 0.85 | arms, legs |
| heartwood | `#C79A63` | 0 | 0.70 | mask, shield planks |
| leaf | `#5C8A46` | 0 | 0.80 | mantle (SSS 0.1 if Cycles) |
| leaf-light | `#9bbb76` | 0 | 0.75 | shield relief, sprout |
| rope | `#B79A6A` | 0 | 0.90 | |
| TEAM | team hex | 0 | 0.80 | shield rim |

- **LOD-S hides:** rope belt, tally notches, mask smile (eye holes stay as 1
  dark pixel pair if they survive), sprout reduced to 1 leaf.
- **Avoid:** a metal helmet, any sword, any club or new weapon (it has none),
  round "buckler" proportions, a human face, or a mustache.

---

## 3. Copperskiff

> The little airship began as a copper kettle patched into a hull beside the mill. Its canvas sail still carries the scent of river rain.

- **Role (HEAD, unchanged):** single air unit, ranged, targets air and ground.
- **Dominant read:** *pale canvas lens floating over a small copper boat.*
- **Shape family:** buoyant/river. Teardrops and lenses.

### Proportions

- Total length 1.20 BU, total height 0.85 BU. The hover base sits at 0.55 BU
  above ground, and the shadow is rendered by the runtime, not baked in.
- The envelope is 58% of the visual mass, the gondola 30%, and the rigging gap
  12%. That empty gap is part of the silhouette, so don't fill it.

### Form cues (build order)

1. **Canvas envelope.** "Its canvas sail": a cream ellipsoid, aspect 2.2:1,
   slightly fatter at the bow. A **copper strap cage** runs over it: 3
   longitudinal bands and 4 hoops, as in the portrait. Add one visibly
   **stitched patch** of darker canvas (`#CDBF9C`) near the stern (lore:
   patched). Four small canvas tail fins sit at the stern.
2. **Mast flag.** A short copper mast on top with a **leaf-shaped pennant**,
   following the portrait's leaf flag. In battle renders the pennant is **TEAM**.
   In the portrait/hero render it stays leaf green.
3. **Gondola.** A copper kettle reworked as a boat hull: a rounded belly, a
   riveted seam, and two brass-rimmed portholes. A **kettle lid hatch** with a
   knob sits on the deck. A **TEAM** band runs around the hull below the
   portholes, as in the existing `combat-art.js` team zone.
4. **Spout prow.** **[addition, from "copper kettle"]** A short kettle spout
   forms the bow and is where the ember shot leaves. If the owner wants a strict
   portrait match, fire from the forward porthole instead. Nothing else changes.
5. **Pusher prop.** A small 3-blade copper propeller at the stern (portrait),
   0.16 BU diameter. It is **behind** the gondola: never a top rotor, and
   there's no visible pilot.
6. **Rigging.** 4 ropes from the strap cage down to the gondola rails, 0.02 BU
   thick in LOD-L. In LOD-S there are 2 ropes, 1 px each.

### Materials

| Slot | Base | Metal | Rough | Notes |
| --- | --- | --- | --- | --- |
| canvas | `#E7DCC0` | 0 | 0.95 | weave normal |
| patch | `#CDBF9C` | 0 | 0.95 | stitched edge |
| copper | `#E9A83A` | 0.7 | 0.40 | straps, hull |
| copper-shadow | `#B8672E` | 0.7 | 0.55 | hull underside |
| brass-glass | `#2B3B40` | 0.1 | 0.10 | portholes; seed-core glint |
| rope | `#B79A6A` | 0 | 0.90 | |
| TEAM | team hex | 0 | 0.80 | hull band, pennant |

- **LOD-S hides:** patch stitching, portholes (become 1 bright pixel), 2 of 4
  ropes, prop blades (become a 2-px copper disc).
- **Avoid:** top rotors, propeller-heads, a visible pilot or crew, cannons or
  barrels, a dragon/bird shape, a balloon taller than wide.

---

## Rigs and clips

Durations are in **ticks** (60 ticks = 1 s). Attack *contact* is always the
simulation's strike tick. Clip lengths below are art lengths that fit inside the
existing pose windows in `combat-motion.js`:

| Window | Ticks |
| --- | --- |
| anticipate | 10 before |
| attack | 0–3 |
| recoil | 4–7 |
| hit | 6 |
| deploy | 60 |
| death | 18 |

| Character | Bones (approx.) | walk (frames ↔ stride) | anticipate | strike | recoil | extra |
| --- | --- | --- | --- | --- | --- | --- |
| Coilblade | root, hips, coil, chest, neck, head, key, scarf_a1-3, scarf_b1-3, arm L/R (3), saber, leg L/R (3) | 4 keys over one 1000-mt stride | coil compresses, saber drawn back (−10…−1) | full lunge, saber extended (0–1), follow-through (2–3) | step back to guard (4–7) | key quarter-turn per stride |
| Mossguard | root, hips, chest, head, sprout, mantle_1-3, arm L/R (3), shield, leg L/R (2) | 4 keys over one 750-mt stride; 1 px vertical bob | shield lifts, right fist pulls back (−10…−1) | shield shove + fist punch forward (0–1), lean (2–3) | settle behind shield (4–7) | mantle leaves lag 2 ticks |
| Copperskiff | root(shadow), float, envelope, gondola, lid, prop, flag_1-2, rope stubs | no walk; hover bob is a 6-key loop of 60 ticks | lid hatch rattles, spout glows (−8…−1) | recoil kick back 0.04 BU, ember puff at spout (0–2), hold (3) | settle (4–7) | prop rotates 1/6 turn per 2 ticks |

---

## Handoff checklist for Astra

- [ ] 3 `.blend` files, each with a `TEAM` material, an inverted-hull outline,
  and the 50° ortho camera rig saved.
- [ ] LOD-L and LOD-S atlases, 4 rows × 12 columns, with baked teal and ember
  variants plus a team mask.
- [ ] Hero renders 1024² and portrait-angle comparison renders 512².
- [ ] 13 px composites on the painted arena for both teams, plus a grayscale
  version, for the critic.
- [ ] Provenance JSON draft per character (tool, settings, `.blend` hash, PNG
  and WebP hashes, dimensions, bytes).
- [ ] No reference footage, names, or assets were used as modeling reference.
