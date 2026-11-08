// Placed structures and the spell prop.
import { G } from "./kit.js";

const TAU = Math.PI * 2;

function pennant(b, parent, position, height = 0.55) {
  const pole = b.group(null, parent, position);
  b.mesh(G.cyl(4), "darkwood", pole, [0, height / 2, 0], [0.02, height, 0.02]);
  b.mesh(G.ball(0), "brass", pole, [0, height + 0.02, 0], 0.035);
  const flag = b.group("flag", pole, [0, height - 0.12, 0]);
  b.mesh(G.shape("pennant", [[0, 0.1], [0.3, 0.04], [0.22, 0], [0.3, -0.06], [0, -0.1]], 0.02), "team", flag, [0, 0, 0]);
  return flag;
}

export const STRUCTURE_DESIGNS = {
  // Creek-side launcher: stone plinth, glowing basin, long copper channel on twin braces.
  "ember-basin": {
    layer: "structure", height: 1.35, radius: 0.85, motion: "structure", attack: "lob",
    build(b) {
      const body = b.joints.body;
      b.mesh(G.cyl(8, 0.92), "stone", body, [0, 0.1, 0], [0.8, 0.2, 0.8]);
      b.mesh(G.cyl(8, 0.95), "team", body, [0, 0.25, 0], [0.74, 0.12, 0.74]);
      b.mesh(G.cyl(8), "stoneLight", body, [0, 0.33, 0], [0.66, 0.04, 0.66]);
      b.mesh(G.torus(0.08, 3, 16), "brass", body, [0, 0.35, 0], [0.66, 0.66, 0.66], [Math.PI / 2, 0, 0]);
      // Stone basin with a copper lip, heaped with glowing emberseeds.
      b.mesh(G.lathe("basin-bowl-2", [[0.05, 0], [0.24, 0.02], [0.32, 0.12], [0.36, 0.24], [0.3, 0.24], [0.25, 0.14], [0.05, 0.12]], 9),
        "stone", body, [0, 0.36, -0.36]);
      b.mesh(G.torus(0.12, 3, 12), "copper", body, [0, 0.6, -0.36], [0.33, 0.33, 0.33], [Math.PI / 2, 0, 0]);
      b.mesh(G.ball(0), "ember", body, [0, 0.55, -0.36], [0.24, 0.08, 0.24], [0, 0, 0], { castShadow: false });
      for (const [x, z] of [[-0.1, -0.3], [0.1, -0.44], [0.12, -0.28]]) {
        b.mesh(G.octa(), "ember", body, [x, 0.62, z], 0.06, [0.4, 0.6, 0], { castShadow: false });
      }
      // Twin braces holding the channel's axle.
      for (const x of [0.3, -0.3]) {
        b.mesh(G.box(), "darkwood", body, [x, 0.6, 0.0], [0.08, 0.56, 0.08], [0.32, 0, 0]);
        b.mesh(G.box(), "darkwood", body, [x, 0.6, 0.3], [0.08, 0.56, 0.08], [-0.32, 0, 0]);
        b.mesh(G.box(), "team", body, [x, 0.5, 0.15], [0.09, 0.2, 0.36]);
      }
      b.mesh(G.cyl(6), "iron", body, [0, 0.84, 0.15], [0.05, 0.7, 0.05], [0, 0, Math.PI / 2]);
      // Long copper-ribbed launch channel, raised toward the front.
      const arm = b.group("weapon", body, [0, 0.86, 0.15], [-0.32, 0, 0]);
      b.mesh(G.box(), "wood", arm, [0, 0, 0.1], [0.26, 0.05, 1.25]);
      for (const x of [0.13, -0.13]) b.mesh(G.box(), "wood", arm, [x, 0.06, 0.1], [0.04, 0.12, 1.25]);
      for (let i = 0; i < 3; i += 1) b.mesh(G.box(), "copper", arm, [0, 0.06, -0.3 + i * 0.4], [0.32, 0.15, 0.06]);
      b.mesh(G.box(), "brass", arm, [0, 0.08, 0.72], [0.3, 0.16, 0.04]);
      b.mesh(G.ball(0), "ember", arm, [0, 0.1, -0.38], 0.1, [0, 0, 0], { castShadow: false });
      pennant(b, body, [0.6, 0.3, -0.45], 0.7);
    },
    animate({ joints, clock, amp }) {
      joints.flag.rotation.y = Math.sin(clock * 2.2) * 0.35 * amp;
    },
  },

  // Hatch beside the sluice; a riveted lookout with a copper coil rises from it.
  "buried-coil": {
    layer: "structure", height: 1.3, radius: 0.75, motion: "structure", attack: "arc",
    build(b) {
      const body = b.joints.body;
      // Hatch ring stays on the ground.
      b.mesh(G.cyl(10), "shale", body, [0, 0.03, 0], [0.74, 0.06, 0.74], [0, 0, 0], { receiveShadow: true });
      b.mesh(G.torus(0.14, 3, 12), "team", body, [0, 0.07, 0], [0.62, 0.62, 0.62], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU;
        b.mesh(G.ball(0), "brass", body, [Math.sin(a) * 0.68, 0.07, Math.cos(a) * 0.68], 0.035, [0, 0, 0], { castShadow: false });
      }
      // Hatch doors.
      for (const [name, side] of [["doorL", 1], ["doorR", -1]]) {
        const hinge = b.group(name, body, [side * 0.52, 0.07, 0]);
        b.mesh(G.cyl(8, 1), "iron", hinge, [-side * 0.26, 0.02, 0], [0.26, 0.04, 0.5], [0, 0, 0]);
        b.mesh(G.box(), "brass", hinge, [-side * 0.26, 0.05, 0], [0.04, 0.02, 0.6]);
      }
      // Rising turret.
      const turret = b.group("turret", body, [0, 0, 0]);
      b.mesh(G.cyl(8, 0.85), "iron", turret, [0, 0.38, 0], [0.4, 0.62, 0.4]);
      b.mesh(G.cyl(8), "brass", turret, [0, 0.36, 0], [0.41, 0.05, 0.41]);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU + 0.2;
        b.mesh(G.ball(0), "brass", turret, [Math.sin(a) * 0.41, 0.2, Math.cos(a) * 0.41], 0.03, [0, 0, 0], { castShadow: false });
      }
      b.mesh(G.cyl(8), "team", turret, [0, 0.72, 0], [0.42, 0.1, 0.42]);
      b.mesh(G.box(), "ink", turret, [0, 0.55, 0.32], [0.36, 0.07, 0.1]);
      const coil = b.group("weapon", turret, [0, 0.78, 0]);
      for (let i = 0; i < 3; i += 1) {
        b.mesh(G.torus(0.2, 3, 10), "copper", coil, [0, 0.06 + i * 0.1, 0], [0.18 - i * 0.03, 0.18 - i * 0.03, 0.18 - i * 0.03], [Math.PI / 2, 0, 0]);
      }
      b.mesh(G.cyl(5), "iron", coil, [0, 0.18, 0], [0.04, 0.36, 0.04]);
      b.mesh(G.ball(1), "teamGlow", coil, [0, 0.42, 0], 0.09, [0, 0, 0], { castShadow: false });
      const spark = b.group("spark", coil, [0, 0.42, 0]);
      b.mesh(G.octa(), "teamGlow", spark, [0, 0, 0], [0.22, 0.22, 0.22], [0, 0, 0], { castShadow: false, flash: false });
    },
    hidden: true,
    animate({ joints, clock, amp, attack, hiddenAmount }) {
      const reveal = 1 - hiddenAmount;
      joints.turret.position.y += -0.95 * hiddenAmount;
      joints.turret.visible = reveal > 0.02;
      joints.doorL.rotation.z = reveal * 1.9;
      joints.doorR.rotation.z = -reveal * 1.9;
      joints.weapon.rotation.y = clock * 1.4 * amp;
      const on = attack ? attack.hit * (1 - attack.back) : 0;
      joints.spark.visible = on > 0.05 && reveal > 0.5;
      joints.spark.scale.setScalar(0.5 + on);
    },
  },

  // Resource well: stone ring, team-tiled roof, rootwood crank, glowing pool, flasks.
  "aether-well": {
    layer: "structure", height: 1.6, radius: 0.8, motion: "structure", attack: "pulse",
    build(b) {
      const body = b.joints.body;
      b.mesh(G.cyl(10), "stone", body, [0, 0.2, 0], [0.55, 0.4, 0.55]);
      b.mesh(G.cyl(10), "stoneLight", body, [0, 0.42, 0], [0.58, 0.06, 0.58]);
      b.mesh(G.cyl(10), "ember", body, [0, 0.43, 0], [0.44, 0.02, 0.44], [0, 0, 0], { castShadow: false });
      // Posts and roof.
      for (const x of [0.5, -0.5]) b.mesh(G.box(), "darkwood", body, [x, 0.8, 0], [0.08, 0.85, 0.08]);
      const roof = b.group("roof", body, [0, 1.28, 0]);
      for (const side of [1, -1]) {
        b.mesh(G.box(), "team", roof, [side * 0.27, 0, 0], [0.66, 0.05, 0.62], [0, 0, side * -0.6]);
        b.mesh(G.box(), "teamDark", roof, [side * 0.27, -0.03, 0.32], [0.66, 0.04, 0.03], [0, 0, side * -0.6]);
      }
      b.mesh(G.box(), "brass", roof, [0, 0.19, 0], [0.06, 0.06, 0.66]);
      // Crank axle and handle.
      const crank = b.group("crank", body, [0, 0.95, 0], [0, 0, 0]);
      b.mesh(G.cyl(6), "wood", crank, [0, 0, 0], [0.05, 1.12, 0.05], [0, 0, Math.PI / 2]);
      const handle = b.group(null, crank, [-0.6, 0, 0]);
      b.mesh(G.box(), "wood", handle, [0, -0.1, 0], [0.04, 0.22, 0.04]);
      b.mesh(G.cyl(5), "brass", handle, [-0.05, -0.2, 0], [0.025, 0.12, 0.025], [0, 0, Math.PI / 2]);
      // Copper scoop on its rope.
      const scoop = b.group("weapon", body, [0, 0.95, 0]);
      b.mesh(G.cyl(3), "cloth", scoop, [0, -0.15, 0], [0.008, 0.3, 0.008], [0, 0, 0], { castShadow: false });
      b.mesh(G.lathe("well-scoop", [[0.02, 0], [0.12, 0.02], [0.14, 0.14], [0.11, 0.14], [0.09, 0.05], [0.02, 0.04]], 7),
        "copper", scoop, [0, -0.42, 0]);
      b.mesh(G.ball(0), "ember", scoop, [0, -0.3, 0], 0.06, [0, 0, 0], { castShadow: false });
      // Flasks by the rim.
      for (const [x, z] of [[0.48, 0.42], [0.62, 0.22]]) {
        b.mesh(G.ball(0), "glass", body, [x, 0.12, z], [0.1, 0.12, 0.1], [0, 0, 0], { castShadow: false });
        b.mesh(G.ball(0), "ember", body, [x, 0.1, z], 0.06, [0, 0, 0], { castShadow: false });
        b.mesh(G.cyl(5), "wood", body, [x, 0.25, z], [0.035, 0.07, 0.035]);
      }
    },
    animate({ joints, clock, amp, attack }) {
      joints.crank.rotation.x = clock * 1.6 * Math.max(0.3, amp);
      const lift = attack ? Math.sin(Math.PI * attack.u) : 0;
      joints.weapon.position.y += 0.06 * Math.sin(clock * 1.6) * amp + 0.25 * lift;
    },
  },

  // Stone bastion with a tall copper needle and bone fins.
  "bulwark-needle": {
    layer: "structure", height: 1.9, radius: 0.75, motion: "structure", attack: "shoot",
    build(b) {
      const body = b.joints.body;
      b.mesh(G.cyl(6, 0.85), "stone", body, [0, 0.22, 0], [0.7, 0.44, 0.7]);
      b.mesh(G.cyl(6), "team", body, [0, 0.47, 0], [0.62, 0.08, 0.62]);
      b.mesh(G.cyl(6, 0.7), "shale", body, [0, 0.7, 0], [0.4, 0.4, 0.4]);
      const needle = b.group("weapon", body, [0, 0.9, 0]);
      b.mesh(G.cone(6), "copper", needle, [0, 0.5, 0], [0.11, 1.0, 0.11]);
      b.mesh(G.cyl(6), "brass", needle, [0, 0.12, 0], [0.14, 0.08, 0.14]);
      for (const side of [1, -1]) {
        b.mesh(G.shape("needle-fin", [[0, 0], [0.32, 0.4], [0.06, 0.62]], 0.04), "bone", needle,
          [side * 0.08, 0.1, 0], [side, 1, 1]);
      }
      pennant(b, body, [0.5, 0.5, 0.3], 0.55);
    },
    animate({ joints, clock, amp }) {
      joints.flag.rotation.y = Math.sin(clock * 2.2) * 0.35 * amp;
    },
  },
};

export const EFFECT_DESIGNS = {
  // Stormglass orb in a copper collar with a team-coloured squall inside.
  "squall-orb": {
    layer: "effect", height: 1.4, radius: 0.5, motion: "flyer", attack: "pulse", hover: 0.75, flapRate: 1,
    shadowRadius: 0.3,
    build(b) {
      const body = b.joints.body;
      b.mesh(G.ball(1), "glass", body, [0, 0.35, 0], 0.34, [0, 0, 0], { castShadow: false });
      const swirl = b.group("swirl", body, [0, 0.35, 0]);
      b.mesh(G.torus(0.2, 3, 12), "teamGlow", swirl, [0, 0, 0], [0.2, 0.2, 0.2], [Math.PI / 2 - 0.4, 0, 0], { castShadow: false });
      b.mesh(G.torus(0.2, 3, 12), "teamGlow", swirl, [0, 0, 0], [0.14, 0.14, 0.14], [Math.PI / 2 + 0.6, 0.5, 0], { castShadow: false });
      b.mesh(G.octa(), "white", swirl, [0, 0, 0], 0.07, [0, 0, 0], { castShadow: false });
      b.mesh(G.cyl(9), "copper", body, [0, 0.06, 0], [0.2, 0.08, 0.2]);
      b.mesh(G.torus(0.25, 3, 12), "brass", body, [0, 0.1, 0], [0.22, 0.22, 0.22], [Math.PI / 2, 0, 0]);
      const shards = b.group("weapon", body, [0, 0.35, 0]);
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU;
        b.mesh(G.tetra(), "glass", shards, [Math.sin(a) * 0.5, Math.cos(a * 2) * 0.1, Math.cos(a) * 0.5], 0.07, [a, a, 0], { castShadow: false });
      }
    },
    animate({ joints, clock, amp, attack }) {
      joints.swirl.rotation.y = clock * 4 * Math.max(0.3, amp);
      joints.weapon.rotation.y = -clock * 1.5 * amp;
      const burst = attack ? attack.hit : 0;
      joints.weapon.scale.setScalar(1 + burst * 0.7);
    },
  },
};
