# Motion direction: tick-driven presentation and launch film

Status: **design brief, UNRENDERED.** Nothing here has been implemented. It
changes no simulation code, mechanics, stats, or timings. Every cue is a pure
*presentation* function of state that the simulation already exposes.

Pin: `c693d0cc0b36a3f1f179bbb93cb23998b68012b8`. Grounded in
`src/ui/combat-motion.js`, `src/ui/combat-art.js`, `src/ui/hud-state.js`,
`src/content/cards/basic-melee.js`, and `basic-flying.js` (all read at HEAD).

## Rules

1. **Timebase = simulation tick, 60 per second.** All durations below are in
   ticks. No `Date.now`, `performance.now`, CSS `animation`/`transition`
   timing, `requestAnimationFrame` deltas, or unseeded randomness may decide a
   pose, frame, offset, opacity, or color.
2. **Pure function:** `presentation = f(snapshot at tick T, reducedMotion)`.
   Nothing accumulates across rendered frames. Any "age" is computed as
   `T − <tick stored in state>`, the same way `combat-motion.js` already uses
   `tick - unit.spawnedAt` and `tick - event.tick`.
3. **Restore identity:** for a fixed `reducedMotion` value, rendering tick T,
   then serializing, restoring, and rendering tick T again must be
   pixel-identical. This holds for both modes separately.
4. **Reduced motion:**
   - Reduced motion removes *displacement, rotation, scale, and looping*.
   - It keeps *information*: state still changes color, outline, and glyph.
   - Every cue has a static equivalent that holds for the same tick window, so
     nothing that is visible in normal mode is invisible in reduced mode.
5. **Flash safety:** ≤ 3 luminance flashes per second per element. A hit flash
   affects only the unit's own pixels. Nothing flashes full-screen.
6. **Integer lookup tables** only (no `Math.sin` of time). Tables are listed
   below so the builder and the 3D renders share them.

## State inputs used (all already present at HEAD)

| Input | Where |
| --- | --- |
| `tick`, `unit.spawnedAt`, `unit.side`, `unit.layer` | `snapshot.state.battle`, used in `combat-motion.js` |
| `unit.attack.phase` (deploying, winding, cycling, idle), `nextAttackTick`, `nextTick`, `config.hitSpeedTicks`, `config.deployTicks`, `attackSequence` | `combat-motion.js` |
| `unit.movement.segmentProgress`, `segmentLength`, `speed` | `combat-motion.js` |
| Damage/contact/impact/death events with `event.tick` | `createCombatEffectsViewModel` |
| Resource `amount`, `accumulator`, capacity 10, denominator 168 | `hud-state.js` (`ELIXIR_*`) |
| Selected card, hand, next, costs | `hud-state.js` projection |

The existing windows stay as they are: anticipate 10 ticks before the strike,
attack 0–3, recoil 4–7, hit 6, deploy `deployTicks` (60 for all three), and
death 18. This brief only adds *what each window looks like* per character.

---

## Unit cues

Offsets are in arena-surface px (540×960 surface). Tilt values are degrees.
`dir` is the existing ±1 facing toward the target.

### Walk: driven by distance, not time

The current code uses `stride = floor(segmentProgress / 125) % 4` for every
unit. The proposal swaps in a **per-character divisor**, so stride length
matches body size and the 3D walk keys line up with ground travel:

| Unit | Divisor (progress units per key) | Keys per cycle | Lift table (px) | Tilt table (°) | Secondary |
| --- | --- | --- | --- | --- | --- |
| Coilblade | 250 | 4 | `[0,-2,0,-2]` | `[0,-4,0,4]` | scarf tails offset +1 key (trail) |
| Mossguard | 188 | 4 | `[0,-1,0,-1]` | `[0,-2,0,2]` | mantle uses key − 1 (2-tick lag in renders) |
| Copperskiff | — | 6 | hover table below | `[0,0,0,0,0,0]` | prop frame = `floor(age/2) % 3` |

The divisors assume `segmentProgress` is in millitiles, so Coilblade gets a
1000-mt stride and Mossguard ≈ 750 mt, matching the handoff. The builder must
confirm the unit at HEAD before adopting. If it differs, scale the divisors and
keep the stride-per-body-size ratio.

Copperskiff hover (air units do not step):

- `bobKey = floor((T − spawnedAt) / 10) % 6`
- `lift = [0,-1,-2,-2,-1,0][bobKey]`
- The ground shadow scales by `[100,98,96,96,98,100][bobKey]` percent. The
  shadow never moves.

**Reduced motion:** lift and tilt are 0 and use walk key 0. Facing direction
still updates, because facing is information, not motion.

### Attack: inside the existing windows

`s = T − lastStrike`, which is the existing `strikeAge`. The anticipation
offset is `a = nextAttackTick − T`, counting 10 down to 1.

| Unit | Anticipate (a = 10…1) | Strike (s = 0–1) | Follow (s = 2–3) | Recoil (s = 4–7) | Contact FX |
| --- | --- | --- | --- | --- | --- |
| Coilblade | ant0 for a 10–5, ant1 for a 4–1. Coil spring compresses and saber draws back, tilt `−dir·14` (existing) | lunge frame, body shift `+dir·3 px`; saber edge glint (seed-core) 2 px at the tip on s = 0 only | follow frame, glint off | step back, tilt eases `−dir·(8−s)·2` (existing formula) | existing 12-tick bone star, plus 1 thin seed-core arc on s = 0–2 |
| Mossguard | shield raised and fist pulled back, tilt `−dir·8` | shove frame, body `+dir·2 px`, shield face toward target | lean holds | settle behind shield | short bark-chip burst: 3 wood-colored chips with fixed offsets `[(-4,-3),(3,-5),(5,1)]` scaled by `(12−age)/12` |
| Copperskiff | for a = 8…1, lid hatch alternates up/down: `lidUp = floor(a/2) % 2`; the spout glow ramps through `[20,35,50,65,80,90,100,100]`% | gondola kicks back `−dir·2 px`; ember puff (3 discs, radii `[3,2,1]` px) at the spout on s = 0–2 | hold | settle | the projectile stays sim-owned; no art-side travel is invented |

**Reduced motion, all units:**

- No tilt, shift, or lid alternation.
- Anticipate shows the **ant1 frame** statically, plus a 1-px copper outline
  on the sprite.
- Strike shows the **strike frame** for s = 0–3 and the **idle frame** for
  s = 4–7.
- The glint, puff, and chip art draw at their s = 0 size, static, for the same
  window, so the contact information survives.
- The spout glow is a fixed 100% for a ≤ 8.

### Hit: existing 6-tick window, `h = T − hitTick`

| h | Normal | Reduced |
| --- | --- | --- |
| 0–1 | brightness 1.65 (existing), offset 1 px away from the attacker, team ring outline turns bone | brightness 1.65, no offset, ring outline bone |
| 2–3 | brightness 1.25, offset 0 | brightness 1.25 |
| 4–5 | normal, health bar segment that was lost shows `seed-core` (presentation of the existing HP delta) | same |

A unit hit every tick (swarm damage) re-triggers h = 0 at most once every 20
ticks for the *brightness* part. That keeps it at 3 flashes per second or
fewer. The offset part still follows every hit, and reduced mode has no offset.

### Deploy: `d = T − spawnedAt`, 0 … deployTicks−1 (60)

| d | Normal | Reduced |
| --- | --- | --- |
| 0–7 | emberseed drops from 24 px above to the ground (table `[24,18,12,7,3,1,0,0]`); team foot ring draws as an arc of `d/8` of a circle | seed already on the ground; full team ring drawn |
| 8–39 | root sprout ring grows (radius `8 + d/2` px), the unit is the **deploy-rise** frame at scale `65 + floor(35·d/60)`% (existing formula) | deploy-rise frame at 100%, root ring static at final radius, ring dashed to show "not yet active" |
| 40–59 | unit at full size, ring fades to the normal foot ring | same as normal minus the fade (it switches at d = 40) |

### Death: existing 18-tick window, `k = T − deathTick`

Normal: the existing remnant tilt and drift, plus per-character remnants:

- Coilblade: the bell head and saber separate by 3 px.
- Mossguard: 4 leaves fall with a fixed table.
- Copperskiff: the envelope sags and drops `k/2` px.

Reduced: existing static remnant (rotate 75°, opacity .8) for all 18 ticks.

### Keeps

The lantern on top of each keep shows that keep's remaining HP fraction
(`hp/max`) in 4 brightness bands (100/75/50/25%) and goes dark at 0. This is a
static mapping, identical in both modes. When a keep falls, its pennant drops
over 12 ticks in normal mode; in reduced mode it switches straight to the fallen
pennant.

---

## HUD and input cues

These are input-driven but still tick-anchored. Any feedback that follows a
command uses the tick the command was accepted or rejected at, which is stored
in session state. It never uses a client timestamp.

| Cue | Normal | Reduced |
| --- | --- | --- |
| **Card select** | selected card rises 8 px, 2 px copper outline, seed tag brightens | no rise; 3 px copper outline + a small check glyph in the corner |
| **Placement preview** | ghost sprite at 50% opacity on the cursor tile; footprint ring dashed, dash offset `floor(T/12) % 2 · 4` px; Copperskiff also shows its range ring | same ghost and rings, no dash shift |
| **Valid / invalid zone** | own half tinted jade at 10%; rival half shows 45° hatching in ink at 20% | identical, it's static |
| **Not enough ember** | seed tag nudges ±2 px over 4 ticks (`[2,-2,1,0]`) from the rejection tick; tag outline turns ember red; text "Need 4" | outline + text only |
| **Ember rail fill** | continuous: `(amount·168 + accumulator) / 1680` of the rail (existing math) | identical, since a fill level is information |
| **Seed ignites (new whole point)** | the socket that just filled shows a ring that shrinks over 12 ticks, read from the tick of the integer crossing (in the elixir event history or derived from restored state) | the socket fills solid; no ring |
| **Card becomes affordable** | card desaturation 40% → 0 and the seed tag fill sweeps to full | same end state, no sweep (snaps at the tick it becomes affordable) |
| **Double-rate phase** | rail sockets gain a second inner glow and the label "Ember ×2" appears; 1 shimmer pass across the rail (24 ticks) at phase start | label + inner glow, no shimmer |
| **Timer last 10 s** | digits turn ember and scale 110% on each whole second for 6 ticks | digits turn ember, no scale |
| **Lantern taken** | the rival's lantern icon goes dark with a 12-tick ring; the score strip slides 4 px | lantern goes dark, outline ring static |

Hover/focus on the site and menus is *not* game logic. CSS transitions of
≤ 150 ms are allowed there, and are disabled under
`prefers-reduced-motion: reduce`.

---

## Launch film storyboard (design brief only)

This is about 60 s, 16:9 master, with 9:16 and 1:1 cutdowns. **Gameplay shots
must be real captures** of deterministic replays. Record each seed and command
log so the shot can be regenerated exactly; the film's credibility depends on
it. Character vignettes use Astra's Blender scenes from the handoff. There is no
voice-over; text is on screen and captioned. Music is original (warm plucked
strings, low woodwind, hand percussion on copper and wood). Nothing from the
comparison game's audio, music, or tagline style is used.

| # | Time | Picture | Sound | On-screen text |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:05 | Black. One emberseed glows on a mossy root path, extreme close-up. | Wood creak, ember tick. | — |
| 2 | 0:05–0:11 | Slow rise over the valley at dusk: root bridges, river workshops, copper roofs lit by forge light. More seeds glow along forgotten paths. | Strings enter. | "The emberseeds are glowing again." |
| 3 | 0:11–0:18 | Riverworks bench: hands of light fit a cracked kiln bell onto Coilblade. It stands, the saber turns, and a thin line of sunrise runs along the edge. | Bell ring (dampened), clockwork ratchet. | "Coilblade" |
| 4 | 0:18–0:24 | Trailhead: Mossguard presses a fresh leaf into the grain of its shield and raises it. | Leaf rustle, deep wooden knock. | "Mossguard" |
| 5 | 0:24–0:30 | Mill pond in light rain: Copperskiff's canvas fills, the prop turns, and it lifts past the waterwheel. | Rain on canvas, kettle whistle motif. | "Copperskiff" |
| 6 | 0:30–0:42 | Real capture, phone frame: select card → placement ring → seed drop → sprout → clash on the west root bridge. Cut to the ember rail filling. | Rhythm builds on copper hits. | "Pick eight cards." / "Play four at a time." / "Spend ember. Hold the bridge." |
| 7 | 0:42–0:50 | Real capture: Copperskiff crosses the river under fire; the rival keep's lantern dims band by band and goes dark. | Music lifts, then a single low gong. | — |
| 8 | 0:50–0:55 | Split screen: the same seed replayed twice and frame-identical, with a tick counter in the corner. | Clock tick motif. | "Same seed. Same match. Every time." |
| 9 | 0:55–1:00 | Logo lockup on ink; the mark's seed glows once. | Final chord. | "Moss & Ember: play free in your browser" · "Open source · AGPL-3.0" |

### Film accessibility and versions

- Burned-in captions plus a separate caption track.
- Text holds ≥ 2.5 s, and the reading level stays plain.
- No strobe: luminance flashes stay at or below 3 per second, and shot 7's
  lantern dimming is stepped bands, not flashes.
- **Reduced-motion site version:** the landing page never autoplays. With
  `prefers-reduced-motion: reduce` it shows the shot 2 still as a poster with a
  play button. Shots 3–5 are also exported as a 3-still carousel with no
  autoplay.
- **15 s cutdown:** shots 2 → 6 (trimmed to 6 s) → 9.

### Production notes

- Capture gameplay at the shipped arena size, then scale with nearest-neighbor
  ×2 for 1080p framing so 13 px units stay crisp. Never re-render units larger
  for the film without labeling it as a stylized shot.
- Vignettes 3–5 are explicitly *stylized* (Blender). Label them "In-world
  vignette" in the film's credits line, so they aren't read as gameplay.
