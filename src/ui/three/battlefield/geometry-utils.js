import {
  BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3,
} from "../three-module.js";

/** Small seeded generator so decoration layout is identical on every load. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const scratchColor = new Color();
const scratchEuler = new Euler();
const scratchMatrix = new Matrix4();
const scratchQuaternion = new Quaternion();
const scratchPosition = new Vector3();
const scratchScale = new Vector3();

/**
 * Bake a primitive into a flat-shaded, vertex-coloured part. `place` is
 * { position:[x,y,z], rotation:[x,y,z], scale:[x,y,z] }.
 */
export function part(geometry, color, place = {}) {
  const source = geometry.index === null ? geometry : geometry.toNonIndexed();
  if (source !== geometry) geometry.dispose();
  const [px, py, pz] = place.position ?? [0, 0, 0];
  const [rx, ry, rz] = place.rotation ?? [0, 0, 0];
  const [sx, sy, sz] = place.scale ?? [1, 1, 1];
  scratchQuaternion.setFromEuler(scratchEuler.set(rx, ry, rz));
  scratchMatrix.compose(scratchPosition.set(px, py, pz), scratchQuaternion,
    scratchScale.set(sx, sy, sz));
  source.applyMatrix4(scratchMatrix);
  source.deleteAttribute("uv");
  source.deleteAttribute("normal");
  const count = source.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  scratchColor.setHex(color);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = scratchColor.r;
    colors[index * 3 + 1] = scratchColor.g;
    colors[index * 3 + 2] = scratchColor.b;
  }
  source.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return source;
}

/** Merge baked parts into one geometry with flat normals. */
export function mergeParts(parts) {
  let total = 0;
  for (const geometry of parts) total += geometry.getAttribute("position").count;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  let offset = 0;
  for (const geometry of parts) {
    const position = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    positions.set(position.array, offset * 3);
    colors.set(color.array, offset * 3);
    offset += position.count;
    geometry.dispose();
  }
  const merged = new BufferGeometry();
  merged.setAttribute("position", new Float32BufferAttribute(positions, 3));
  merged.setAttribute("color", new Float32BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}
