// Flying designs. The frame lifts `body` to `hover` tiles and draws a
// shadow blob on the ground beneath it.
import { G } from "./kit.js";

function eyes(b, parent, y, z, spread, size, role = "ink") {
  for (const x of [spread, -spread]) {
    b.mesh(G.ball(0), role, parent, [x, y, z], size, [0, 0, 0], { castShadow: false, flash: false });
  }
}

export const AIR_DESIGNS = {
  // Copper-kettle airship with a team canvas sail and a spout gun.
  copperskiff: {
    layer: "air", height: 2.35, radius: 0.5, motion: "flyer", attack: "shoot", hover: 1.25, flapRate: 0.6,
    shadowRadius: 0.48,
    build(b) {
      const body = b.joints.body;
      b.mesh(G.sphere(9, 6), "copper", body, [0, 0.22, 0], [0.36, 0.26, 0.42]);
      b.mesh(G.cyl(9), "brass", body, [0, 0.26, 0], [0.37, 0.05, 0.43]);
      b.mesh(G.cyl(9), "teamDark", body, [0, 0.42, 0], [0.24, 0.05, 0.3]);
      // Spout gun.
      const spout = b.group("weapon", body, [0, 0.22, 0.38], [Math.PI / 2 - 0.25, 0, 0]);
      b.mesh(G.cyl(6, 0.55), "brass", spout, [0, 0.1, 0], [0.07, 0.24, 0.07]);
      b.mesh(G.torus(0.3, 3, 8), "copper", spout, [0, 0.22, 0], [0.045, 0.045, 0.045], [Math.PI / 2, 0, 0]);
      // Mast and sail.
      b.mesh(G.cyl(4), "darkwood", body, [0, 0.8, 0], [0.025, 0.9, 0.025]);
      const sail = b.group("sail", body, [0, 0.82, 0.02]);
      b.mesh(G.shape("skiff-sail", [[0, 0.4], [0.42, 0.28], [0.46, -0.16], [0.1, -0.3], [0, -0.3], [-0.1, -0.3], [-0.46, -0.16], [-0.42, 0.28]], 0.04),
        "team", sail, [0, 0, 0.03], [1, 1, 1], [0, 0, 0]);
      b.mesh(G.box(), "darkwood", sail, [0, 0.4, 0.03], [0.9, 0.035, 0.035]);
      b.mesh(G.shape("skiff-pennant", [[0, 0.06], [0.24, 0], [0, -0.06]], 0.02), "brass", body, [0, 1.27, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
      // Kettle handle hoops and a stern propeller.
      b.mesh(G.torus(0.12, 3, 10, Math.PI), "brass", body, [0, 0.4, 0], [0.2, 0.18, 0.2], [0, Math.PI / 2, 0]);
      const prop = b.group("prop", body, [0, 0.22, -0.44]);
      b.mesh(G.box(), "brass", prop, [0, 0, 0], [0.42, 0.06, 0.02]);
      b.mesh(G.ball(0), "copper", prop, [0, 0, 0], 0.05);
    },
    animate({ joints, clock, amp }) {
      joints.prop.rotation.z = clock * 14 * Math.max(0.2, amp);
      joints.sail.rotation.y = Math.sin(clock * 1.4) * 0.08 * amp;
      joints.sail.scale.z = 1 + Math.sin(clock * 2.1) * 0.6 * amp;
    },
  },

  // Stone wanderer riding a cloud puff, swinging a smith's hammer.
  skymaul: {
    layer: "air", height: 2.1, radius: 0.5, motion: "flyer", attack: "slam", hover: 0.85, flapRate: 0.5,
    shadowRadius: 0.5,
    build(b) {
      const body = b.joints.body;
      // Cloud puff.
      const cloud = b.group("cloud", body, [0, 0, 0]);
      b.mesh(G.ball(1), "cloud", cloud, [0, 0.02, 0], [0.34, 0.16, 0.3], [0, 0, 0], { castShadow: false });
      b.mesh(G.ball(0), "cloud", cloud, [0.26, 0.04, 0.05], [0.2, 0.13, 0.18], [0, 0, 0], { castShadow: false });
      b.mesh(G.ball(0), "cloud", cloud, [-0.25, 0.03, -0.06], [0.19, 0.12, 0.18], [0, 0, 0], { castShadow: false });
      // Stone torso and team mantle.
      b.mesh(G.dodeca(), "stone", body, [0, 0.42, 0], [0.32, 0.3, 0.27]);
      b.mesh(G.cyl(7, 0.55), "team", body, [0, 0.62, -0.01], [0.36, 0.2, 0.3]);
      b.mesh(G.cone(6), "team", body, [0, 0.4, -0.25], [0.34, 0.5, 0.08], [Math.PI - 0.3, 0, 0]);
      const head = b.group("head", body, [0, 0.7, 0.04]);
      b.mesh(G.dodeca(), "stoneLight", head, [0, 0.1, 0.02], [0.15, 0.14, 0.14]);
      b.mesh(G.cyl(7), "teamDark", head, [0, 0.15, 0.02], [0.155, 0.04, 0.15]);
      eyes(b, head, 0.09, 0.15, 0.055, 0.03, "eye");
      // Arms with copper bands.
      for (const [name, x] of [["armL", 0.32], ["armR", -0.32]]) {
        const arm = b.group(name, body, [x, 0.6, 0]);
        b.mesh(G.dodeca(), "stone", arm, [0, -0.13, 0], [0.09, 0.17, 0.09]);
        b.mesh(G.cyl(6), "copper", arm, [0, -0.13, 0], [0.095, 0.05, 0.095]);
        b.mesh(G.dodeca(), "stoneLight", arm, [0, -0.3, 0], 0.08);
        b.group(name === "armL" ? "handL" : "handR", arm, [0, -0.3, 0]);
      }
      // Great hammer.
      const hammer = b.group("weapon", b.joints.handR, [0, 0, 0.02], [Math.PI / 2 - 0.2, 0, 0]);
      b.mesh(G.cyl(4), "wood", hammer, [0, 0.18, 0], [0.025, 0.52, 0.025]);
      b.mesh(G.box(), "shale", hammer, [0, 0.46, 0], [0.32, 0.19, 0.19]);
      b.mesh(G.box(), "brass", hammer, [0.1, 0.46, 0], [0.04, 0.2, 0.2]);
      b.mesh(G.box(), "brass", hammer, [-0.1, 0.46, 0], [0.04, 0.2, 0.2]);
      b.joints.armL.rotation.z = 0.3;
    },
    animate({ joints, clock, amp }) {
      joints.cloud.rotation.y = clock * 0.6 * amp;
      joints.cloud.scale.x = 1 + Math.sin(clock * 2) * 0.05 * amp;
    },
  },

  // Owl-moth: round fuzzy body, huge owl eyes, broad patterned moth wings.
  duskwing: {
    layer: "air", height: 1.75, radius: 0.32, motion: "flyer", attack: "shoot", hover: 1.05, flapRate: 2.4,
    shadowRadius: 0.34,
    build(b) {
      const body = b.joints.body;
      b.mesh(G.ball(1), "team", body, [0, 0.2, 0], [0.19, 0.22, 0.18]);
      b.mesh(G.ball(0), "teamLight", body, [0, 0.13, 0.08], [0.12, 0.13, 0.1]);
      const head = b.group("head", body, [0, 0.36, 0.02]);
      b.mesh(G.ball(1), "team", head, [0, 0.04, 0], [0.16, 0.13, 0.15]);
      for (const x of [0.07, -0.07]) {
        b.mesh(G.cyl(8), "bone", head, [x, 0.05, 0.12], [0.06, 0.03, 0.06], [Math.PI / 2, 0, 0], { castShadow: false });
        b.mesh(G.ball(0), "ink", head, [x, 0.05, 0.145], 0.03, [0, 0, 0], { castShadow: false, flash: false });
        b.mesh(G.cone(4), "teamDark", head, [x * 1.3, 0.17, -0.01], [0.04, 0.12, 0.04], [0, 0, x > 0 ? -0.4 : 0.4]);
      }
      b.mesh(G.cone(4), "brass", head, [0, 0.0, 0.15], [0.025, 0.05, 0.025], [Math.PI, 0, 0]);
      const wing = [[0, 0.02], [0.18, 0.18], [0.44, 0.22], [0.56, 0.08], [0.5, -0.12], [0.3, -0.26], [0.1, -0.16], [0, -0.06]];
      for (const [name, side] of [["wingL", 1], ["wingR", -1]]) {
        const w = b.group(name, body, [side * 0.12, 0.26, -0.03]);
        b.mesh(G.shape("duskwing-wing", wing, 0.025), "teamLight", w, [0, 0, 0], [side, 1, 1], [-Math.PI / 2 + 0.15, 0, 0]);
        b.mesh(G.cyl(8), "teamDark", w, [side * 0.34, 0.012, 0.02], [0.08, 0.02, 0.08], [0, 0, 0], { castShadow: false });
        b.mesh(G.cyl(8), "brass", w, [side * 0.34, 0.02, 0.02], [0.035, 0.02, 0.035], [0, 0, 0], { castShadow: false });
      }
      // Glowing emberseed held below.
      const seed = b.group("weapon", body, [0, 0.0, 0.08]);
      b.mesh(G.ball(0), "ember", seed, [0, 0, 0], 0.06, [0, 0, 0], { castShadow: false });
    },
  },

  // Gloamwing: small dart of a bat with jagged wings and tall ears.
  gloamwing: {
    layer: "air", height: 1.4, radius: 0.26, motion: "flyer", attack: "dive", hover: 0.9, flapRate: 4.2, scale: 1.15,
    shadowRadius: 0.26,
    build(b) {
      const body = b.joints.body;
      b.mesh(G.ball(0), "violetDark", body, [0, 0.16, 0], [0.11, 0.12, 0.15]);
      b.mesh(G.ball(0), "team", body, [0, 0.12, 0.05], [0.08, 0.08, 0.09]);
      const head = b.group("head", body, [0, 0.25, 0.08]);
      b.mesh(G.ball(0), "violetDark", head, [0, 0.03, 0], 0.09);
      for (const x of [0.05, -0.05]) {
        b.mesh(G.cone(4), "team", head, [x, 0.13, -0.02], [0.035, 0.13, 0.03], [0, 0, x > 0 ? -0.25 : 0.25]);
      }
      eyes(b, head, 0.04, 0.075, 0.035, 0.022, "eye");
      const wing = [[0, 0.08], [0.16, 0.18], [0.36, 0.22], [0.34, 0.06], [0.27, -0.05], [0.21, 0.02], [0.14, -0.1], [0.07, -0.03], [0, -0.1]];
      for (const [name, side] of [["wingL", 1], ["wingR", -1]]) {
        const w = b.group(name, body, [side * 0.07, 0.19, 0]);
        b.mesh(G.shape("gloamwing-wing-3", wing, 0.02), "team", w, [0, 0, 0], [side, 1, 1], [-Math.PI / 2 + 0.2, 0, 0]);
        b.mesh(G.box(), "violetDark", w, [side * 0.18, 0.012, -0.12], [0.36, 0.02, 0.025], [0, -side * 0.35, 0]);
      }
      b.mesh(G.cone(4), "violetDark", body, [0, 0.14, -0.2], [0.04, 0.16, 0.04], [-Math.PI / 2, 0, 0]);
    },
  },

  // Coppershade: little copper glider bird with team wings and a spark beak.
  coppershade: {
    layer: "air", height: 1.65, radius: 0.24, motion: "flyer", attack: "shoot", hover: 1.25, flapRate: 1.3, scale: 1.3,
    shadowRadius: 0.24,
    build(b) {
      const body = b.joints.body;
      b.mesh(G.octa(), "copper", body, [0, 0.14, 0], [0.09, 0.09, 0.2]);
      const head = b.group("head", body, [0, 0.19, 0.15]);
      b.mesh(G.ball(0), "brass", head, [0, 0, 0], 0.075);
      b.mesh(G.cone(4), "ember", head, [0, -0.01, 0.09], [0.028, 0.08, 0.028], [Math.PI / 2, 0, 0], { castShadow: false });
      eyes(b, head, 0.02, 0.055, 0.04, 0.016);
      const wing = [[0, 0.13], [0.22, 0.11], [0.46, -0.02], [0.42, -0.08], [0.2, -0.13], [0, -0.13]];
      for (const [name, side] of [["wingL", 1], ["wingR", -1]]) {
        const w = b.group(name, body, [side * 0.05, 0.16, 0.02]);
        b.mesh(G.shape("coppershade-wing-4", wing, 0.03), "team", w, [0, 0, 0], [side, 1, 1], [-Math.PI / 2, -side * 0.2, 0]);
        b.mesh(G.box(), "brass", w, [side * 0.2, 0.012, 0.04], [0.38, 0.015, 0.02], [0, side * 0.12, 0]);
      }
      b.mesh(G.shape("coppershade-tail", [[0, 0], [0.1, -0.16], [0, -0.12], [-0.1, -0.16]], 0.02), "teamDark", body,
        [0, 0.14, -0.16], [1, 1, 1], [-Math.PI / 2, 0, 0]);
      b.group("weapon", head, [0, 0, 0.1]);
    },
    animate({ joints, pose, clock, amp }) {
      if (pose === "idle" || pose === "walk") {
        joints.body.rotation.z += Math.sin(clock * 0.9 + 1) * 0.15 * amp;
      }
    },
  },
};

