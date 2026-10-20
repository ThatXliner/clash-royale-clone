# Moss & Ember: art direction source (Claude Round 2, Luna Round 3 correction)

Status: **proposal only; not integrated or accepted. Round 2's six frame layouts later passed critic rendering, but its overall result failed on collection completeness. Round 3 is unrendered and has no pass.**

- **Round 1 result:** an independent critic rendered the Round 1 board, and
  the phone landing **failed**. The "How a match works" cards were 200 px wide
  in one horizontal row inside the 390 px frame. Step 2 was clipped and step 3
  was hidden, so a phone visitor never got the eight-card / four-card /
  resource / objective introduction. Round 2 later rendered all six frames;
  the frame layouts passed, superseding Round 1's unverified frame status.
- **Round 2 visual source:** Claude wrote the proposal with text tools. Its
  later critic render passed the six frame layouts but failed the overall
  round because the desktop collection showed 16 cards while HEAD defines 23.
- **Round 3 factual correction:** Luna adds the seven missing source-backed
  cards and a bounded, keyboard-scrollable desktop collection. The visual
  direction and fixed frame sizes remain from Claude's Round 2 work. Round 3
  has not been rendered or reviewed; see `catalog-source.md` for provenance.
- **Nothing ships.** No product source or assets were changed.

Inputs and pins:

- Round 1 input, kept unchanged: `design/20261020-redesign/claude/`. This folder
  holds refined copies of its four documents.
- Round 1 source pin: `c693d0cc0b36a3f1f179bbb93cb23998b68012b8`. The Round 1
  inputs were read with `git show HEAD:<path>`: `docs/brand.md`,
  `docs/brand/logo.svg`, `docs/lore.md`, `src/ui/card-lore.js`,
  `src/ui/combat-art.js`, `src/ui/combat-motion.js`,
  `src/content/cards/basic-melee.js`, `src/content/cards/basic-flying.js`,
  `src/content/visual-asset-manifest.js`,
  `docs/art/card-portraits-provenance.json`, `site/index.html`, and
  `.agents/skills/character-creation/SKILL.md`.
- Round 2 rules check at HEAD `72fea95228e48189f2c0b1d6cb068c62c91575a0`, read
  with `git show HEAD:`/`git grep HEAD`:
  - `src/sim/deck.js`: `DECK_SIZE = 8`, `HAND_SIZE = 4`.
  - `src/sim/battle-continuation-kernel.js`: ember (elixir) capacity 10,
    1 point per 168 ticks, then 84 from tick 7,200 and 56 from tick 14,400.
    Regulation is 10,800 ticks (3:00) and overtime runs to tick 18,000. A
    destroyed central tower sets that side's crowns to 3.
  - `package.json`: `AGPL-3.0-only`.
  - All 16 card names used on the board appear in `src/` at HEAD.
  - The other Round 1 inputs were **not** re-read at the new HEAD.
- I did not open or use anything in `reference/`.

## Round 2 revision notes

| Area | Round 1 | Round 2 visual proposal / Round 3 factual correction |
| --- | --- | --- |
| Phone landing explainer | 3 cards, 200 px each, in one horizontal row at 390 px. Real render: step 2 clipped, step 3 hidden. **FAIL.** | Single column. Four stacked rows (350 × 74 px), each with a picture: an 8-card deck grid, a 4-card hand plus the next card, a seed-tag cost plus a 10-socket ember rail, and three keeps with the centre one larger. Everything sits inside the first 844 px; nothing scrolls sideways. |
| Phone landing content | Three steps, no card-info cue, no time limit. | Step 1 says "Tap any card to read what it does." Step 4 gives the rule: lead on keeps after 3 minutes, or topple the centre keep. |
| Phone deck sheet | About 499 px of content in a 486 px sheet (hand recount), so the actions could fall off the bottom. Not verified. | 504 px sheet with ~480 px of content. Adds a plain "what it does" line. The catalog caveat moved to the board notes. |
| Desktop deck | Names at ~91 px tiles would truncate ("Gloamwing Cluster", "Brackenwheel"). The collection showed only 3 of the 8 deck cards. Not verified. | Info panel 420 px. Deck row of 8 × 92 px. Round 3 shows all 23 source-backed cards at 6 × 128 px in a bounded, keyboard-scrollable panel; names wrap to two lines, and the 8 deck cards are marked "In deck". |
| Desktop landing | Three steps. Not verified. | The same four steps and pictures as phone, in four columns anchored to the bottom. |
| Desktop battle | Not verified. | Adds a "How to win" panel. The hand header reads "Your hand · 4 cards". |
| Phone battle | Column summed to exactly 844, but a ~50-character selection line could wrap. Not verified. | Shorter selection line, 11 px label floor, timer label "Time". |
| Frame bounds | Frames sat below variable-height text, so their page offsets could be fractional. | The frame stage is first on the page, and everything above it has a fixed px height. Frames are whole-px, border-box boxes at integer offsets. No CSS `scale`, `zoom`, or fit-to-box is used. |
| Overflow honesty | Inner `overflow:hidden` on the step row hid the failure. | No inner clipping on content. Only decorative art crops (valley backdrops) clip. `#audit` turns frame clipping off so any spill is visible. |
| Small text | Some labels at 9–10.5 px. | Product labels are at least 11 px (uppercase) and 12 px otherwise. |

## What the redesign has to do

1. Make the game look like a finished commercial game. It should feel tactile
   and crafted, so it reads as made objects rather than a flat vector prototype.
2. A first-time visitor should understand the game in about ten seconds, **on a
   phone as well as a desktop**: eight cards, a hand of four, spend a resource,
   take the rival's keeps.
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
round. That is not done here. Whether the team read actually holds at native
13 px is **pending independent review**.

### Typography

No webfonts. There is no `@font-face` and no font request; everything uses
system stacks, so the board and any build stay self-contained.

- Display: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua",
  Georgia, serif` at weight 700 with tight tracking. This matches the
  brand.md "system serif" wordmark rule.
- UI: `ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif`.
  Rounded terminals echo the carved wood.
- Numbers (costs, timer, stats): the UI stack with `font-variant-numeric:
  tabular-nums`, weight 800.
- Minimum sizes: 12 px on phone for secondary text, 15 px for body, and 11 px
  only for uppercase labels with letterspacing. Round 2 brought the board's
  product labels up to this floor.
- **Layout budgets assume the widest likely fallback.** A headless Linux
  renderer usually resolves these stacks to DejaVu Sans/Serif, which is wider
  than SF or Segoe. Every fixed-width line on the board is budgeted against
  DejaVu Sans Bold. For example, "Copperskiff" at 12 px with −0.03 em tracking
  is about 74 px against a 76 px name strip. Any text that might not fit
  either wraps into reserved space or shows an ellipsis. Nothing is cut
  silently.

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
  on a copper **seed tag** hanging from a rivet at the top right. Names are
  12 px on one line where the tile is ≥ 84 px. On wider collection tiles they
  wrap to two lines.
- **Ember rail (resource):** a carved rootwood rail with 10 seed-shaped sockets.
  Full sockets glow `seed-core`, and the socket being filled fills from the
  bottom up. A large badge at the left shows the integer amount. It binds to the
  existing `data-ui="elixir-rail"` and `.elixir-fill` hooks, so no API changes.
- **Keeps:** round stone towers with copper roofs and a lantern on top. The
  lantern is the "life" read: it dims as hitpoints fall (presentation only).
- **Buttons:** primary = ember fill with ink text, secondary = ink with a paper
  hairline, destructive = never ember (use paper outline plus an explicit verb).
- **"How a match works" step (new in Round 2):** one component used on phone
  and desktop. Each step is a small picture plus a numbered title and one line
  of plain text. The pictures are CSS boxes plus the existing keep and seed
  symbols, so they need no new assets:
  1. **Build a deck of 8:** a 4 × 2 grid of mini cards, one outlined in
     seed-core. "Tap any card to read what it does."
  2. **Hold 4 at a time:** four mini cards, one raised and outlined in copper,
     with a dimmer, smaller "next" card to the left. "Play one and the next
     card slides in."
  3. **Spend ember:** a real seed tag reading 3 next to a 10-socket mini rail
     with 3 full and one filling. "The seed tag is the cost. Ember refills
     to 10."
  4. **Take the keeps:** two lane keeps and a larger centre keep. "Lead on
     keeps after 3 minutes, or topple the centre keep."

  On phone the steps stack in a single column (350 × 74 px each, 6 px apart).
  On desktop they sit in four 297 px columns. They never sit side by side at
  phone width.

### Screens

1. **Landing.**
   - **Phone (390 × 844):** a single column inside the first viewport.
     - Nav overlay: 52 px.
     - Diorama art, y 0–184: Mossguard, Coilblade, and Copperskiff on the
       tree-ring plinth. This keeps the distinctive Riverworks look.
     - Eyebrow, headline "Light the path. / Hold the bridge.", a two-line lede,
       and a full-width "Play now" button, ending at y 404.
     - "How a match works" with all four steps, y 420–760.
     - A footer line: open source · AGPL-3.0, plus "Meet the cast ↓".

     That leaves about 40 px of slack, enough for one extra lede line and one
     extra step-body line. "Meet the makers" (lore verbatim) and the full
     footer sit below the fold on the real page. The board doesn't draw them.
   - **Desktop (1440 × 933):** the dusk-valley hero with the diorama on the
     right. Copy and CTAs sit on the left (top y 150). The four steps form a
     row anchored to the bottom of the frame.
2. **Deck/collection/card info.**
   - **Phone:** all eight deck slots are visible above the sheet. The app bar
     shows the average cost and the tabs show "8/8" and "23" in Round 3. The card-info
     sheet shows the portrait, name, rarity, and big seed-tag cost, then a
     plain "what it does" sentence derived from the role data only, role chips
     ("Ground · Melee · One target"), the six existing stat values, the
     two-sentence lore verbatim on a paper specimen tag, and the actions.
   - **Desktop:** a nav rail, the deck row, the full 23-card collection in a bounded scroll region, and a
     420 px info panel.
3. **Battle HUD.**
   - **Phone:** a rival strip on top (name, lanterns, timer), the arena framed
     in rootwood, a selection line, then the hand of 4 plus a "next" card with
     the ember rail at the bottom.
   - **Desktop:** the arena sits in the centre at full height, and the hand and
     rail move to a right panel. A left panel holds the match state, a "How to
     win" note, the team legend, and keyboard hints (1–4 select, click to
     place, Esc cancel).

### Layout budgets (Round 2 designer estimates; Round 2 later rendered; Round 3 pending)

| Frame | Vertical budget | Horizontal check |
| --- | --- | --- |
| `#f-phone-landing` | 184 art + 220 copy + 16 + 26 heading + 4 × 74 rows + 3 × 6 gaps + ~44 footer ≈ 804 of 844 | rows 350 wide: 80 picture + 10 + 236 text + 24 padding |
| `#f-phone-deck` | 56 bar + 40 tabs + 16 + 216 deck = 328; sheet 340–844 with ~480 of 504 used | 4 × 84 + 3 × 8 = 360 of 360 |
| `#f-phone-battle` | 52 + 610 + 26 + 104 + 44 + 8 = 844 exactly | hand ≈ 376 of 390 |
| `#f-desk-landing` | copy 150 → ≤ 578; steps top ≥ 685; diorama ends 660 | 4 × 297 + 3 × 20 = 1248 |
| `#f-desk-deck` | main ≈ 850 of 933; panel ≈ 820 of 933 | 96 + 924 + 420 = 1440; deck 8 × 92 + 7 × 10 + 32 = 838 ≤ 844; collection 6 × 128 + 5 × 12 = 828 ≤ 844 |
| `#f-desk-battle` | left ≈ 690, right ≈ 784, arena 876 of 933 | 460 + 520 + 460 = 1440 |

Frame placement on the board: the phones sit at x 48 / 486 / 924, y 152. The
desktop frames sit at x 48, y 1076 / 2089 / 3102. All are integer,
border-box, and unscaled.

### Voice for lay visitors

Short, concrete, and second-person. Name the action before the jargon: "Spend
ember to play a card" before "ember", and "knock out keeps" before "lanterns".
No "epic", "legendary", "ultimate", or other loot-box vocabulary. Rules copy
states only what HEAD does (see the rules check above).

### Accessibility floor

- Text contrast ≥ 4.5:1 (computed: paper on ink 13.6:1, copper on ink 8.5:1,
  ink on ember 8.5:1, paper-dim `#b9b3a1` on ink-3 `#1e2e38` ≈ 6.7:1). Never put
  paper text on copper (about 1.6:1).
- Touch targets ≥ 44 × 44 px. Hand cards are 70 × 88 px on phone.
- Team readable in grayscale (see the team identity table). Pending review at
  native 13 px.
- Every motion cue has a reduced-motion equivalent (see `motion-direction.md`).
- No more than 3 flashes per second on any element, and no full-screen flashes.

### Originality guardrails

- Do: woodland/river-workshop/copper/emberseed materials, tree rings, kettles,
  kiln bells, wind keys, canvas, root bridges, and lanterns.
- Don't: a pink/purple resource liquid; a checkerboard grass arena; horned or
  visored robot knights; top-rotor flying machines with a visible pilot
  (Copperskiff keeps only its existing small stern propeller); crown-shaped
  score icons; or the comparison game's card-frame silhouette, font, or rarity
  colors. Never open `reference/footage/` to "match the look"; it is a parity
  target for mechanics and layout only.
- The Round 2 explainer pictures are generic boxes and the project's own keep
  and seed symbols. No icon, layout, or copy was taken from the comparison
  game's tutorial.

### Display-copy question (not a change)

The current UI says "elixir" (`src/ui/app-shell.js`, `site/index.html`), and
code identifiers say `elixir`/`crowns`. Those display words are the comparison
game's vocabulary. This board **proposes** the display labels **ember** (the
resource) and **lanterns** (score/keeps destroyed), with all identifiers, data
hooks, and APIs left unchanged. This needs an owner decision, so it is a
question here and nothing has changed.

## What a fresh critic must do before anything is accepted

1. Render `design-board.html` at device scale 1 and element-screenshot all six
   `#f-*` frames. Confirm 390 × 844 and 1440 × 933 at integer offsets.
2. Check that each frame's `scrollWidth`/`scrollHeight` equals its
   `clientWidth`/`clientHeight`, and that no `.ct__name` shows an ellipsis.
   Also view `design-board.html#audit`.
3. On the phone landing, confirm that all four steps (picture, title, body)
   are fully visible without scrolling, and that a lay reader can say back the
   rules: "eight cards, four in hand, spend ember, take keeps".
4. Record which fonts actually resolved.
5. Keep the native 13 px team/silhouette review and the 3D model-quality review
   as separate, independent passes. This document does not claim either.

## Adoption path (later, not done here)

Each surface would go through `.agents/skills/gauntlet-round/` with a separate
builder and critic. The critic renders the real app at 390 × 844 and
1440 × 933, inspects 13 px units on the 540 × 960 arena surface, checks
`prefers-reduced-motion`, and checks restore identity at matching ticks. Sprite
work follows `character-creation/SKILL.md`: provenance in `docs/art/`, a
manifest entry, and ≤ 1 MiB per shipped image.
