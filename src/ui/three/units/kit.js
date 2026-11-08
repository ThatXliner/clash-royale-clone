// Shared building blocks for the procedural low-poly unit kit.
// Geometry and materials live in module-level caches so hundreds of live
// models reuse the same GPU resources. Nothing here allocates per instance
// except Object3D/Mesh wrappers.
import * as THREE from "three";

export const TEAM_COLORS = Object.freeze({
  south: Object.freeze({ main: "#3FA7B5", dark: "#1F6E7C", light: "#9BE0E6", glow: "#6FE6F0" }),
  north: Object.freeze({ main: "#D9573B", dark: "#8E2F1F", light: "#F7A27F", glow: "#FF8A4C" }),
});

// Team-neutral palette roles. "team*" roles resolve per side.
const NEUTRAL = Object.freeze({
  brass: { color: "#E9A83A", roughness: 0.42, metalness: 0.45 },
  copper: { color: "#C26B34", roughness: 0.5, metalness: 0.4 },
  wood: { color: "#7A5236", roughness: 0.9 },
  darkwood: { color: "#4A332A", roughness: 0.92 },
  bark: { color: "#5E4330", roughness: 0.95 },
  leaf: { color: "#5C8A46", roughness: 0.85 },
  leafLight: { color: "#8DBA4E", roughness: 0.85 },
  moss: { color: "#3F6B35", roughness: 0.9 },
  stone: { color: "#A7AEA6", roughness: 0.95 },
  stoneLight: { color: "#C9CDC0", roughness: 0.95 },
  shale: { color: "#5F6A68", roughness: 0.95 },
  bone: { color: "#F4EBD6", roughness: 0.8 },
  cloth: { color: "#E6D7B4", roughness: 0.9 },
  skin: { color: "#E7B48A", roughness: 0.85 },
  ink: { color: "#191D22", roughness: 0.8 },
  steel: { color: "#D5DEE0", roughness: 0.35, metalness: 0.55 },
  iron: { color: "#3C444B", roughness: 0.55, metalness: 0.5 },
  reed: { color: "#B7A55A", roughness: 0.9 },
  violet: { color: "#5B4B8A", roughness: 0.8 },
  violetDark: { color: "#3A2E5E", roughness: 0.85 },
  cloud: { color: "#F2F4F2", roughness: 1 },
  glass: { color: "#BFE7F2", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 },
  ash: { color: "#3A3532", roughness: 1 },
  ember: { color: "#FFC24A", roughness: 0.6, emissive: "#FFB02E", emissiveIntensity: 1.2 },
  eye: { color: "#FFF4C9", roughness: 0.5, emissive: "#FFE9A0", emissiveIntensity: 1.4 },
  white: { color: "#FFFFFF", roughness: 0.8 },
});

const TEAM_ROLES = Object.freeze({
  team: (team) => ({ color: team.main, roughness: 0.75 }),
  teamDark: (team) => ({ color: team.dark, roughness: 0.8 }),
  teamLight: (team) => ({ color: team.light, roughness: 0.75 }),
  teamGlow: (team) => ({ color: team.glow, roughness: 0.5, emissive: team.main, emissiveIntensity: 1.1 }),
  teamFlame: (team) => ({ color: team.light, roughness: 0.5, emissive: team.main, emissiveIntensity: 1.5 }),
});

export const MATERIAL_ROLES = Object.freeze([...Object.keys(NEUTRAL), ...Object.keys(TEAM_ROLES)]);

const geometryCache = new Map();
const materialCache = new Map();
const flashCache = new Map();
const overlayCache = new Map();

export function assertSide(side) {
  if (side !== "south" && side !== "north") {
    throw new RangeError(`unit side must be "south" or "north", received ${String(side)}`);
  }
}

export function material(role, side) {
  const teamRole = Object.hasOwn(TEAM_ROLES, role);
  const key = teamRole ? `${role}:${side}` : role;
  let cached = materialCache.get(key);
  if (cached) return cached;
  let spec;
  if (teamRole) spec = TEAM_ROLES[role](TEAM_COLORS[side]);
  else if (Object.hasOwn(NEUTRAL, role)) spec = NEUTRAL[role];
  else throw new RangeError(`unknown unit material role ${role}`);
  cached = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness ?? 0.8,
    metalness: spec.metalness ?? 0,
    emissive: spec.emissive ?? "#000000",
    emissiveIntensity: spec.emissiveIntensity ?? 1,
    transparent: spec.transparent ?? false,
    opacity: spec.opacity ?? 1,
    flatShading: true,
  });
  cached.name = `unit-kit:${key}`;
  cached.userData.unitKitShared = true;
  materialCache.set(key, cached);
  return cached;
}

// A brightened twin used for the hit flash; swapping materials keeps the
// shared originals untouched so other instances do not flash.
export function flashMaterial(base) {
  let cached = flashCache.get(base);
  if (cached) return cached;
  cached = base.clone();
  cached.emissive = new THREE.Color("#FFF6E8");
  cached.emissiveIntensity = 0.6;
  cached.name = `${base.name}:flash`;
  cached.userData.unitKitShared = true;
  flashCache.set(base, cached);
  return cached;
}

export function overlayMaterial(key, factory) {
  let cached = overlayCache.get(key);
  if (!cached) {
    cached = factory();
    cached.name = `unit-kit:overlay:${key}`;
    cached.userData.unitKitShared = true;
    overlayCache.set(key, cached);
  }
  return cached;
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

// Unit-sized primitives; meshes scale them. Shapes are kept faceted.
export const G = Object.freeze({
  box: () => geometry("box", () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (segments = 8, top = 1) => geometry(`cyl:${segments}:${top}`, () =>
    new THREE.CylinderGeometry(top, 1, 1, segments)),
  cone: (segments = 8) => geometry(`cone:${segments}`, () => new THREE.ConeGeometry(1, 1, segments)),
  ball: (detail = 1) => geometry(`ball:${detail}`, () => new THREE.IcosahedronGeometry(1, detail)),
  sphere: (w = 8, h = 6) => geometry(`sphere:${w}:${h}`, () => new THREE.SphereGeometry(1, w, h)),
  dome: (w = 8, h = 4) => geometry(`dome:${w}:${h}`, () =>
    new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2)),
  torus: (tube = 0.25, radial = 5, tubular = 12, arc = Math.PI * 2) =>
    geometry(`torus:${tube}:${radial}:${tubular}:${arc.toFixed(3)}`, () =>
      new THREE.TorusGeometry(1, tube, radial, tubular, arc)),
  octa: () => geometry("octa", () => new THREE.OctahedronGeometry(1, 0)),
  tetra: () => geometry("tetra", () => new THREE.TetrahedronGeometry(1, 0)),
  dodeca: () => geometry("dodeca", () => new THREE.DodecahedronGeometry(1, 0)),
  disc: (segments = 20) => geometry(`disc:${segments}`, () => {
    const g = new THREE.CircleGeometry(1, segments);
    g.rotateX(-Math.PI / 2);
    return g;
  }),
  ring: (inner = 0.78, segments = 28) => geometry(`ring:${inner}:${segments}`, () => {
    const g = new THREE.RingGeometry(inner, 1, segments);
    g.rotateX(-Math.PI / 2);
    return g;
  }),
  // A flat extruded silhouette from 2D points (x right, y up), centred on z.
  shape: (key, points, depth = 0.1, bevel = false) => geometry(`shape:${key}`, () => {
    const s = new THREE.Shape();
    points.forEach(([x, y], index) => (index === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: bevel,
      bevelSize: bevel ? depth * 0.35 : 0,
      bevelThickness: bevel ? depth * 0.35 : 0,
      bevelSegments: 1,
      curveSegments: 4,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }),
  lathe: (key, points, segments = 8) => geometry(`lathe:${key}`, () =>
    new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments)),
});

export function disposeKitCaches() {
  for (const cache of [geometryCache, materialCache, flashCache, overlayCache]) {
    for (const value of cache.values()) value.dispose();
    cache.clear();
  }
}

export function kitCacheSizes() {
  return {
    geometries: geometryCache.size,
    materials: materialCache.size,
    flashMaterials: flashCache.size,
    overlays: overlayCache.size,
  };
}

// Builder context handed to each design. Every mesh is registered so the rig
// can flash it, count triangles, and toggle shadows.
export function createBuilder(side) {
  const meshes = [];
  const joints = {};
  const builder = {
    side,
    meshes,
    joints,
    group(name, parent, position = [0, 0, 0], rotation = [0, 0, 0]) {
      const g = new THREE.Group();
      g.name = name ?? "";
      g.position.set(...position);
      g.rotation.set(...rotation);
      if (parent) parent.add(g);
      if (name && !Object.hasOwn(joints, name)) joints[name] = g;
      return g;
    },
    // mesh(geometry, role, parent, position, scale, rotation, options)
    mesh(geom, role, parent, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], options = {}) {
      const m = new THREE.Mesh(geom, typeof role === "string" ? material(role, side) : role);
      m.position.set(...position);
      if (typeof scale === "number") m.scale.setScalar(scale);
      else m.scale.set(...scale);
      m.rotation.set(...rotation);
      m.castShadow = options.castShadow ?? true;
      m.receiveShadow = options.receiveShadow ?? false;
      if (options.name) m.name = options.name;
      if (options.flash === false) m.userData.noFlash = true;
      m.userData.role = typeof role === "string" ? role : m.material.name;
      parent.add(m);
      meshes.push(m);
      return m;
    },
  };
  return builder;
}

// Bake every static mesh into one mesh per (animated joint, material role,
// shadow/flash flags). Joints keep animating; draw calls drop by ~2-3x.
// Merged geometry is cached per kind and shared by both sides.
export function mergeStaticMeshes(kind, root, joints, meshes) {
  const jointSet = new Set(Object.values(joints));
  const jointName = new Map(Object.entries(joints).map(([name, joint]) => [joint, name]));
  root.updateMatrixWorld(true);
  const buckets = new Map();
  for (const mesh of meshes) {
    let anchor = mesh.parent;
    while (anchor && !jointSet.has(anchor)) anchor = anchor.parent;
    if (!anchor) throw new Error(`unit mesh in ${kind} has no joint ancestor`);
    const key = `${jointName.get(anchor)}|${mesh.userData.role}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.userData.noFlash === true}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = { anchor, key, meshes: [] }));
    bucket.meshes.push(mesh);
  }
  const merged = [];
  const inverse = new THREE.Matrix4();
  const relative = new THREE.Matrix4();
  for (const bucket of buckets.values()) {
    const first = bucket.meshes[0];
    const geom = geometry(`merged:${kind}:${bucket.key}`, () => {
      inverse.copy(bucket.anchor.matrixWorld).invert();
      const positions = [];
      const normals = [];
      for (const mesh of bucket.meshes) {
        relative.multiplyMatrices(inverse, mesh.matrixWorld);
        const part = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone());
        part.applyMatrix4(relative);
        const p = part.attributes.position.array;
        const n = part.attributes.normal?.array;
        const flip = relative.determinant() < 0;
        for (let i = 0; i < p.length; i += 9) {
          const order = flip ? [0, 2, 1] : [0, 1, 2];
          for (const v of order) {
            positions.push(p[i + v * 3], p[i + v * 3 + 1], p[i + v * 3 + 2]);
            if (n) normals.push(n[i + v * 3], n[i + v * 3 + 1], n[i + v * 3 + 2]);
          }
        }
        part.dispose();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      if (normals.length === positions.length) g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      else g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    });
    const mesh = new THREE.Mesh(geom, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.userData.role = first.userData.role;
    if (first.userData.noFlash) mesh.userData.noFlash = true;
    bucket.anchor.add(mesh);
    merged.push(mesh);
  }
  for (const mesh of meshes) mesh.removeFromParent();
  // Drop now-empty static groups.
  const empties = [];
  root.traverse((node) => {
    if (!node.isMesh && !jointSet.has(node) && node !== root && node.children.length === 0) empties.push(node);
  });
  for (const node of empties) node.removeFromParent();
  return merged;
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
