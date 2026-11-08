// Ground troop designs. Coordinates are tiles: +Y up, +Z is the facing
// direction, +X is the unit's own left. Each build() hangs parts off the
// `body` joint the frame provides and registers animated joints by name.
import { G } from "./kit.js";

const TAU = Math.PI * 2;

const LEAF = [[0, 0], [0.38, 0.32], [0.5, 0.75], [0.3, 1], [0, 1.22], [-0.3, 1], [-0.5, 0.75], [-0.38, 0.32]];

// A chunky chibi biped: short legs, a tapered torso, a big head and arms
// hung from shoulder pivots. Returns handy anchors for props.
function biped(b, o) {
  const body = b.joints.body;
  const hip = o.hip;
  const legR = o.legRadius ?? 0.05;
  const legX = o.legX ?? 0.09;
  for (const [name, x] of [["legL", legX], ["legR", -legX]]) {
    const leg = b.group(name, body, [x, hip, 0]);
    b.mesh(G.cyl(5), o.legRole ?? "teamDark", leg, [0, -hip / 2, 0], [legR, hip, legR]);
    b.mesh(G.box(), o.footRole ?? "darkwood", leg, [0, -hip + 0.03, 0.025], [legR * 2.4, 0.06, legR * 3.4]);
  }
  const torsoY = hip + o.torsoH / 2 - 0.02;
  const torso = b.mesh(G.cyl(o.torsoSeg ?? 6, o.torsoTop ?? 0.78), o.torsoRole ?? "team", body,
    [0, torsoY, 0], [o.torsoW / 2, o.torsoH, (o.torsoD ?? o.torsoW * 0.8) / 2]);
  const neck = hip + o.torsoH - 0.03;
  const head = b.group("head", body, [0, neck, 0]);
  if (o.headR) {
    b.mesh(G.ball(1), o.headRole ?? "skin", head, [0, o.headR * 0.9, 0.01],
      [o.headR, o.headR * (o.headSquash ?? 1), o.headR]);
  }
  const armLen = o.armLen ?? o.torsoH * 0.85;
  const armR = o.armRadius ?? 0.045;
  const shoulderY = hip + o.torsoH * 0.88;
  const shoulderX = o.shoulderX ?? o.torsoW / 2 + armR * 0.6;
  const hands = {};
  for (const [name, x] of [["armL", shoulderX], ["armR", -shoulderX]]) {
    const arm = b.group(name, body, [x, shoulderY, 0]);
    b.mesh(G.cyl(5), o.armRole ?? o.torsoRole ?? "team", arm, [0, -armLen / 2, 0], [armR, armLen, armR]);
    b.mesh(G.ball(0), o.handRole ?? "skin", arm, [0, -armLen, 0], armR * 1.35);
    hands[name] = b.group(name === "armL" ? "handL" : "handR", arm, [0, -armLen, 0]);
  }
  return { torso, head, neck, handL: hands.armL, handR: hands.armR, shoulderY, hip };
}

function eyes(b, parent, y, z, spread, size, role = "ink") {
  for (const x of [spread, -spread]) {
    b.mesh(G.ball(0), role, parent, [x, y, z], size, [0, 0, 0], { castShadow: false, flash: false });
  }
}

export const GROUND_DESIGNS = {
  // Clockwork duelist: bell skirt, bell helm with plume, wind-up key, long blade.
  coilblade: {
    layer: "ground", height: 1.05, radius: 0.32, motion: "biped", attack: "thrust", scale: 1.15,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, {
        hip: 0.22, torsoH: 0.2, torsoW: 0.24, torsoRole: "brass", headR: 0,
        legRole: "iron", footRole: "iron", armRole: "brass", handRole: "iron", armLen: 0.2, armRadius: 0.04, shoulderX: 0.2,
      });
      b.mesh(G.lathe("coil-bell-2", [[0.02, 0], [0.34, 0], [0.31, 0.06], [0.22, 0.18], [0.17, 0.32], [0.02, 0.34]], 8),
        "team", body, [0, 0.08, 0]);
      b.mesh(G.torus(0.2, 4, 10), "brass", body, [0, 0.09, 0], [0.33, 0.33, 0.33], [Math.PI / 2, 0, 0]);
      // Bell helm with visor slit and plume.
      b.mesh(G.lathe("coil-helm", [[0, 0], [0.2, 0], [0.19, 0.06], [0.15, 0.18], [0.09, 0.26], [0, 0.28]], 8),
        "team", p.head, [0, 0, 0]);
      b.mesh(G.torus(0.2, 3, 10), "brass", p.head, [0, 0.02, 0], [0.2, 0.2, 0.2], [Math.PI / 2, 0, 0]);
      b.mesh(G.box(), "ink", p.head, [0, 0.1, 0.17], [0.22, 0.045, 0.06], [0, 0, 0], { castShadow: false });
      b.mesh(G.cone(5), "brass", p.head, [0, 0.36, -0.03], [0.06, 0.2, 0.09], [-0.35, 0, 0]);
      // Wind-up key on the back.
      const key = b.group("key", body, [0, 0.5, -0.12], [0.5, 0, 0]);
      b.mesh(G.cyl(5), "brass", key, [0, 0, -0.05], [0.025, 0.1, 0.025], [Math.PI / 2, 0, 0]);
      const bow = b.group("keyBow", key, [0, 0, -0.11]);
      b.mesh(G.shape("coil-key", [[0, 0], [0.2, 0.1], [0.22, -0.1], [0, 0], [-0.22, 0.1], [-0.2, -0.1]], 0.03),
        "brass", bow, [0, 0, 0], [1.25, 1.25, 1]);
      // Long duelling blade held forward.
      const blade = b.group("weapon", p.handR, [0, -0.02, 0.03], [2.1, 0, 0]);
      b.mesh(G.box(), "brass", blade, [0, 0.0, 0], [0.13, 0.025, 0.05]);
      b.mesh(G.shape("coil-blade-2", [[-0.03, 0], [0.03, 0], [0.024, 0.58], [0, 0.72], [-0.024, 0.58]], 0.02),
        "steel", blade, [0, 0.01, 0]);
      b.mesh(G.cyl(4), "darkwood", blade, [0, -0.06, 0], [0.018, 0.1, 0.018]);
      b.joints.armR.rotation.x = -0.9;
      b.joints.armL.rotation.set(0.3, 0, 0.35);
    },
    animate({ joints, clock, amp }) {
      joints.keyBow.rotation.z = clock * 2.2 * amp;
    },
  },

  // Grove keeper: stocky, big bough shield with a leaf, leafy crown, club.
  mossguard: {
    layer: "ground", height: 1.1, radius: 0.4, motion: "biped", attack: "bash", scale: 1.1,
    build(b) {
      const p = biped(b, {
        hip: 0.26, torsoH: 0.34, torsoW: 0.44, torsoD: 0.34, torsoTop: 0.82, headR: 0.17,
        legRadius: 0.065, legX: 0.12, armRadius: 0.06, armLen: 0.28,
      });
      b.mesh(G.cyl(6, 0.9), "leaf", b.joints.body, [0, 0.27, 0], [0.24, 0.07, 0.19]);
      // Leafy crown.
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        b.mesh(G.cone(4), i % 2 ? "leafLight" : "leaf", p.head, [Math.sin(a) * 0.13, 0.3, Math.cos(a) * 0.13],
          [0.06, 0.16, 0.04], [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]);
      }
      eyes(b, p.head, 0.17, 0.155, 0.06, 0.025);
      // Bough shield on the left arm, facing forward.
      const shield = b.group("shield", p.handL, [-0.02, 0.12, 0.14]);
      b.mesh(G.cyl(9), "wood", shield, [0, 0, 0], [0.31, 0.06, 0.31], [Math.PI / 2, 0, 0]);
      b.mesh(G.torus(0.14, 4, 12), "darkwood", shield, [0, 0, 0.0], [0.3, 0.3, 0.4]);
      b.mesh(G.shape("leaf", LEAF, 0.03), "team", shield, [0, -0.19, 0.04], [0.32, 0.32, 1]);
      b.mesh(G.ball(0), "brass", shield, [0, 0, 0.04], 0.045);
      // Knotted club.
      const club = b.group("weapon", p.handR, [0, 0, 0.02], [Math.PI / 2 - 0.4, 0, 0]);
      b.mesh(G.cyl(5, 1.5), "wood", club, [0, 0.14, 0], [0.04, 0.32, 0.04]);
      b.mesh(G.ball(0), "darkwood", club, [0, 0.31, 0], 0.075);
    },
  },

  // Brass crossbow ranger with a wide-brimmed hat.
  brassbolt: {
    layer: "ground", height: 1.0, radius: 0.32, motion: "biped", attack: "shoot", scale: 1.1,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, { hip: 0.24, torsoH: 0.28, torsoW: 0.3, headR: 0.16, armLen: 0.2 });
      b.mesh(G.cone(6), "teamDark", body, [0, 0.36, -0.06], [0.2, 0.3, 0.12], [-0.15, 0, 0]);
      // Hat: wide brim, tall crown, amber band.
      b.mesh(G.cyl(10), "team", p.head, [0, 0.24, 0], [0.3, 0.025, 0.3]);
      b.mesh(G.cyl(7, 0.8), "teamDark", p.head, [0, 0.31, 0], [0.13, 0.13, 0.13]);
      b.mesh(G.cyl(7), "brass", p.head, [0, 0.26, 0], [0.135, 0.03, 0.135]);
      eyes(b, p.head, 0.14, 0.15, 0.055, 0.022);
      // Crossbow at chest height, held by both hands.
      const bow = b.group("weapon", body, [0, 0.4, 0.2]);
      b.mesh(G.box(), "wood", bow, [0, 0, 0.04], [0.06, 0.06, 0.4]);
      b.mesh(G.shape("brassbolt-limb-2", [[-0.5, -0.08], [-0.36, 0.05], [0, 0.09], [0.36, 0.05], [0.5, -0.08], [0.36, -0.01], [0, 0.02], [-0.36, -0.01]], 0.06),
        "brass", bow, [0, 0, 0.2], [1, 1, 1], [Math.PI / 2, 0, 0]);
      b.mesh(G.box(), "bone", bow, [0, 0.045, 0.04], [0.025, 0.025, 0.42]);
      b.mesh(G.cone(4), "ember", bow, [0, 0.045, 0.27], [0.03, 0.06, 0.03], [Math.PI / 2, 0, 0]);
      p.handR.parent.rotation.x = -1.1;
      b.joints.armL.rotation.x = -1.2;
    },
  },

  // Marsh pathfinder: towering reed hood and a bow taller than the body.
  reedsting: {
    layer: "ground", height: 1.2, radius: 0.3, motion: "biped", attack: "shoot", scale: 1.1,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, { hip: 0.24, torsoH: 0.28, torsoW: 0.26, headR: 0.14, armLen: 0.22, armRadius: 0.035 });
      b.mesh(G.cone(6), "team", body, [0, 0.38, -0.02], [0.2, 0.36, 0.17]);
      // Reed hood: tall bent cone with bound tip.
      b.mesh(G.cone(6), "leafLight", p.head, [0, 0.38, -0.04], [0.2, 0.56, 0.2], [-0.25, 0, 0]);
      b.mesh(G.cone(5), "leaf", p.head, [0.08, 0.26, -0.08], [0.06, 0.34, 0.06], [-0.3, 0, -0.35]);
      b.mesh(G.cone(5), "leaf", p.head, [-0.08, 0.26, -0.08], [0.06, 0.3, 0.06], [-0.3, 0, 0.35]);
      b.mesh(G.torus(0.3, 4, 8), "team", p.head, [0, 0.2, -0.01], [0.17, 0.17, 0.17], [Math.PI / 2, 0, 0]);
      eyes(b, p.head, 0.12, 0.125, 0.05, 0.02, "eye");
      // Tall bow in the left hand.
      const bow = b.group("weapon", p.handL, [0, 0.05, 0.08]);
      b.mesh(G.torus(0.06, 3, 10, Math.PI * 0.9), "copper", bow, [0.0, 0, 0], [0.52, 0.52, 0.52], [0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05]);
      b.mesh(G.cyl(3), "bone", bow, [0, 0, -0.05], [0.006, 1.0, 0.006]);
      b.joints.armL.rotation.x = -0.9;
      b.joints.armR.rotation.x = -0.7;
    },
  },

  // Thorn-maze runner: bramble head of thorns, short spear.
  "briar-runner": {
    // Silhouette: round green bramble head + a tall upright white thorn spear.
    layer: "ground", height: 0.8, radius: 0.22, motion: "biped", attack: "thrust", walkRate: 2.4, scale: 1.2, blob: true,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, {
        hip: 0.16, torsoH: 0.19, torsoW: 0.27, headR: 0.16, headRole: "leaf",
        legRadius: 0.04, armLen: 0.14, armRadius: 0.035, handRole: "leaf",
      });
      b.mesh(G.cone(6), "team", body, [0, 0.27, -0.06], [0.17, 0.22, 0.1], [-0.25, 0, 0]);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU + 0.3;
        b.mesh(G.cone(4), "leafLight", p.head, [Math.sin(a) * 0.12, 0.2, Math.cos(a) * 0.12],
          [0.045, 0.18, 0.045], [Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0]);
      }
      b.mesh(G.cone(4), "leafLight", p.head, [0, 0.33, 0], [0.05, 0.16, 0.05]);
      eyes(b, p.head, 0.14, 0.16, 0.05, 0.022, "eye");
      const spear = b.group("weapon", p.handR, [0, 0, 0.02], [0.2, 0, 0]);
      b.mesh(G.cyl(4), "wood", spear, [0, 0.28, 0], [0.018, 0.72, 0.018]);
      b.mesh(G.cone(4), "bone", spear, [0, 0.7, 0], [0.055, 0.2, 0.055]);
      b.mesh(G.cyl(4), "brass", spear, [0, 0.58, 0], [0.03, 0.04, 0.03]);
      b.joints.armR.rotation.x = -0.5;
    },
  },

  // Thorn-maze darter: wide straw sun-hat, long blowpipe at the lips.
  "briar-darter": {
    // Silhouette: big flat yellow straw disc + long horizontal blowpipe.
    layer: "ground", height: 0.7, radius: 0.22, motion: "biped", attack: "shoot", walkRate: 2.4, scale: 1.2, blob: true,
    build(b) {
      const p = biped(b, {
        hip: 0.16, torsoH: 0.19, torsoW: 0.27, headR: 0.13, headRole: "skin",
        legRadius: 0.04, armLen: 0.14, armRadius: 0.035,
      });
      b.mesh(G.cone(10), "reed", p.head, [0, 0.27, -0.01], [0.3, 0.12, 0.3], [-0.12, 0, 0]);
      b.mesh(G.cyl(10), "team", p.head, [0, 0.235, -0.01], [0.17, 0.035, 0.17], [-0.12, 0, 0]);
      const pipe = b.group("weapon", p.head, [0, 0.08, 0.12]);
      b.mesh(G.cyl(5), "wood", pipe, [0, 0, 0.26], [0.024, 0.6, 0.024], [Math.PI / 2, 0, 0]);
      b.mesh(G.cyl(5), "brass", pipe, [0, 0, 0.55], [0.034, 0.05, 0.034], [Math.PI / 2, 0, 0]);
      b.joints.armL.rotation.set(-1.3, 0, -0.5);
      b.joints.armR.rotation.set(-1.3, 0, 0.5);
    },
  },

  // Ember sprout: a team-coloured flame wearing a tilted nutshell cap.
  cinderling: {
    layer: "ground", height: 0.55, radius: 0.18, motion: "hopper", attack: "thrust", walkRate: 2.6, scale: 1.25, blob: true,
    build(b) {
      const body = b.joints.body;
      for (const [name, x] of [["legL", 0.055], ["legR", -0.055]]) {
        const leg = b.group(name, body, [x, 0.07, 0]);
        b.mesh(G.box(), "ash", leg, [0, -0.035, 0.01], [0.04, 0.08, 0.06]);
      }
      b.mesh(G.ball(1), "teamFlame", body, [0, 0.19, 0], [0.16, 0.15, 0.16]);
      const flame = b.group("flame", body, [0, 0.3, 0]);
      b.mesh(G.cone(6), "teamFlame", flame, [0, 0.12, -0.02], [0.12, 0.28, 0.12], [-0.15, 0, 0]);
      b.mesh(G.cone(5), "teamGlow", flame, [0.08, 0.04, 0], [0.06, 0.14, 0.06], [0, 0, -0.5]);
      b.mesh(G.cone(5), "teamGlow", flame, [-0.08, 0.03, 0.01], [0.055, 0.12, 0.055], [0, 0, 0.5]);
      b.mesh(G.ball(0), "ember", body, [0, 0.17, 0.08], [0.09, 0.08, 0.07], [0, 0, 0], { castShadow: false });
      const cap = b.group("head", body, [0.04, 0.29, 0.03], [0.25, 0, -0.35]);
      b.mesh(G.dome(7, 3), "wood", cap, [0, 0, 0], [0.11, 0.07, 0.11]);
      b.mesh(G.cyl(7), "darkwood", cap, [0, 0, 0], [0.115, 0.025, 0.115]);
      b.mesh(G.cyl(4), "darkwood", cap, [0, 0.08, 0], [0.012, 0.04, 0.012]);
      eyes(b, body, 0.22, 0.145, 0.05, 0.026);
    },
    animate({ joints, clock, amp }) {
      joints.flame.rotation.z = Math.sin(clock * 7) * 0.15 * amp;
      joints.flame.scale.y = 1 + Math.sin(clock * 11) * 0.12 * amp;
    },
  },

  // Sluice-clearer: flared skirt, hair bun, long-poled crescent sickle,
  // and a spark ring circling her boots.
  brackenwheel: {
    layer: "ground", height: 1.05, radius: 0.36, motion: "biped", attack: "spin", scale: 1.1,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, { hip: 0.24, torsoH: 0.26, torsoW: 0.24, headR: 0.15, armLen: 0.22, armRadius: 0.038 });
      b.mesh(G.cone(8), "team", body, [0, 0.33, 0], [0.26, 0.34, 0.24]);
      b.mesh(G.ball(0), "teamLight", p.head, [0, 0.3, -0.06], 0.09);
      b.mesh(G.cyl(6), "brass", p.head, [0, 0.24, -0.04], [0.06, 0.03, 0.06], [-0.4, 0, 0]);
      b.mesh(G.dome(8, 3), "team", p.head, [0, 0.16, -0.01], [0.16, 0.14, 0.16], [-0.25, 0, 0]);
      eyes(b, p.head, 0.12, 0.14, 0.05, 0.022);
      // Pole and crescent blade (blade sweeps outward to her right).
      const pole = b.group("weapon", p.handR, [0, 0, 0], [0.1, 0, 0.35]);
      b.mesh(G.cyl(4), "wood", pole, [0, 0.16, 0], [0.02, 0.7, 0.02]);
      b.mesh(G.shape("bracken-sickle-2", [[0, 0], [0.16, 0.11], [0.36, 0.09], [0.54, -0.08], [0.6, -0.28], [0.44, -0.11], [0.24, -0.04], [0.06, -0.06]], 0.035),
        "copper", pole, [0, 0.48, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
      b.mesh(G.torus(0.3, 3, 6), "brass", pole, [0, 0.46, 0], [0.035, 0.035, 0.035], [Math.PI / 2, 0, 0]);
      // Spark ring at the boots.
      const ring = b.group("sparkRing", body, [0, 0.05, 0]);
      b.mesh(G.torus(0.06, 3, 18), "teamGlow", ring, [0, 0, 0], [0.38, 0.38, 0.38], [Math.PI / 2, 0, 0], { castShadow: false });
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU;
        b.mesh(G.octa(), "ember", ring, [Math.sin(a) * 0.38, 0.04, Math.cos(a) * 0.38], 0.055, [0, 0, 0], { castShadow: false });
      }
    },
    animate({ joints, clock, amp }) {
      joints.sparkRing.rotation.y = clock * 2.5 * Math.max(0.3, amp);
    },
  },

  // Pack carrier: hunched stone core on the back, rootwood wraps, copper bells.
  stonehauler: {
    layer: "ground", height: 1.45, radius: 0.55, motion: "biped", attack: "slam", walkRate: 1.1,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, {
        hip: 0.28, torsoH: 0.42, torsoW: 0.62, torsoD: 0.48, torsoTop: 0.9, torsoRole: "stone", headR: 0,
        legRole: "shale", footRole: "shale", legRadius: 0.1, legX: 0.17,
        armRole: "stone", handRole: "shale", armRadius: 0.085, armLen: 0.42, shoulderX: 0.34,
      });
      // Team blanket over the shoulders.
      b.mesh(G.cyl(6, 0.75), "team", body, [0, 0.62, 0.02], [0.36, 0.18, 0.28]);
      b.mesh(G.box(), "team", body, [0, 0.46, 0.21], [0.42, 0.26, 0.05]);
      b.mesh(G.box(), "brass", body, [0, 0.36, 0.235], [0.42, 0.04, 0.02]);
      // Small head jutting forward, glowing eyes.
      b.mesh(G.dodeca(), "stoneLight", p.head, [0, 0.07, 0.17], [0.15, 0.13, 0.14]);
      eyes(b, p.head, 0.09, 0.3, 0.06, 0.03, "eye");
      // Boulder on the back, bound with rootwood and bells.
      const pack = b.group("pack", body, [0, 0.95, -0.2]);
      b.mesh(G.dodeca(), "stone", pack, [0, 0, 0], [0.42, 0.38, 0.36], [0.3, 0.5, 0]);
      b.mesh(G.torus(0.12, 4, 10), "darkwood", pack, [0, 0, 0], [0.43, 0.43, 0.43], [0, Math.PI / 2, 0]);
      b.mesh(G.torus(0.12, 4, 10), "darkwood", pack, [0, -0.05, 0], [0.4, 0.4, 0.4], [Math.PI / 2 - 0.2, 0, 0]);
      for (const x of [0.3, -0.3]) {
        b.mesh(G.cone(6), "copper", pack, [x, -0.28, 0.1], [0.07, 0.1, 0.07]);
        b.mesh(G.ball(0), "brass", pack, [x, -0.34, 0.1], 0.025);
      }
      b.mesh(G.box(), "team", pack, [0, 0.2, 0.16], [0.2, 0.5, 0.05], [0.6, 0, 0]);
      b.mesh(G.cyl(6), "team", pack, [0, 0.36, -0.02], [0.16, 0.08, 0.14], [0.3, 0.5, 0]);
      b.joints.armL.rotation.x = -0.25;
      b.joints.armR.rotation.x = -0.25;
      body.rotation.x = 0.12;
    },
  },

  // Fern-path scout: big pale leaf mask with tall leaf ears, light blade.
  thornscout: {
    // Silhouette: oversized pale leaf mask with two tall leaf ears, twin blades.
    layer: "ground", height: 0.85, radius: 0.22, motion: "biped", attack: "swing", walkRate: 2.3, scale: 1.15, blob: true,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, {
        hip: 0.2, torsoH: 0.21, torsoW: 0.24, headR: 0.13, headRole: "team",
        legRadius: 0.035, armLen: 0.17, armRadius: 0.03,
      });
      b.mesh(G.cone(5), "team", body, [0, 0.3, -0.06], [0.17, 0.27, 0.1], [-0.3, 0, 0]);
      b.mesh(G.shape("scout-mask-2", [[0, -0.2], [0.18, -0.07], [0.2, 0.1], [0.08, 0.2], [0, 0.16], [-0.08, 0.2], [-0.2, 0.1], [-0.18, -0.07]], 0.05),
        "bone", p.head, [0, 0.13, 0.11], [1, 1, 1], [-0.35, 0, 0]);
      eyes(b, p.head, 0.16, 0.15, 0.06, 0.026);
      for (const x of [0.09, -0.09]) {
        b.mesh(G.shape("leaf", LEAF, 0.03), "bone", p.head, [x, 0.24, -0.01], [0.14, 0.26, 1], [0, 0, x > 0 ? -0.3 : 0.3]);
      }
      for (const hand of [p.handR, p.handL]) {
        const blade = b.group(hand === p.handR ? "weapon" : "weaponL", hand, [0, 0, 0.01], [Math.PI / 2 - 0.5, 0, 0]);
        b.mesh(G.shape("scout-blade", [[-0.02, 0], [0.02, 0], [0.05, 0.18], [0.0, 0.3], [-0.015, 0.16]], 0.015),
          "steel", blade, [0, 0.02, 0]);
      }
    },
  },

  // Workshop smith: square welding helm, copper apron, big hammer.
  forgeguard: {
    layer: "ground", height: 0.85, radius: 0.27, motion: "biped", attack: "swing", scale: 1.1,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, {
        hip: 0.18, torsoH: 0.26, torsoW: 0.34, torsoD: 0.28, torsoTop: 0.95, headR: 0,
        legRadius: 0.05, legX: 0.09, armRadius: 0.05, armLen: 0.2,
      });
      b.mesh(G.box(), "copper", body, [0, 0.27, 0.13], [0.26, 0.26, 0.04]);
      b.mesh(G.box(), "darkwood", body, [0, 0.2, 0], [0.36, 0.05, 0.3]);
      // Welding helm.
      b.mesh(G.box(), "team", p.head, [0, 0.12, 0], [0.27, 0.25, 0.25]);
      b.mesh(G.box(), "iron", p.head, [0, 0.12, 0.1], [0.22, 0.13, 0.07]);
      b.mesh(G.box(), "ember", p.head, [0, 0.13, 0.137], [0.18, 0.04, 0.01], [0, 0, 0], { castShadow: false });
      b.mesh(G.box(), "teamDark", p.head, [0, 0.255, 0], [0.29, 0.04, 0.27]);
      b.mesh(G.box(), "brass", p.head, [0, 0.29, 0], [0.04, 0.05, 0.27]);
      // Hammer.
      const hammer = b.group("weapon", p.handR, [0, 0, 0.02], [Math.PI / 2 - 0.3, 0, 0]);
      b.mesh(G.cyl(4), "wood", hammer, [0, 0.12, 0], [0.02, 0.32, 0.02]);
      b.mesh(G.box(), "steel", hammer, [0, 0.3, 0], [0.24, 0.13, 0.13]);
      b.mesh(G.box(), "brass", hammer, [0, 0.3, 0], [0.06, 0.12, 0.12]);
    },
  },

  // Split oak bound with copper, carrying a dark ironstone cleaver.
  ironroot: {
    layer: "ground", height: 1.6, radius: 0.55, motion: "biped", attack: "slam", walkRate: 1.0,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, {
        hip: 0.3, torsoH: 0.62, torsoW: 0.52, torsoD: 0.46, torsoTop: 0.8, torsoSeg: 7, torsoRole: "bark", headR: 0,
        legRole: "bark", footRole: "darkwood", legRadius: 0.1, legX: 0.15,
        armRole: "bark", handRole: "darkwood", armRadius: 0.075, armLen: 0.48, shoulderX: 0.3,
      });
      // Ironstone seam and copper bands.
      b.mesh(G.box(), "iron", body, [0, 0.6, 0.19], [0.08, 0.5, 0.06], [0, 0, 0.08]);
      b.mesh(G.cyl(7, 0.9), "copper", body, [0, 0.46, 0], [0.27, 0.06, 0.24]);
      b.mesh(G.cyl(7, 0.9), "copper", body, [0, 0.76, 0], [0.24, 0.05, 0.21]);
      // Team mantle and sash.
      b.mesh(G.cyl(7, 0.6), "team", body, [0, 0.9, 0], [0.36, 0.18, 0.32]);
      for (const x of [0.3, -0.3]) b.mesh(G.ball(0), "team", body, [x, 0.86, 0], [0.13, 0.1, 0.13]);
      b.mesh(G.box(), "team", body, [0.0, 0.6, 0.21], [0.24, 0.5, 0.04], [0, 0, -0.35]);
      // Canopy head with glowing eyes.
      b.mesh(G.ball(0), "leaf", p.head, [0, 0.2, -0.04], [0.3, 0.22, 0.27]);
      b.mesh(G.ball(0), "leafLight", p.head, [0.16, 0.3, -0.06], [0.16, 0.13, 0.15]);
      b.mesh(G.ball(0), "moss", p.head, [-0.15, 0.3, -0.1], [0.15, 0.12, 0.15]);
      b.mesh(G.box(), "bark", p.head, [0, 0.06, 0.12], [0.22, 0.14, 0.1]);
      eyes(b, p.head, 0.07, 0.18, 0.06, 0.035, "teamGlow");
      // Cleaver.
      const blade = b.group("weapon", p.handR, [0, 0, 0.02], [Math.PI / 2 - 0.35, 0, 0]);
      b.mesh(G.cyl(4), "darkwood", blade, [0, 0.08, 0], [0.03, 0.26, 0.03]);
      b.mesh(G.shape("ironroot-cleaver", [[-0.06, 0.18], [0.07, 0.18], [0.2, 0.3], [0.22, 0.78], [0.0, 0.9], [-0.08, 0.72]], 0.05),
        "iron", blade, [0, 0, 0]);
      b.mesh(G.box(), "copper", blade, [0, 0.2, 0], [0.22, 0.05, 0.07]);
    },
  },

  // Woodland warden: branching antler headdress, hooded cloak, glowing-thread bow.
  "sunthread-warden": {
    layer: "ground", height: 1.15, radius: 0.3, motion: "biped", attack: "shoot", scale: 1.1,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, { hip: 0.24, torsoH: 0.27, torsoW: 0.26, headR: 0.14, armLen: 0.21, armRadius: 0.035 });
      b.mesh(G.cyl(7, 0.4), "team", body, [0, 0.36, -0.02], [0.22, 0.34, 0.2]);
      b.mesh(G.dome(7, 3), "teamDark", p.head, [0, 0.14, -0.02], [0.17, 0.17, 0.17], [-0.3, 0, 0]);
      eyes(b, p.head, 0.12, 0.13, 0.05, 0.02);
      // Antlers.
      for (const side of [1, -1]) {
        const antler = b.group(null, p.head, [side * 0.08, 0.25, -0.02], [0, 0, -side * 0.45]);
        b.mesh(G.cyl(4), "bone", antler, [0, 0.12, 0], [0.018, 0.26, 0.018]);
        b.mesh(G.cyl(4), "bone", antler, [side * 0.05, 0.16, 0], [0.014, 0.12, 0.014], [0, 0, -side * 0.9]);
        b.mesh(G.cyl(4), "bone", antler, [-side * 0.03, 0.22, 0], [0.012, 0.09, 0.012], [0, 0, side * 0.7]);
      }
      // Sun-thread halo: the warden's bright golden read at range.
      b.mesh(G.torus(0.24, 3, 14), "sun", p.head, [0, 0.2, -0.1], [0.25, 0.25, 0.25]);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU;
        b.mesh(G.cone(3), "sun", p.head, [Math.sin(a) * 0.33, 0.2 + Math.cos(a) * 0.33, -0.1], [0.045, 0.12, 0.025], [0, 0, -a]);
      }
      // Yew bow with brass thread.
      const bow = b.group("weapon", p.handL, [0, 0, 0.06], [0, 0, -0.5]);
      b.mesh(G.torus(0.07, 3, 10, Math.PI * 0.8), "wood", bow, [0, 0, 0], [0.38, 0.38, 0.38], [0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.1]);
      b.mesh(G.cyl(3), "ember", bow, [0, 0, -0.03], [0.01, 0.68, 0.01], [0, 0, 0], { castShadow: false });
      b.joints.armL.rotation.x = -1.0;
      b.joints.armR.rotation.x = -0.8;
    },
  },

  // Kiln tender: barrel body, chimney hat with smoke, bell-mouthed launcher.
  kilnkeeper: {
    layer: "ground", height: 1.2, radius: 0.36, motion: "biped", attack: "lob", walkRate: 1.3, scale: 1.05,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, {
        hip: 0.2, torsoH: 0.34, torsoW: 0.46, torsoD: 0.42, torsoTop: 0.85, torsoSeg: 8, headR: 0.15,
        legRadius: 0.06, legX: 0.11, armRadius: 0.05, armLen: 0.22,
      });
      b.mesh(G.box(), "darkwood", body, [0, 0.3, 0.17], [0.3, 0.26, 0.05]);
      b.mesh(G.cyl(8), "brass", body, [0, 0.47, 0], [0.22, 0.03, 0.2]);
      eyes(b, p.head, 0.15, 0.14, 0.05, 0.022);
      b.mesh(G.box(), "darkwood", p.head, [0, 0.08, 0.13], [0.16, 0.04, 0.03], [0, 0, 0], { castShadow: false });
      // Chimney hat.
      b.mesh(G.cyl(8), "iron", p.head, [0, 0.27, 0], [0.18, 0.03, 0.18]);
      b.mesh(G.cyl(6, 0.9), "iron", p.head, [0, 0.42, 0], [0.1, 0.3, 0.1]);
      b.mesh(G.cyl(6), "team", p.head, [0, 0.46, 0], [0.105, 0.06, 0.105]);
      const smoke = b.group("smoke", p.head, [0, 0.6, 0]);
      b.mesh(G.ball(0), "stoneLight", smoke, [0, 0.03, 0], 0.07, [0, 0, 0], { castShadow: false });
      b.mesh(G.ball(0), "stoneLight", smoke, [0.05, 0.12, -0.03], 0.05, [0, 0, 0], { castShadow: false });
      // Bell-mouthed launcher on the right shoulder.
      const gun = b.group("weapon", body, [-0.27, 0.56, 0.02], [-0.5, 0, 0]);
      b.mesh(G.lathe("kiln-launcher", [[0.06, -0.22], [0.075, -0.05], [0.08, 0.1], [0.12, 0.2], [0.17, 0.26], [0.14, 0.27], [0.1, 0.22]], 8),
        "copper", gun, [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
      b.mesh(G.ball(0), "ember", gun, [0, 0, 0.21], 0.07, [0, 0, 0], { castShadow: false });
      b.mesh(G.torus(0.3, 3, 8), "brass", gun, [0, 0, 0.0], [0.085, 0.085, 0.085]);
      b.joints.armR.rotation.set(-2.4, 0, -0.2);
      b.joints.armL.rotation.set(-1.2, 0, -0.45);
    },
    animate({ joints, clock, amp }) {
      const rise = (clock * 0.6) % 1;
      joints.smoke.position.y += rise * 0.12 * amp;
      joints.smoke.scale.setScalar(0.7 + rise * 0.6);
    },
  },

  // Weir lock-keeper in an oilskin with a copper-ribbed kite on a wire.
  stormkite: {
    layer: "ground", height: 1.05, radius: 0.32, motion: "biped", attack: "arc", scale: 1.1,
    build(b) {
      const body = b.joints.body;
      const p = biped(b, { hip: 0.24, torsoH: 0.3, torsoW: 0.3, headR: 0.15, armLen: 0.22 });
      b.mesh(G.cyl(7, 0.6), "team", body, [0, 0.32, 0], [0.2, 0.32, 0.18]);
      // Sou'wester hat, brim sloping to the back.
      b.mesh(G.cyl(9), "brass", p.head, [0, 0.24, -0.03], [0.23, 0.025, 0.25], [-0.25, 0, 0]);
      b.mesh(G.dome(8, 3), "brass", p.head, [0, 0.24, 0], [0.15, 0.12, 0.15]);
      eyes(b, p.head, 0.13, 0.145, 0.05, 0.022);
      // Reel in the right hand, wire up to the kite.
      b.mesh(G.cyl(6), "darkwood", p.handR, [0, 0, 0.03], [0.05, 0.05, 0.05], [0, 0, Math.PI / 2]);
      const kite = b.group("kite", body, [-0.35, 1.9, 0.15]);
      const sail = b.group("kiteSail", kite, [0, 0, 0], [-1.25, 0, 0]);
      b.mesh(G.shape("kite-sail", [[0, 0.42], [0.3, 0.06], [0, -0.42], [-0.3, 0.06]], 0.03), "team", sail, [0, 0, 0], [1, 1, 1], [0, 0, 0], { castShadow: false });
      b.mesh(G.box(), "brass", sail, [0, 0, 0.025], [0.025, 0.84, 0.02], [0, 0, 0], { castShadow: false });
      b.mesh(G.box(), "brass", sail, [0, 0.06, 0.025], [0.6, 0.025, 0.02], [0, 0, 0], { castShadow: false });
      for (let i = 0; i < 3; i += 1) {
        b.mesh(G.shape("kite-bow", [[0, 0], [0.06, 0.04], [0.06, -0.04], [0, 0], [-0.06, 0.04], [-0.06, -0.04]], 0.02),
          "brass", sail, [0, -0.5 - i * 0.12, 0], [1, 1, 1], [0, 0, i * 0.4], { castShadow: false });
      }
      const spark = b.group("spark", kite, [0, 0, 0.06]);
      b.mesh(G.octa(), "teamGlow", spark, [0, 0, 0], [0.16, 0.3, 0.06], [0, 0, 0], { castShadow: false, flash: false });
      // Wire from the hand to the kite.
      b.mesh(G.cyl(3), "ink", body, [-0.26, 1.15, 0.12], [0.007, 1.5, 0.007], [0.0, 0, 0.1], { castShadow: false });
      b.joints.armR.rotation.x = -0.6;
    },
    animate({ joints, clock, amp, attack }) {
      joints.kite.position.x += Math.sin(clock * 1.3) * 0.08 * amp;
      joints.kite.rotation.z = Math.sin(clock * 1.7) * 0.15 * amp;
      const on = attack ? attack.hit * (1 - attack.back) : 0;
      joints.spark.visible = on > 0.05;
      joints.spark.scale.setScalar(0.6 + on * 0.8);
    },
  },
};
