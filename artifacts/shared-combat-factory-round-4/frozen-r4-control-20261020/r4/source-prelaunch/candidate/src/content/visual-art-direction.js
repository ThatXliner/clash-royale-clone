export const VISUAL_BIBLE_VERSION = 1;
export const VISUAL_BIBLE_ID = "rivermark-visual-bible";

const PALETTE_ROWS = [
  { hex: "#191D22", name: "ink-night", role: "universal outline and line work across every faction and surface" },
  { hex: "#F4EBD6", name: "parchment-field", role: "shared frame color for UI panels, card frames, and arena margins" },
  { hex: "#E3CD9E", name: "sunlit-sand", role: "arena ground base fill on the dry half of the river valley" },
  { hex: "#8B8578", name: "stone-shade", role: "neutral architecture, bridges, and tower masonry" },
  { hex: "#16324F", name: "deep-water", role: "deepest water band and Tidewarden secondary armor" },
  { hex: "#2E7F86", name: "river-teal", role: "river surface and Tidewarden Concord primary" },
  { hex: "#DCEDE9", name: "foam-pale", role: "Tidewarden accent trim, wake lines, and crest highlights" },
  { hex: "#4A332A", name: "charred-brown", role: "Emberfall secondary armor, timber, and scorch ground" },
  { hex: "#C6452E", name: "ember-red", role: "Emberfall Compact primary cloth and banner field" },
  { hex: "#E9A83A", name: "herald-gold", role: "Emberfall accent trim, heroic rarity border, and victory marks" },
  { hex: "#5C8A46", name: "moss-guard", role: "nature archetype creature hides and grove props" },
  { hex: "#5B4B8A", name: "dusk-arcane", role: "spell sigils, arcane projectile cores, and effect glow bases" },
];

const SILHOUETTE_FAMILIES = [
  { family: "melee-bruiser", rule: "wide trapezoid torso, low center of mass, forward-leaning neck; the head breaks the shoulder line only when viewed head-on" },
  { family: "ranged-specialist", rule: "narrow waist under a compact chest, one tall vertical prop (staff or bow arc) that breaks the head line by at least a quarter body height" },
  { family: "swarm", rule: "small near-round bodies deployed as a fixed triangle cluster of three; no single swarm figure exceeds a third of a tile in height" },
  { family: "building", rule: "bilaterally symmetric block mass with one dominant roofline edge reading at arena zoom; chimneys or spires stay centered on the ridge" },
  { family: "spell", rule: "circular sigil containment ring with interior glyphs; never a character form, face, or limb inside the ring" },
  { family: "flying", rule: "teardrop hull suspended beneath a single visible lift plane (rotor disc or wing arc) with a hard shadow ellipse detached below" },
];

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildBible() {
  return freeze({
    factionIdentity: {
      factions: [
        {
          id: "emberfall-compact",
          motif: "chamfered angular plates rising to a flame crest",
          paletteRefs: ["charred-brown", "ember-red", "herald-gold"],
          shapeLanguage: "straight edges, 45-degree chamfers, triangular finials, banner tails cut as inverted chevrons",
        },
        {
          id: "tidewarden-concord",
          motif: "layered wave arcs encircling a moon pearl",
          paletteRefs: ["deep-water", "foam-pale", "river-teal"],
          shapeLanguage: "curvilinear arcs, spiral knots, rounded domes, rope borders tied in repeated loops",
        },
      ],
      sharedFrame: "both factions sit on parchment-field neutrals outlined in ink-night so arena geometry reads before faction color",
    },
    materials: {
      gradientsAllowedOnlyOn: ["river-and-water-surfaces"],
      lightDirection: "top-front-left",
      outlineInkRef: "ink-night",
      shadingModel: "two-step cel ramp: base fill plus one darker step on planes facing away from the light direction",
      shadeStepDarkenRatio: 0.18,
      surfaceFinish: "matte, noise-free flat fills; no texture photography, no specular highlights",
    },
    name: VISUAL_BIBLE_ID,
    palette: PALETTE_ROWS.map(({ hex, name, role }) => ({ hex, name, role })),
    scale: {
      cardPortraitCanvasCapPixels: 512,
      iconCanvasCapPixels: 512,
      outlineWidthRule: "outline stroke width equals 3% of the subject's height in tiles",
      textureCanvasCapPixels: 4096,
      tileReference: "one tile equals 1000 millitiles of simulation distance",
      towerHeightTiles: 3,
      unitHeightBySizeClassTiles: {
        champion: 1.8,
        large: 1.5,
        medium: 1.1,
        small: 0.8,
      },
    },
    silhouettes: {
      families: SILHOUETTE_FAMILIES,
      readabilityBar: "every unit must be identifiable from its black silhouette alone at two tiles of on-screen size",
    },
    typography: {
      displayFace: {
        fallbackStack: "Georgia, 'Times New Roman', serif",
        plannedFace: "Rivermark Slab",
        status: "planned-custom-face-not-yet-shipped",
      },
      bodyFace: {
        fallbackStack: "'Avenir Next', 'Segoe UI', sans-serif",
        plannedFace: "Rivermark Text",
        status: "planned-custom-face-not-yet-shipped",
      },
      copyCase: "sentence case for all interface copy",
      numerals: "tabular lining figures for all counters and timers",
      sizesPixels: {
        body: 16,
        caption: 12,
        title: 32,
      },
    },
    version: VISUAL_BIBLE_VERSION,
  });
}

const BIBLE = buildBible();
const BIBLE_BYTES = canonical(BIBLE);

export function createVisualBible(...args) {
  if (args.length !== 0) {
    throw new TypeError("visual bible takes no arguments");
  }
  return JSON.parse(BIBLE_BYTES);
}

export function serializeVisualBible(...args) {
  if (args.length !== 0) {
    throw new TypeError("visual bible serialization takes no arguments");
  }
  return BIBLE_BYTES;
}
