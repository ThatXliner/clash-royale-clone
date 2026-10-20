# Moss & Ember: art direction proposal

Status: **design proposal, UNRENDERED.** Nothing here has been adopted. The
companion board (`design-board.html`) is unrendered until a later runtime
window, and an independent critic has to render both the board and the real app
before any of it is accepted.

- Source pin: `c693d0cc0b36a3f1f179bbb93cb23998b68012b8`. Every input was read
  with `git show HEAD:<path>`, not from the dirty checkout.
- Scope: new files under `design/20261020-redesign/claude/` only. This proposal
  changes no mechanics, stats, APIs, source policy, lore, or shipped assets.
- Inputs read: `docs/brand.md`, `docs/brand/logo.svg`, `docs/lore.md`,
  `src/ui/card-lore.js`, `src/ui/combat-art.js`, `src/ui/combat-motion.js`,
  `src/content/cards/basic-melee.js`, `src/content/cards/basic-flying.js`,
  `src/content/visual-asset-manifest.js`, `docs/art/card-portraits-provenance.json`,
  `site/index.html`, `.agents/skills/character-creation/SKILL.md`.
- I did not open or use anything in `reference/`.

## What the redesign has to do

1. Make the game look like a finished commercial game. It should feel tactile
   and crafted, so it reads as made objects rather than a flat vector prototype.
2. A first-time visitor should understand the game in about ten seconds:
   eight cards, a hand of four, spend a resource, take the rival's keeps.
3. Every unit must stay readable at **13 px tall** on the phone arena. Team must
   be readable from color *and* shape, so it still works in grayscale.
4. Stay recognizably original. The world is woodland, river workshops, copper,
   and emberseeds, as the existing lore already establishes.

## Alternative A: "Riverworks Diorama" (selected)

The world looks like a hand-built tabletop diorama lit at dusk. Characters and
keeps are chunky low-poly sculptures. They use carved rootwood, hammered copper
with verdigris in the seams, felted moss, and canvas. Surfaces carry baked
ambient occlusion and a single warm forge-light key. The UI is built from the
same materials: wooden card frames with chamfered corners, copper seed tags for
costs, and a carved rail of seed sockets for the resource.

- **Why it works:** low-poly sculpture renders cleanly down to tiny sprites.
  Large planes and few colors per form hold up at 13 px, where painterly detail
  turns to mush. The same Blender scenes give Astra portraits, sprites, and
  launch-film shots from one source.
- **Risks:** the UI could get too heavy with wood textures. Rule: real material
  goes only on *objects* (card frames, the rail, tags). Panels stay flat ink.
  The "toy diorama" look could also drift toward generic mobile fantasy. The
  copper/emberseed specifics and the river-workshop architecture are what keep
  it ours.

## Alternative B: "Lantern Field Journal"

The world is drawn as a naturalist's field journal: ink linework, watercolor
washes on warm paper, letterpress type, specimen labels, and pressed leaves.
Cards look like journal plates and the arena like a hand-inked survey map.
Motion would come from ink-draw and page-turn effects.

- **Why it's attractive:** very distinctive, literary, and calm. It fits the
  current site's "field notes" voice.
- **Why it isn't selected:** thin ink lines and translucent washes fall apart at
  13 px. Team color in watercolor loses saturation and shape. It also reads as
  an indie art piece, not the "competitive commercial finish" the brief asks
  for. Mid-match readability is the bar, and B loses there.

## Selected direction

**A, with one thing borrowed from B.** The public site and the card-info
screens borrow B's paper specimen tags for lore and plain-language rules. That
keeps the curious, explanatory voice without weakening the battle surface.

### Palette

Existing tokens are kept exactly. New tokens fill gaps and are marked *new*.

| Token | Hex | Source | Use |
| --- | --- | --- | --- |
| ink | `#101a22` | brand.md | Page and panel background |
| ink-combat | `#191D22` | combat-art.js | Sprite outlines and HUD hairlines |
| paper | `#e9e2cd` | brand.md | Primary text on ink |
| bone | `#F4EBD6` | combat-art.js | Blade edges, highlights, foot-ring outline |
| jade | `#9bbb76` | brand.md | Selected/valid state, moss accents |
| leaf | `#5C8A46` | combat-art.js | Foliage on characters |
| moss-deep | `#2F4A2E` | *new* | Coilblade scarf, deep foliage |
| ember | `#f2a25e` | brand.md | Warm accents, primary CTA |
| copper | `#E9A83A` | combat-art.js | Copper metal, resource fill |
| copper-deep | `#B8672E` | *new* | Shadowed copper, uncommon frame |
| verdigris | `#6FB3A2` | *new* | Copper patina in seams. Never a team color |
| seed-core | `#FFD27A` | *new* | Emberseed glow, cracks, crit glints |
| wood | `#4A332A` | combat-art.js | Dark rootwood |
| wood-mid | `#7A5236` | *new* | Mid rootwood, standard frame |
| heartwood | `#C79A63` | *new* | Shield face, plinth top |
| stone | `#9BA5A2` | combat-art.js | Stone and keep masonry |
| river | `#35565B` | *new* | Water. Deliberately desaturated so it never reads as the teal team |
| team-you (south) | `#2E7F86` | combat-art.js | Local player |
| team-rival (north) | `#C6452E` | combat-art.js | Opponent |

### Team identity

Team colors stay as they are, but color is never the only signal. The two team
hexes have nearly the same luminance (about 0.17 and 0.18 relative luminance),
so in grayscale they currently collapse into one gray.

| Cue | You (south, teal) | Rival (north, ember) |
| --- | --- | --- |
| Foot ring | Solid round ring with a bone outline | Ring with 6 cut notches, like a cog, plus a dark outline |
| Crest (existing `combat-art.js` crest) | Upward arc ("smile") | Filled triangle |
| Team zone on body | Tabard, shield rim band, hull band (existing zones) | Same zones |
| Health bar | Bone `#DCEDE9` (existing) | Copper `#E9A83A` (existing) |
| Keep pennant | Swallowtail pennant | Notched square banner |

The notched ring and the pennant shapes are presentation-only proposals.
Adopting them would mean changing `combat-art.js` styling under a gauntlet
round. That is not done here.

### Typography

No webfonts are required. Everything uses system stacks, so the build stays
self-contained.

- Display: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua",
  Georgia, serif` at weight 700 with tight tracking. This matches the
  brand.md "system serif" wordmark rule.
- UI: `ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif`.
  Rounded terminals echo the carved wood.
- Numbers (costs, timer, stats): the UI stack with `font-variant-numeric:
  tabular-nums`, weight 800.
- Minimum sizes: 12 px on phone for secondary text, 15 px for body, and 11 px
  only for uppercase labels with letterspacing.

### Shape language

| Family | Shapes | Who uses it |
| --- | --- | --- |
| Sharp/craft | Long diagonals, thin triangles, one strong circle | Coilblade, spells, the "attack" iconography |
| Grounded/grove | Broad ovals, squares, tree-ring circles | Mossguard, keeps, defensive UI |
| Buoyant/river | Teardrops, lens shapes, soft arcs | Copperskiff, air units, the emberseed resource |
| UI chrome | Chamfered rectangles (8 px corners on phone), rivets at corners, stitch lines (2 px dashes) | Cards, panels, buttons |

### Components (see board)

- **Card tile:** wooden frame with chamfered corners. The frame's *material*
  shows rarity: standard = wood-mid, uncommon = copper, special = verdigris
  inlay, and higher rarities = emberglass edge. A small corner glyph repeats the
  rarity (leaf, cog, seed), so rarity never depends on hue alone. The cost sits
  on a copper **seed tag** hanging from a rivet at the top right.
- **Ember rail (resource):** a carved rootwood rail with 10 seed-shaped sockets.
  Full sockets glow `seed-core`, and the socket being filled fills from the
  bottom up. A large badge at the left shows the integer amount. It binds to the
  existing `data-ui="elixir-rail"` and `.elixir-fill` hooks, so no API changes.
- **Keeps:** round stone towers with copper roofs and a lantern on top. The
  lantern is the "life" read: it dims as hitpoints fall (presentation only).
- **Buttons:** primary = ember fill with ink text, secondary = ink with a paper
  hairline, destructive = never ember (use paper outline plus an explicit verb).

### Screens

1. **Landing:** a dusk valley diorama with all three hero characters on a
   tree-ring plinth. Headline "Light the path. Hold the bridge." Then a 3-step
   explainer, "Meet the makers" (lore verbatim), and an honest open-source
   footer. The play CTA is above the fold at both sizes.
2. **Deck/collection/card info:** 4×2 deck slots with average cost, a filterable
   collection, and a card-info sheet. The sheet shows the portrait, role chips in
   plain language ("Ground · Melee · One target"), the existing stat values
   only, and the two-sentence lore verbatim on a paper specimen tag.
3. **Battle HUD:** a rival strip on top (name, lanterns, timer), the arena framed
   in rootwood, and the hand of 4 plus a "next" card with the ember rail at the
   bottom. On desktop the arena sits center at full height, the hand and rail
   move to a right panel, and a left panel holds the match state, team legend,
   and keyboard hints (1–4 select, click to place, Esc cancel).

### Voice for lay visitors

Short, concrete, and second-person. Name the action before the jargon: "Spend
ember to play a card" before "ember", and "knock out keeps" before "lanterns".
No "epic", "legendary", "ultimate", or other loot-box vocabulary.

### Accessibility floor

- Text contrast ≥ 4.5:1 (computed: paper on ink 13.6:1, copper on ink 8.5:1,
  ink on ember 8.5:1). Never put paper text on copper (about 1.6:1).
- Touch targets ≥ 44×44 px, and hand cards are 70×88 px on phone.
- Team readable in grayscale (see the team identity table).
- Every motion cue has a reduced-motion equivalent (see `motion-direction.md`).
- No more than 3 flashes per second on any element, and no full-screen flashes.

### Originality guardrails

- Do: woodland/river-workshop/copper/emberseed materials, tree rings, kettles,
  kiln bells, wind keys, canvas, root bridges, and lanterns.
- Don't: a pink/purple resource liquid; a checkerboard grass arena; horned or
  visored robot knights; top-rotor flying machines with a visible pilot
  (Copperskiff keeps only its existing small stern propeller);
  crown-shaped score icons; or the comparison game's card-frame silhouette,
  font, or rarity colors. Never open `reference/footage/` to "match the look";
  it is a parity target for mechanics and layout only.

### Display-copy question (not a change)

The current UI says "elixir" (`src/ui/app-shell.js`, `site/index.html`), and
code identifiers say `elixir`/`crowns`. Those display words are the comparison
game's vocabulary. This board **proposes** the display labels **ember** (the
resource) and **lanterns** (score/keeps destroyed), with all identifiers, data
hooks, and APIs left unchanged. This needs an owner decision, so it is a
question here and nothing has changed.

## Adoption path (later, not done here)

Each surface would go through `.agents/skills/gauntlet-round/` with a separate
builder and critic. The critic renders the real app at 390×844 and 1440×933,
inspects 13 px units on the 540×960 arena surface, checks
`prefers-reduced-motion`, and checks restore identity at matching ticks. Sprite
work follows `character-creation/SKILL.md`: provenance in `docs/art/`, a
manifest entry, and ≤ 1 MiB per shipped image.
