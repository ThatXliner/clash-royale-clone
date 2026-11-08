import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from "../three-module.js";
import { mergeParts, part, seededRandom } from "./geometry-utils.js";
import { PALETTE, TEAM } from "./palette.js";

const EIGHTH = Math.PI / 8;
const QUARTER = Math.PI / 4;

// Damage bands by remaining health fraction.
export function towerCondition(tower) {
  if (tower.destroyed || tower.healthNumerator <= 0) return "destroyed";
  const fraction = tower.healthNumerator / Math.max(1, tower.healthDenominator);
  if (fraction > 0.66) return "intact";
  if (fraction > 0.33) return "damaged";
  return "critical";
}

function emblem(side, color, at) {
  const [x, y, z] = at;
  if (side === "south") {
    // Moss leaf: a pointed blade with a midrib.
    return [
      part(new OctahedronGeometry(1, 0), color, { position: [x, y, z], scale: [0.12, 0.26, 0.035] }),
      part(new BoxGeometry(0.025, 0.3, 0.05), TEAM.south.deep, { position: [x, y - 0.03, z + 0.01] }),
    ];
  }
  // Ember flame: two leaning tongues.
  return [
    part(new ConeGeometry(0.12, 0.32, 5), color, { position: [x, y, z] }),
    part(new ConeGeometry(0.07, 0.2, 5), TEAM.north.deep, {
      position: [x + 0.08, y - 0.05, z + 0.02], rotation: [0, 0, -0.35],
    }),
  ];
}

function laneTowerParts(side) {
  const team = TEAM[side];
  const base = [
    part(new CylinderGeometry(1.48, 1.56, 0.12, 8), team.deep, { position: [0, 0.06, 0], rotation: [0, EIGHTH, 0] }),
    part(new CylinderGeometry(1.34, 1.42, 0.28, 8), PALETTE.stoneDark, { position: [0, 0.22, 0], rotation: [0, EIGHTH, 0] }),
    part(new CylinderGeometry(0.92, 1.12, 2.6, 8), PALETTE.stone, { position: [0, 1.66, 0], rotation: [0, EIGHTH, 0] }),
    part(new CylinderGeometry(1.03, 1.05, 0.16, 8), PALETTE.stoneDark, { position: [0, 1.55, 0], rotation: [0, EIGHTH, 0] }),
    part(new CylinderGeometry(1.16, 1.2, 0.12, 8), PALETTE.stoneWarm, { position: [0, 0.42, 0], rotation: [0, EIGHTH, 0] }),
    // Door, lintel and brass ring.
    part(new BoxGeometry(0.48, 0.78, 0.14), PALETTE.timber, { position: [0, 0.82, 1.03], rotation: [-0.075, 0, 0] }),
    part(new BoxGeometry(0.6, 0.1, 0.16), PALETTE.stoneDark, { position: [0, 1.24, 1.0], rotation: [-0.075, 0, 0] }),
    part(new OctahedronGeometry(0.06), PALETTE.brass, { position: [0.13, 0.82, 1.11] }),
    // Arrow slits.
    part(new BoxGeometry(0.11, 0.34, 0.06), PALETTE.scorch, { position: [-0.42, 2.02, 0.88], rotation: [-0.075, -0.4, 0] }),
    part(new BoxGeometry(0.11, 0.34, 0.06), PALETTE.scorch, { position: [0.42, 2.02, 0.88], rotation: [-0.075, 0.4, 0] }),
  ];
  // Moss tucked around the footing and the band.
  for (const [angle, height, size] of [[0.4, 0.52, 0.36], [2.2, 0.5, 0.42], [3.9, 0.52, 0.34],
    [5.3, 0.48, 0.3], [1.1, 1.62, 0.26], [4.6, 1.62, 0.3], [5.9, 1.6, 0.22]]) {
    const radius = height < 1 ? 1.14 : 1.03;
    base.push(part(new IcosahedronGeometry(size, 0), angle > 3 ? PALETTE.mossDark : PALETTE.moss, {
      position: [Math.sin(angle) * radius, height, Math.cos(angle) * radius], scale: [1.1, 0.5, 0.7],
      rotation: [0, angle, 0],
    }));
  }
  const top = [
    part(new CylinderGeometry(1.2, 0.98, 0.32, 8), PALETTE.timber, { position: [0, 0.16, 0], rotation: [0, EIGHTH, 0] }),
    part(new CylinderGeometry(1.22, 1.22, 0.06, 8), PALETTE.brass, { position: [0, 0.33, 0], rotation: [0, EIGHTH, 0] }),
    // Lantern posts.
    ...[0, 1, 2, 3].map((index) => part(new BoxGeometry(0.13, 0.7, 0.13), PALETTE.timber, {
      position: [Math.sin(QUARTER + index * Math.PI / 2) * 0.74, 0.69,
        Math.cos(QUARTER + index * Math.PI / 2) * 0.74],
    })),
    part(new CylinderGeometry(1.32, 1.32, 0.09, 8), PALETTE.brass, { position: [0, 1.06, 0], rotation: [0, EIGHTH, 0] }),
    part(new ConeGeometry(1.34, 1.75, 8), team.main, { position: [0, 1.97, 0], rotation: [0, EIGHTH, 0] }),
    part(new ConeGeometry(0.44, 0.52, 8), team.light, { position: [0, 2.6, 0], rotation: [0, EIGHTH, 0] }),
    part(new CylinderGeometry(0.035, 0.035, 0.5, 5), PALETTE.brass, { position: [0, 2.98, 0] }),
    // Banner with crest, hanging from the gallery toward the camera.
    part(new BoxGeometry(0.6, 0.95, 0.05), team.main, { position: [0, -0.56, 0.95], rotation: [-0.075, 0, 0] }),
    part(new BoxGeometry(0.6, 0.14, 0.06), team.deep, { position: [0, -1.0, 0.98], rotation: [-0.075, 0, 0] }),
    part(new BoxGeometry(0.7, 0.08, 0.1), PALETTE.brass, { position: [0, -0.06, 0.95] }),
    part(new CylinderGeometry(0.2, 0.2, 0.05, 10), PALETTE.brass, {
      position: [0, -0.46, 1.0], rotation: [Math.PI / 2 - 0.075, 0, 0],
    }),
    ...emblem(side, team.light, [0, -0.46, 1.04]),
  ];
  const crenels = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = EIGHTH + index * (Math.PI / 4);
    crenels.push({ angle, radius: 1.08, y: 0.48, size: [0.34, 0.28, 0.2] });
  }
  return { base, top, crenels, glowAt: [0, 0.66, 0], glowSize: 0.28, orbAt: [0, 3.3, 0], height: 6.1,
    topAt: 2.96, bodyFront: 0.98, roofIncline: -0.616,
    roofHoles: [[0.22, 1.55, 0.88, 0.5], [-0.34, 1.86, 0.7, 0.36]],
    flames: [[-0.5, 0.42, 1.02, 1], [0.48, 0.36, 1.04, 0.8], [0.04, 0.5, 1.12, 0.6], [0.22, 1.62, 0.9, 0.55]] };
}

function kingTowerParts(side) {
  const team = TEAM[side];
  const base = [
    part(new CylinderGeometry(2.72, 2.8, 0.12, 4), team.deep, { position: [0, 0.06, 0], rotation: [0, QUARTER, 0] }),
    part(new CylinderGeometry(2.52, 2.64, 0.32, 4), PALETTE.stoneDark, { position: [0, 0.24, 0], rotation: [0, QUARTER, 0] }),
    part(new CylinderGeometry(1.9, 2.15, 2.7, 4), PALETTE.stone, { position: [0, 1.73, 0], rotation: [0, QUARTER, 0] }),
    part(new CylinderGeometry(2.06, 2.08, 0.18, 4), PALETTE.stoneDark, { position: [0, 1.62, 0], rotation: [0, QUARTER, 0] }),
    // Gate with a timber arch.
    part(new BoxGeometry(0.86, 1.0, 0.16), PALETTE.timber, { position: [0, 0.9, 1.49], rotation: [-0.065, 0, 0] }),
    part(new CylinderGeometry(0.43, 0.43, 0.16, 8, 1, false, -Math.PI / 2, Math.PI), PALETTE.timber, {
      position: [0, 1.4, 1.46], rotation: [Math.PI / 2 - 0.065, 0, 0],
    }),
    part(new BoxGeometry(1.06, 0.12, 0.2), PALETTE.stoneDark, { position: [0, 0.42, 1.55] }),
    part(new OctahedronGeometry(0.07), PALETTE.brass, { position: [-0.2, 0.95, 1.59] }),
    part(new OctahedronGeometry(0.07), PALETTE.brass, { position: [0.2, 0.95, 1.59] }),
    // Crest above the gate.
    part(new CylinderGeometry(0.38, 0.38, 0.07, 12), PALETTE.brass, {
      position: [0, 2.3, 1.42], rotation: [Math.PI / 2 - 0.065, 0, 0],
    }),
    part(new CylinderGeometry(0.3, 0.3, 0.08, 12), team.deep, {
      position: [0, 2.3, 1.45], rotation: [Math.PI / 2 - 0.065, 0, 0],
    }),
    ...emblem(side, team.light, [0, 2.3, 1.51]),
  ];
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    base.push(part(new BoxGeometry(0.46, 2.7, 0.46), PALETTE.stoneWarm, { position: [x, 1.73, z] }));
    base.push(part(new BoxGeometry(0.56, 0.16, 0.56), PALETTE.stoneDark, { position: [x, 3.1, z] }));
  }
  // Banners hanging on the keep face either side of the gate.
  for (const x of [-0.96, 0.96]) {
    base.push(part(new BoxGeometry(0.5, 1.3, 0.05), team.main, { position: [x, 1.95, 1.47], rotation: [-0.065, 0, 0] }));
    base.push(part(new BoxGeometry(0.5, 0.14, 0.06), team.deep, { position: [x, 1.36, 1.51], rotation: [-0.065, 0, 0] }));
    base.push(part(new BoxGeometry(0.58, 0.07, 0.1), PALETTE.brass, { position: [x, 2.62, 1.44] }));
  }
  for (const [angle, size] of [[0.6, 0.5], [2.4, 0.42], [3.6, 0.46], [5.2, 0.4]]) {
    base.push(part(new IcosahedronGeometry(size, 0), angle > 3 ? PALETTE.mossDark : PALETTE.moss, {
      position: [Math.sin(angle) * 1.7, 0.5, Math.cos(angle) * 1.7], scale: [1.2, 0.5, 0.8], rotation: [0, angle, 0],
    }));
  }
  const top = [
    part(new CylinderGeometry(2.05, 1.95, 0.24, 4), PALETTE.stoneDark, { position: [0, 0.12, 0], rotation: [0, QUARTER, 0] }),
    part(new CylinderGeometry(1.62, 1.72, 1.0, 4), PALETTE.timber, { position: [0, 0.74, 0], rotation: [0, QUARTER, 0] }),
    part(new CylinderGeometry(2.22, 2.22, 0.12, 4), PALETTE.brass, { position: [0, 1.3, 0], rotation: [0, QUARTER, 0] }),
    part(new ConeGeometry(2.26, 2.0, 4), team.main, { position: [0, 2.36, 0], rotation: [0, QUARTER, 0] }),
    part(new ConeGeometry(0.72, 0.62, 4), team.light, { position: [0, 3.06, 0], rotation: [0, QUARTER, 0] }),
    part(new CylinderGeometry(0.05, 0.05, 0.9, 5), PALETTE.brass, { position: [0, 3.7, 0] }),
    // Dormer on the roof facing the camera.
    part(new BoxGeometry(0.6, 0.52, 0.5), PALETTE.timber, { position: [0, 1.72, 0.92] }),
    part(new ConeGeometry(0.5, 0.44, 4), team.deep, { position: [0, 2.2, 0.92], rotation: [0, QUARTER, 0] }),
  ];
  const crenels = [];
  for (const [x, z] of [[-0.7, 1.42], [0.7, 1.42], [-0.7, -1.42], [0.7, -1.42], [1.42, -0.7], [1.42, 0.7],
    [-1.42, -0.7], [-1.42, 0.7]]) {
    crenels.push({ x, z, y: 0.38, size: [0.42, 0.3, 0.3] });
  }
  return { base, top, crenels, glowAt: null, orbAt: [0, 4.22, 0], height: 6.7,
    topAt: 3.08, bodyFront: 1.44, roofIncline: -0.675,
    roofHoles: [[0.62, 2.0, 1.09, 0.62], [-0.72, 1.74, 1.29, 0.5]],
    flames: [[-0.95, 0.4, 1.5, 1.1], [0.85, 0.42, 1.5, 0.9], [0.62, 2.12, 1.1, 0.7], [-0.4, 0.45, 1.52, 0.6]] };
}

function crenelGeometry(crenels, indices) {
  return mergeParts(indices.map((index) => {
    const crenel = crenels[index];
    const x = crenel.x ?? Math.sin(crenel.angle) * crenel.radius;
    const z = crenel.z ?? Math.cos(crenel.angle) * crenel.radius;
    return part(new BoxGeometry(...crenel.size), PALETTE.stone, {
      position: [x, crenel.y, z], rotation: [0, crenel.angle ?? (Math.abs(x) > Math.abs(z) ? Math.PI / 2 : 0), 0],
    });
  }));
}

function roofHoleGeometry(spec, count) {
  const parts = [];
  spec.roofHoles.slice(0, count).forEach(([x, y, z, size], index) => {
    parts.push(part(new BoxGeometry(size, size * 0.8, 0.07), PALETTE.scorch, {
      position: [x, y, z], rotation: [spec.roofIncline, 0, index * 0.5 - 0.2],
    }));
    // Splintered rafters across the hole.
    parts.push(part(new BoxGeometry(size * 1.1, 0.06, 0.08), PALETTE.timber, {
      position: [x, y + 0.02, z + 0.03], rotation: [spec.roofIncline, 0, 0.5 - index],
    }));
  });
  return mergeParts(parts);
}

function crackGeometry(front, height, random, count) {
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * front * 1.1;
    const y = 0.6 + random() * (height - 0.9);
    const length = 0.3 + random() * 0.35;
    const angle = (random() - 0.5) * 2.2;
    parts.push(part(new BoxGeometry(0.05, length, 0.05), PALETTE.scorch, {
      position: [x, y, front + 0.02], rotation: [-0.08, 0, angle],
    }));
    parts.push(part(new BoxGeometry(0.04, length * 0.55, 0.05), PALETTE.scorch, {
      position: [x + Math.sin(angle + 0.9) * length * 0.3, y + 0.12, front + 0.02], rotation: [-0.08, 0, angle + 0.9],
    }));
  }
  return mergeParts(parts);
}

function rubbleGeometry(role, side, random) {
  const team = TEAM[side];
  const radius = role === "central" ? 1.8 : 1.15;
  const parts = [
    part(new CylinderGeometry(radius * 1.3, radius * 1.36, 0.03, 12), PALETTE.ash, { position: [0, 0.025, 0] }),
    part(new CylinderGeometry(radius * 0.95, radius, 0.03, 10), PALETTE.scorch, { position: [0, 0.04, 0] }),
  ];
  // A broken ring of wall stubs.
  const stubs = role === "central" ? 12 : 9;
  for (let index = 0; index < stubs; index += 1) {
    const angle = (index / stubs) * Math.PI * 2;
    const height = 0.25 + random() * 0.75;
    parts.push(part(new BoxGeometry(0.5, height, 0.42), random() > 0.3 ? PALETTE.stoneDark : PALETTE.stone, {
      position: [Math.sin(angle) * radius, height / 2 + 0.05, Math.cos(angle) * radius],
      rotation: [(random() - 0.5) * 0.3, angle, (random() - 0.5) * 0.4],
    }));
  }
  for (let index = 0; index < (role === "central" ? 14 : 9); index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = random() * radius * 1.3;
    parts.push(part(new DodecahedronGeometry(0.16 + random() * 0.22, 0), random() > 0.5 ? PALETTE.rubble : PALETTE.stoneDark, {
      position: [Math.sin(angle) * distance, 0.12, Math.cos(angle) * distance],
      rotation: [random(), random(), random()],
    }));
  }
  // Fallen roof, still in team colours so the side stays readable.
  const roofSize = role === "central" ? 1.5 : 1.0;
  parts.push(part(new ConeGeometry(roofSize, roofSize * 0.95, role === "central" ? 4 : 8), team.deep, {
    position: [radius * 0.55, roofSize * 0.55, radius * 0.25], rotation: [0.3, 0.6, 1.9],
  }));
  parts.push(part(new BoxGeometry(0.5, 0.8, 0.05), team.main, {
    position: [-radius * 0.5, 0.12, radius * 0.75], rotation: [-Math.PI / 2 + 0.15, 0.4, 0],
  }));
  parts.push(part(new CylinderGeometry(0.06, 0.06, 1.3, 5), PALETTE.timber, {
    position: [-radius * 0.2, 0.18, radius * 0.6], rotation: [0.2, 0, Math.PI / 2 - 0.3],
  }));
  return mergeParts(parts);
}

function emberGeometry(height, random) {
  const parts = [];
  for (let index = 0; index < 7; index += 1) {
    const angle = random() * Math.PI * 2;
    parts.push(part(new OctahedronGeometry(0.06 + random() * 0.05, 0), 0xffffff, {
      position: [Math.sin(angle) * 0.9, 0.5 + random() * (height - 1), Math.cos(angle) * 0.9 + 0.2],
    }));
  }
  return mergeParts(parts);
}

const HEALTH_CANVAS = { width: 256, height: 80 };

function drawHealth(context, tower, side) {
  const { width, height } = HEALTH_CANVAS;
  const team = TEAM[side];
  context.clearRect(0, 0, width, height);
  const radius = 18;
  const rounded = (x, y, w, h, r) => {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  };
  rounded(3, 4, width - 6, height - 8, radius);
  context.fillStyle = "rgba(14, 20, 24, 0.9)";
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = "#e9a83a";
  context.stroke();
  const fraction = Math.max(0, Math.min(1, tower.healthNumerator / Math.max(1, tower.healthDenominator)));
  if (fraction > 0) {
    const inner = width - 22;
    context.save();
    rounded(11, 12, inner, height - 24, 12);
    context.clip();
    const gradient = context.createLinearGradient(0, 12, 0, height - 12);
    gradient.addColorStop(0, team.bar);
    gradient.addColorStop(1, team.barDeep);
    context.fillStyle = gradient;
    context.fillRect(11, 12, inner * fraction, height - 24);
    context.fillStyle = "rgba(255,255,255,0.3)";
    context.fillRect(11, 12, inner * fraction, 9);
    context.restore();
  }
  context.font = "900 44px ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 9;
  context.strokeStyle = "rgba(10, 14, 18, 0.95)";
  const label = String(tower.healthNumerator);
  context.strokeText(label, width / 2, height / 2 + 2);
  context.fillStyle = "#ffffff";
  context.fillText(label, width / 2, height / 2 + 2);
}

/** Build the six crown towers and keep them in step with combat views. */
export function createTowerSet({ document, toWorld, isReducedMotion }) {
  const group = new Group();
  const disposables = [];
  const keep = (value) => { disposables.push(value); return value; };
  const sharedMaterial = keep(new MeshStandardMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0.05, flatShading: true,
  }));
  const glowMaterials = {};
  const smokeMaterial = new MeshStandardMaterial({
    color: 0xd9d3c9, roughness: 1, transparent: true, opacity: 0.5, flatShading: true, depthWrite: false,
  });
  const emberMaterial = keep(new MeshStandardMaterial({
    color: 0xff8a3a, emissive: 0xff6a1a, emissiveIntensity: 2.2, flatShading: true,
  }));
  const flameMaterials = [
    keep(new MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 1.8, flatShading: true })),
    keep(new MeshStandardMaterial({ color: 0xffd25a, emissive: 0xffb020, emissiveIntensity: 1.6, flatShading: true })),
  ];
  const flameGeometry = keep(new ConeGeometry(0.22, 0.75, 5));
  const smokeGeometry = keep(new IcosahedronGeometry(0.34, 1));
  for (const side of ["south", "north"]) {
    glowMaterials[side] = keep(new MeshStandardMaterial({
      color: TEAM[side].light, emissive: TEAM[side].glow, emissiveIntensity: 1.6, flatShading: true,
    }));
  }
  const geometryCache = new Map();
  const geometries = (role, side) => {
    const key = `${role}:${side}`;
    if (geometryCache.has(key)) return geometryCache.get(key);
    const random = seededRandom(role === "central" ? 71 : 37);
    const spec = role === "central" ? kingTowerParts(side) : laneTowerParts(side);
    const allCrenels = spec.crenels.map((_, index) => index);
    const result = {
      spec,
      base: keep(mergeParts(spec.base)),
      top: keep(mergeParts(spec.top)),
      crenelsIntact: keep(crenelGeometry(spec.crenels, allCrenels)),
      crenelsBroken: keep(crenelGeometry(spec.crenels, allCrenels.filter((index) => index % 3 !== 1))),
      crenelsRuined: keep(crenelGeometry(spec.crenels, allCrenels.filter((index) => index % 2 === 0))),
      cracksLight: keep(crackGeometry(spec.bodyFront, spec.topAt, random, 3)),
      cracksHeavy: keep(crackGeometry(spec.bodyFront, spec.topAt, random, 7)),
      roofHoleLight: keep(roofHoleGeometry(spec, 1)),
      roofHoleHeavy: keep(roofHoleGeometry(spec, 2)),
      rubble: keep(rubbleGeometry(role, side, random)),
      embers: keep(emberGeometry(spec.topAt, random)),
      glow: keep(new IcosahedronGeometry(spec.glowSize ?? 0.3, 0)),
      orb: keep(new OctahedronGeometry(role === "central" ? 0.22 : 0.16, 0)),
      windows: role === "central" ? keep(mergeParts([-0.62, 0, 0.62].map((x) =>
        part(new BoxGeometry(0.24, 0.36, 0.05), 0xffffff, { position: [x, 0.8, 1.2] })))) : null,
    };
    geometryCache.set(key, result);
    return result;
  };

  const towers = new Map();
  const createTower = (tower) => {
    const parts = geometries(tower.role, tower.side);
    const root = new Group();
    const model = new Group();
    root.add(model);
    const material = keep(sharedMaterial.clone());
    const mesh = (geometry, meshMaterial = material) => {
      const value = new Mesh(geometry, meshMaterial);
      value.castShadow = true;
      value.receiveShadow = true;
      return value;
    };
    const intact = new Group();
    const base = mesh(parts.base);
    const top = new Group();
    top.position.y = parts.spec.topAt;
    top.add(mesh(parts.top));
    const crenels = {
      intact: mesh(parts.crenelsIntact), damaged: mesh(parts.crenelsBroken), critical: mesh(parts.crenelsRuined),
    };
    for (const crenel of Object.values(crenels)) top.add(crenel);
    if (parts.spec.glowAt) {
      const glow = new Mesh(parts.glow, glowMaterials[tower.side]);
      glow.position.set(...parts.spec.glowAt);
      top.add(glow);
    }
    if (parts.windows) {
      const windows = new Mesh(parts.windows, keep(new MeshStandardMaterial({
        color: 0xffe2a0, emissive: PALETTE.lanternGlow, emissiveIntensity: 1.4,
      })));
      top.add(windows);
    }
    const orb = new Mesh(parts.orb, glowMaterials[tower.side]);
    orb.position.set(...parts.spec.orbAt);
    top.add(orb);
    const cracksLight = mesh(parts.cracksLight);
    const cracksHeavy = mesh(parts.cracksHeavy);
    const embers = new Mesh(parts.embers, emberMaterial);
    // Flames licking out of the broken gallery when a tower is nearly lost.
    const flames = new Group();
    parts.spec.flames.forEach(([x, y, z, scale], index) => {
      const flame = new Mesh(flameGeometry, flameMaterials[index % 2]);
      flame.position.set(x, y, z);
      flame.userData.scale = scale;
      flame.scale.setScalar(scale);
      flames.add(flame);
    });
    top.add(flames);
    const roofHoleLight = mesh(parts.roofHoleLight);
    const roofHoleHeavy = mesh(parts.roofHoleHeavy);
    top.add(roofHoleLight, roofHoleHeavy);
    intact.add(base, top, cracksLight, cracksHeavy, embers);
    const rubble = mesh(parts.rubble);
    model.add(intact, rubble);

    const smoke = [];
    for (let index = 0; index < 5; index += 1) {
      const puff = new Mesh(smokeGeometry, keep(smokeMaterial.clone()));
      puff.userData.phase = index / 5;
      smoke.push(puff);
      root.add(puff);
    }

    const canvas = document.createElement("canvas");
    canvas.width = HEALTH_CANVAS.width;
    canvas.height = HEALTH_CANVAS.height;
    const context = canvas.getContext("2d");
    const texture = keep(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    const label = new Sprite(keep(new SpriteMaterial({
      map: texture, depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
    })));
    const labelWidth = tower.role === "central" ? 3.0 : 2.5;
    label.scale.set(labelWidth, labelWidth * HEALTH_CANVAS.height / HEALTH_CANVAS.width, 1);
    // Bars sit on the river side of each tower: above the player's towers,
    // in front of the opponent's, so the HUD rails never cover them.
    if (tower.side === "south") label.position.set(0, parts.spec.height + 0.55, 0);
    else label.position.set(0, 0.2, tower.role === "central" ? 2.55 : 1.95);
    label.renderOrder = 10;
    root.add(label);
    group.add(root);
    return {
      condition: null, context, crenels, cracksHeavy, cracksLight, embers, flames, flashUntil: 0, health: null,
      height: parts.spec.height, intact, label, material, model, rubble, side: tower.side, smoke, texture, top,
      labelKey: "", root, roofHoleHeavy, roofHoleLight, topAt: parts.spec.topAt,
    };
  };

  const applyCondition = (entry, condition) => {
    entry.condition = condition;
    const destroyed = condition === "destroyed";
    entry.intact.visible = !destroyed;
    entry.rubble.visible = destroyed;
    entry.label.visible = !destroyed;
    entry.crenels.intact.visible = condition === "intact";
    entry.crenels.damaged.visible = condition === "damaged";
    entry.crenels.critical.visible = condition === "critical";
    entry.cracksLight.visible = condition === "damaged";
    entry.cracksHeavy.visible = condition === "critical";
    entry.embers.visible = condition === "critical";
    entry.flames.visible = condition === "critical";
    entry.roofHoleLight.visible = condition === "damaged";
    entry.roofHoleHeavy.visible = condition === "critical";
    // Soot darkens the stonework as the tower takes damage.
    const soot = condition === "critical" ? 0.74 : condition === "damaged" ? 0.88 : 1;
    entry.material.color.setRGB(soot, soot * 0.98, soot * 0.96);
    const tilt = condition === "critical" ? 0.13 : condition === "damaged" ? 0.05 : 0;
    entry.top.rotation.set(tilt * 0.4, 0, tilt * (entry.side === "south" ? 1 : -1));
    entry.top.position.y = entry.top.position.y - (entry.topDrop ?? 0);
    entry.topDrop = condition === "critical" ? 0.12 : 0;
    entry.top.position.y += entry.topDrop;
    for (const puff of entry.smoke) puff.visible = condition === "damaged" || condition === "critical";
  };

  let shadowsDirty = true;
  let animating = false;
  const update = (towersView, now) => {
    const seen = new Set();
    for (const tower of towersView) {
      seen.add(tower.key);
      let entry = towers.get(tower.key);
      if (!entry) {
        entry = createTower(tower);
        towers.set(tower.key, entry);
        shadowsDirty = true;
      }
      const [x, z] = toWorld(tower.x / 1000, tower.y / 1000);
      entry.root.position.set(x, 0, z);
      const condition = towerCondition(tower);
      if (condition !== entry.condition) {
        applyCondition(entry, condition);
        shadowsDirty = true;
      }
      if (entry.health !== null && tower.healthNumerator < entry.health && now - entry.flashUntil > 400) {
        entry.flashUntil = now + 140;
      }
      entry.health = tower.healthNumerator;
      const labelKey = `${tower.healthNumerator}/${tower.healthDenominator}`;
      if (labelKey !== entry.labelKey) {
        entry.labelKey = labelKey;
        drawHealth(entry.context, tower, tower.side);
        entry.texture.needsUpdate = true;
      }
    }
    for (const [key, entry] of towers) {
      if (!seen.has(key)) {
        group.remove(entry.root);
        towers.delete(key);
        shadowsDirty = true;
      }
    }
  };

  const flashColor = new Color(1, 0.55, 0.3);
  const black = new Color(0, 0, 0);
  /** Advance wall-clock-only presentation; returns true while still animating. */
  const animate = (now) => {
    animating = false;
    const reducedMotion = isReducedMotion();
    for (const entry of towers.values()) {
      const flash = Math.max(0, (entry.flashUntil - now) / 140);
      if (flash > 0) {
        animating = true;
        entry.material.emissive.copy(black).lerp(flashColor, flash * 0.045);
        entry.model.position.x = reducedMotion ? 0 : Math.sin(now * 0.09) * 0.05 * flash;
      } else if (entry.material.emissive.r !== 0) {
        entry.material.emissive.copy(black);
        entry.model.position.x = 0;
        animating = true;
      }
      const heavy = entry.condition === "critical";
      for (const puff of entry.smoke) {
        if (!puff.visible) continue;
        const phase = puff.userData.phase;
        const cycle = reducedMotion ? phase : (now / (heavy ? 2200 : 3200) + phase) % 1;
        const rise = cycle * (heavy ? 3.4 : 2.6);
        // Drift east, away from the health bar, and fade as the puff grows.
        puff.position.set(0.45 + rise * 0.55 + Math.sin(phase * 9) * 0.2, entry.topAt + 0.5 + rise,
          0.2 + Math.cos(phase * 7) * 0.25);
        puff.scale.setScalar(0.55 + cycle * (heavy ? 1.5 : 1.1));
        puff.material.opacity = (heavy ? 0.7 : 0.58) * Math.min(1, cycle * 5) * (1 - cycle * 0.8);
        puff.material.color.setHex(heavy ? 0x6f6964 : 0xb9b2a8);
      }
      if (entry.flames.visible) {
        entry.flames.children.forEach((flame, index) => {
          const flicker = reducedMotion ? 1 : 0.8 + 0.25 * Math.sin(now * 0.017 + index * 1.9) +
            0.12 * Math.sin(now * 0.041 + index);
          flame.scale.set(flame.userData.scale, flame.userData.scale * flicker, flame.userData.scale);
        });
      }
    }
    return animating;
  };

  return {
    group,
    update,
    animate,
    hasSmoke() {
      for (const entry of towers.values()) {
        if (entry.condition === "damaged" || entry.condition === "critical") return true;
      }
      return false;
    },
    consumeShadowsDirty() {
      const value = shadowsDirty;
      shadowsDirty = false;
      return value;
    },
    dispose() {
      for (const value of disposables) value.dispose();
      smokeMaterial.dispose();
      towers.clear();
    },
  };
}
