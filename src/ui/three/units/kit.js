// Shared building blocks for the procedural low-poly unit kit.
//
// Designs are authored as many small primitive parts hung off named joints.
// At build time every part is baked into vertex-coloured, rigidly skinned
// geometry (one bone per joint), so a whole model renders as one lit mesh
// (plus an optional unlit glow mesh) however many parts it has. Baked
// geometry is cached per kind + side; materials are global. A model owns only
// its Object3D wrappers and its Skeleton.
import {
  Bone,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  Shape,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector2,
} from "../three-module.js";

// Team colours match the battlefield palette (src/ui/three/battlefield/palette.js).
export const TEAM_COLORS = Object.freeze({
  south: Object.freeze({ main: "#3FA7B5", dark: "#23707E", light: "#9BE3E6", glow: "#7FF3FF" }),
  north: Object.freeze({ main: "#D9573B", dark: "#96331F", light: "#FFB08F", glow: "#FFA04A" }),
});

// Material classes: "lit" (flat-shaded standard), "glow" (unlit) and "glass"
// (translucent standard). Roles map to a colour and a class.
const NEUTRAL = Object.freeze({
  brass: ["#E9A83A", "lit"],
  copper: ["#C26B34", "lit"],
  wood: ["#7A5236", "lit"],
  darkwood: ["#4A332A", "lit"],
  bark: ["#5E4330", "lit"],
  leaf: ["#5C8A46", "lit"],
  leafLight: ["#8DBA4E", "lit"],
  moss: ["#3F6B35", "lit"],
  stone: ["#A7AEA6", "lit"],
  stoneLight: ["#C9CDC0", "lit"],
  shale: ["#5F6A68", "lit"],
  bone: ["#F4EBD6", "lit"],
  cloth: ["#E6D7B4", "lit"],
  skin: ["#E7B48A", "lit"],
  ink: ["#191D22", "lit"],
  steel: ["#D5DEE0", "lit"],
  iron: ["#3C444B", "lit"],
  reed: ["#C9B25A", "lit"],
  violet: ["#5B4B8A", "lit"],
  violetDark: ["#3A2E5E", "lit"],
  cloud: ["#F2F4F2", "lit"],
  ash: ["#3A3532", "lit"],
  white: ["#FFFFFF", "lit"],
  glass: ["#BFE7F2", "glass"],
  ember: ["#FFC24A", "glow"],
  eye: ["#FFF4C9", "glow"],
  sun: ["#FFD36A", "glow"],
});

const TEAM_ROLES = Object.freeze({
  team: (t) => [t.main, "lit"],
  teamDark: (t) => [t.dark, "lit"],
  teamLight: (t) => [t.light, "lit"],
  teamGlow: (t) => [t.glow, "glow"],
  teamFlame: (t) => [t.main, "glow"],
});

export const MATERIAL_ROLES = Object.freeze([...Object.keys(NEUTRAL), ...Object.keys(TEAM_ROLES)]);

export function roleSpec(role, side) {
  if (Object.hasOwn(TEAM_ROLES, role)) return TEAM_ROLES[role](TEAM_COLORS[side]);
  if (Object.hasOwn(NEUTRAL, role)) return NEUTRAL[role];
  throw new RangeError(`unknown unit material role ${role}`);
}

const geometryCache = new Map();
const materialCache = new Map();

export function assertSide(side) {
  if (side !== "south" && side !== "north") {
    throw new RangeError(`unit side must be "south" or "north", received ${String(side)}`);
  }
}

function cachedMaterial(key, factory) {
  let cached = materialCache.get(key);
  if (!cached) {
    cached = factory();
    cached.name = `unit-kit:${key}`;
    cached.userData.unitKitShared = true;
    materialCache.set(key, cached);
  }
  return cached;
}

const CLASS_FACTORIES = Object.freeze({
  lit: () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08, flatShading: true }),
  glow: () => new MeshBasicMaterial({ vertexColors: true }),
  glass: () => new MeshStandardMaterial({
    vertexColors: true, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.5, depthWrite: false,
  }),
});

export function classMaterial(cls) {
  return cachedMaterial(`class:${cls}`, CLASS_FACTORIES[cls]);
}

// Hit flash: brighten toward the model's own side colour so team identity
// survives the flash. Unlit glow parts keep their material.
export function flashMaterial(base, side) {
  if (!base.isMeshStandardMaterial) return base;
  return cachedMaterial(`${base.name}:flash:${side}`, () => {
    const flash = base.clone();
    flash.emissive = new Color(TEAM_COLORS[side].main);
    flash.emissiveIntensity = 0.3;
    return flash;
  });
}

export function overlayMaterial(key, factory) {
  return cachedMaterial(`overlay:${key}`, factory);
}

export function geometry(key, factory) {
  let cached = geometryCache.get(key);
  if (!cached) {
    cached = factory();
    cached.name = `unit-kit:${key}`;
    cached.userData.unitKitShared = true;
    geometryCache.set(key, cached);
  }
  return cached;
}

// Unit-sized primitives; parts scale them. Shapes stay faceted.
export const G = Object.freeze({
  box: () => geometry("box", () => new BoxGeometry(1, 1, 1)),
  cyl: (segments = 8, top = 1) => geometry(`cyl:${segments}:${top}`, () =>
    new CylinderGeometry(top, 1, 1, segments)),
  cone: (segments = 8) => geometry(`cone:${segments}`, () => new ConeGeometry(1, 1, segments)),
  ball: (detail = 1) => geometry(`ball:${detail}`, () => new IcosahedronGeometry(1, detail)),
  sphere: (w = 8, h = 6) => geometry(`sphere:${w}:${h}`, () => new SphereGeometry(1, w, h)),
  dome: (w = 8, h = 4) => geometry(`dome:${w}:${h}`, () =>
    new SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2)),
  torus: (tube = 0.25, radial = 5, tubular = 12, arc = Math.PI * 2) =>
    geometry(`torus:${tube}:${radial}:${tubular}:${arc.toFixed(3)}`, () =>
      new TorusGeometry(1, tube, radial, tubular, arc)),
  octa: () => geometry("octa", () => new OctahedronGeometry(1, 0)),
  tetra: () => geometry("tetra", () => new TetrahedronGeometry(1, 0)),
  dodeca: () => geometry("dodeca", () => new DodecahedronGeometry(1, 0)),
  disc: (segments = 20) => geometry(`disc:${segments}`, () => {
    const g = new CircleGeometry(1, segments);
    g.rotateX(-Math.PI / 2);
    return g;
  }),
  ring: (inner = 0.78, segments = 28) => geometry(`ring:${inner}:${segments}`, () => {
    const g = new RingGeometry(inner, 1, segments);
    g.rotateX(-Math.PI / 2);
    return g;
  }),
  // A flat extruded silhouette from 2D points (x right, y up), centred on z.
  shape: (key, points, depth = 0.1) => geometry(`shape:${key}`, () => {
    const s = new Shape();
    points.forEach(([x, y], index) => (index === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    return g;
  }),
  lathe: (key, points, segments = 8) => geometry(`lathe:${key}`, () =>
    new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), segments)),
});

export function disposeKitCaches() {
  for (const cache of [geometryCache, materialCache]) {
    for (const value of cache.values()) value.dispose();
    cache.clear();
  }
}

export function kitCacheSizes() {
  return { geometries: geometryCache.size, materials: materialCache.size };
}

// Placeholder for authored parts; parts are baked away before rendering.
const AUTHORING = new MeshBasicMaterial();

// Builder context handed to each design. Named groups become bones (animated
// joints); unnamed groups are static and baked into their nearest joint.
export function createBuilder(side) {
  const parts = [];
  const joints = {};
  const builder = {
    side,
    parts,
    joints,
    group(name, parent, position = [0, 0, 0], rotation = [0, 0, 0]) {
      const named = typeof name === "string" && name.length > 0 && !Object.hasOwn(joints, name);
      const g = named ? new Bone() : new Group();
      g.name = name ?? "";
      g.position.set(...position);
      g.rotation.set(...rotation);
      if (parent) parent.add(g);
      if (named) joints[name] = g;
      return g;
    },
    // mesh(geometry, role, parent, position, scale, rotation, options)
    mesh(geom, role, parent, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], options = {}) {
      roleSpec(role, side);
      const m = new Mesh(geom, AUTHORING);
      m.position.set(...position);
      if (typeof scale === "number") m.scale.setScalar(scale);
      else m.scale.set(...scale);
      m.rotation.set(...rotation);
      m.userData.role = role;
      m.userData.castShadow = options.castShadow ?? true;
      parent.add(m);
      parts.push(m);
      return m;
    },
  };
  return builder;
}

// Bake authored parts into at most one skinned mesh per bucket:
//   lit (casts shadow), lit-noshadow (only if a design opts parts out),
//   glow (unlit, never casts), glass (translucent, never casts).
// `host` is where the skinned meshes live (the model's mover group).
export function bakeModel({ kind, side, host, root, joints, parts, castShadow }) {
  const bones = Object.values(joints);
  const boneIndex = new Map(bones.map((bone, index) => [bone, index]));
  const buckets = new Map();
  for (const part of parts) {
    let anchor = part.parent;
    while (anchor && !boneIndex.has(anchor)) anchor = anchor.parent;
    if (!anchor) throw new Error(`unit part in ${kind} has no joint ancestor`);
    const [color, cls] = roleSpec(part.userData.role, side);
    const bucket = cls === "lit" && (!castShadow || !part.userData.castShadow) ? "lit-noshadow" : cls;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push({ part, anchor, color });
  }
  const meshes = [];
  root.updateMatrixWorld(true);
  const toHost = new Matrix4().copy(host.matrixWorld).invert();
  const relative = new Matrix4();
  const colour = new Color();
  for (const bucketName of ["lit", "lit-noshadow", "glass", "glow"]) {
    const entries = buckets.get(bucketName);
    if (!entries) continue;
    const geom = geometry(`baked:${kind}:${side}:${bucketName}`, () => {
      const positions = [];
      const normals = [];
      const colors = [];
      const skinIndex = [];
      const skinWeight = [];
      for (const { part, anchor, color } of entries) {
        relative.multiplyMatrices(toHost, part.matrixWorld);
        const piece = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        piece.applyMatrix4(relative);
        const p = piece.attributes.position.array;
        const n = piece.attributes.normal?.array;
        const flip = relative.determinant() < 0;
        colour.set(color);
        const bi = boneIndex.get(anchor);
        for (let i = 0; i < p.length; i += 9) {
          for (const v of flip ? [0, 2, 1] : [0, 1, 2]) {
            positions.push(p[i + v * 3], p[i + v * 3 + 1], p[i + v * 3 + 2]);
            if (n) normals.push(n[i + v * 3], n[i + v * 3 + 1], n[i + v * 3 + 2]);
            colors.push(colour.r, colour.g, colour.b);
            skinIndex.push(bi, 0, 0, 0);
            skinWeight.push(1, 0, 0, 0);
          }
        }
        piece.dispose();
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(positions, 3));
      if (normals.length === positions.length) g.setAttribute("normal", new Float32BufferAttribute(normals, 3));
      else g.computeVertexNormals();
      g.setAttribute("color", new Float32BufferAttribute(colors, 3));
      g.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndex, 4));
      g.setAttribute("skinWeight", new Float32BufferAttribute(skinWeight, 4));
      g.computeBoundingSphere();
      return g;
    });
    const cls = bucketName === "lit-noshadow" ? "lit" : bucketName;
    const mesh = new SkinnedMesh(geom, classMaterial(cls));
    mesh.name = `unit-${bucketName}`;
    mesh.castShadow = bucketName === "lit";
    mesh.frustumCulled = false;
    if (bucketName === "glass") mesh.renderOrder = 2;
    host.add(mesh);
    meshes.push(mesh);
  }
  for (const part of parts) part.removeFromParent();
  // Drop static groups left empty by baking.
  const empties = [];
  root.traverse((node) => {
    if (node.isGroup && node !== root && !node.isBone && node.children.length === 0) {
      empties.push(node);
    }
  });
  for (const node of empties) node.removeFromParent();
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  for (const mesh of meshes) mesh.bind(skeleton);
  return { meshes, skeleton };
}

export function triangleCount(object) {
  let total = 0;
  object.traverse((node) => {
    if (!node.isMesh || !node.visible) return;
    const g = node.geometry;
    total += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(total);
}

// Draw calls one model costs in a lit, shadowed scene (colour pass + shadow pass).
export function drawCallCount(object) {
  let total = 0;
  object.traverse((node) => {
    if (!node.isMesh || !node.visible) return;
    total += node.castShadow ? 2 : 1;
  });
  return total;
}
