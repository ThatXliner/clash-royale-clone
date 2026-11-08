import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  BufferGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  SRGBColorSpace,
} from "../three-module.js";
import { paintBoardTexture } from "./board-texture.js";
import { mergeParts, part, seededRandom } from "./geometry-utils.js";
import { PALETTE } from "./palette.js";

// Board space is in tiles: tx 0..18 west→east, ty 0..32 south→north.
export const BOARD_COLUMNS = 18;
export const BOARD_ROWS = 32;
const RIVER_CENTER = 16;
const LANES = [3.5, 14.5];
const BRIDGES = [{ x0: 2.5, x1: 4.5 }, { x0: 13.5, x1: 15.5 }];
const TERRAIN_X = [-5, 23];
const TERRAIN_Y = [-9, 41];
const STEP = 1 / 3;

function hash2(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43_758.5453;
  return value - Math.floor(value);
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function outsideDistance(tx, ty) {
  const dx = Math.max(0 - tx, tx - BOARD_COLUMNS, 0);
  const dy = Math.max(0 - ty, ty - BOARD_ROWS, 0);
  return Math.max(dx, dy);
}

function riverDepth(ty) {
  const distance = Math.abs(ty - RIVER_CENTER);
  if (distance >= 1) return 0;
  if (distance > 0.66) return -0.62 * (1 - distance) / 0.34;
  return -0.62 - 0.14 * (1 - distance / 0.66);
}

function heightAt(tx, ty) {
  const outside = outsideDistance(tx, ty);
  // The painted board mats sit at y=0; the heightfield tucks just beneath them.
  let height = -0.05;
  if (outside > 0) {
    const rise = Math.min(1.5, Math.pow(outside, 1.15) * 0.42);
    height = rise + (valueNoise(tx * 0.7, ty * 0.7) - 0.5) * 0.5 * Math.min(1, outside);
  }
  const river = riverDepth(ty);
  if (river < 0) height = Math.min(height * smoothstep(0.6, 1.6, Math.abs(ty - RIVER_CENTER)), 0) + river;
  return height;
}

function pathDistance(tx, ty) {
  if (ty < 1.6 || ty > 30.4) return Infinity;
  let best = Infinity;
  for (const lane of LANES) {
    const wobble = Math.sin(ty * 0.55 + lane) * 0.22;
    best = Math.min(best, Math.abs(tx - lane - wobble));
  }
  return best;
}

const work = new Color();
const mixWith = new Color();

function faceColor(tx, ty, height, slope) {
  const outside = outsideDistance(tx, ty);
  const jitter = (hash2(tx * 3.1, ty * 2.7) - 0.5) * 0.06;
  if (height < -0.12) {
    // River banks and bed: warm soil with stone on the steep faces.
    work.setHex(slope > 0.55 ? PALETTE.soilDark : PALETTE.soil);
    if (slope > 0.75 && hash2(tx * 1.7, ty * 5.3) > 0.55) work.setHex(PALETTE.bankStone);
    return work.offsetHSL(0, 0, jitter);
  }
  if (outside > 0.02) {
    const shade = valueNoise(tx * 0.3 + 13, ty * 0.3 - 7);
    work.setHex(PALETTE.meadowOuter).lerp(mixWith.setHex(PALETTE.meadowShade), shade * 0.8);
    if (slope > 0.6) work.lerp(mixWith.setHex(PALETTE.soil), Math.min(0.5, (slope - 0.6) * 0.8));
    return work.offsetHSL(0, 0, jitter * 0.4);
  }
  const path = pathDistance(tx, ty) - (valueNoise(tx * 1.3, ty * 1.3) - 0.5) * 0.35;
  if (path < 1.05) {
    work.setHex(path > 0.82 ? PALETTE.pathDark : PALETTE.pathMid);
    if (path < 0.5) work.lerp(mixWith.setHex(PALETTE.pathLight), 0.45);
    return work.offsetHSL(0, 0, jitter * 1.4);
  }
  // Grass: a soft tile checker under low-frequency meadow patches.
  const checker = (Math.floor(tx) + Math.floor(ty)) % 2 === 0 ? 0.035 : -0.01;
  const patch = valueNoise(tx * 0.35 + 3, ty * 0.35 + 11);
  work.setHex(PALETTE.grassMid)
    .lerp(mixWith.setHex(patch > 0.5 ? PALETTE.grassLight : PALETTE.grassDark), Math.abs(patch - 0.5) * 1.2);
  const bankShade = smoothstep(2.2, 1.0, Math.abs(ty - RIVER_CENTER));
  if (bankShade > 0) work.lerp(mixWith.setHex(PALETTE.grassDeep), bankShade * 0.35);
  return work.offsetHSL(0, 0, checker + jitter);
}

function buildGround(toWorld) {
  const columns = Math.round((TERRAIN_X[1] - TERRAIN_X[0]) / STEP);
  const rows = Math.round((TERRAIN_Y[1] - TERRAIN_Y[0]) / STEP);
  const triangles = columns * rows * 2;
  const positions = new Float32Array(triangles * 9);
  const colors = new Float32Array(triangles * 9);
  const corner = (column, row) => {
    const tx = TERRAIN_X[0] + column * STEP;
    const ty = TERRAIN_Y[0] + row * STEP;
    return [tx, ty, heightAt(tx, ty)];
  };
  let cursor = 0;
  const pushTriangle = (a, b, c) => {
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const ch = (a[2] + b[2] + c[2]) / 3;
    const slope = Math.max(Math.abs(a[2] - b[2]), Math.abs(b[2] - c[2]), Math.abs(a[2] - c[2])) / STEP;
    const color = faceColor(cx, cy, ch, slope);
    for (const vertex of [a, b, c]) {
      const [x, z] = toWorld(vertex[0], vertex[1]);
      positions[cursor] = x;
      positions[cursor + 1] = vertex[2];
      positions[cursor + 2] = z;
      colors[cursor] = color.r;
      colors[cursor + 1] = color.g;
      colors[cursor + 2] = color.b;
      cursor += 3;
    }
  };
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = corner(column, row);
      const b = corner(column + 1, row);
      const c = corner(column + 1, row + 1);
      const d = corner(column, row + 1);
      // Board-space y grows north while world z grows south, so this
      // board-space winding faces up. Alternate diagonals for a faceted look.
      if ((row + column) % 2 === 0) {
        pushTriangle(a, b, c);
        pushTriangle(a, c, d);
      } else {
        pushTriangle(a, b, d);
        pushTriangle(b, c, d);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const WATER_VERTEX = /* glsl */`
varying vec3 vWaterWorld;
`;

function createWaterMaterial(halfDepth, centerZ) {
  const material = new MeshStandardMaterial({
    color: PALETTE.waterShallow,
    roughness: 0.18,
    metalness: 0,
  });
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new Color(PALETTE.waterDeep) },
    uShallow: { value: new Color(PALETTE.waterShallow) },
    uFoam: { value: new Color(PALETTE.waterFoam) },
    uHalf: { value: halfDepth },
    uCenter: { value: centerZ },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = WATER_VERTEX + shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
    shader.fragmentShader = `uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform float uHalf;
uniform float uCenter;
varying vec3 vWaterWorld;
` + shader.fragmentShader
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 p = vWaterWorld;
  float edge = clamp(abs(p.z - uCenter) / uHalf, 0.0, 1.0);
  vec3 water = mix(uDeep, uShallow, smoothstep(0.05, 0.95, edge));
  float flow = p.x * 0.8 - uTime * 0.55;
  float ripple = sin(flow + sin(p.z * 2.6 + uTime * 0.6) * 1.4) *
    sin(p.x * 0.33 + uTime * 0.31 + p.z * 1.9);
  water = mix(water, uShallow * 1.35, smoothstep(0.45, 0.95, ripple) * 0.45);
  float glint = smoothstep(0.9, 1.0, sin(p.x * 2.1 - uTime * 1.1 + p.z * 4.0) *
    sin(p.x * 0.9 + uTime * 0.7));
  water += vec3(glint * 0.18);
  float foamLine = edge + 0.07 * sin(p.x * 2.4 + uTime * 1.5) + 0.04 * sin(p.x * 5.1 - uTime);
  float foam = smoothstep(0.72, 0.9, foamLine);
  water = mix(water, uFoam, foam * 0.85);
  diffuseColor.rgb = water;
}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
normal = normalize(normal + 0.08 * vec3(sin(vWaterWorld.x * 3.0 - uTime * 1.3),
  0.0, cos(vWaterWorld.z * 5.0 + vWaterWorld.x * 0.7 + uTime * 0.9)));`);
  };
  material.customProgramCacheKey = () => "moss-ember-water-1";
  return { material, uniforms };
}

function buildBridge(toWorld, x0, x1) {
  const random = seededRandom(Math.round(x0 * 100));
  const parts = [];
  const [west] = toWorld(x0, 0);
  const [east] = toWorld(x1, 0);
  const width = east - west + 0.3;
  const centerX = (west + east) / 2;
  const [, southZ] = toWorld(0, 14.55);
  const [, northZ] = toWorld(0, 17.45);
  const length = southZ - northZ;
  const planks = 11;
  const plankDepth = length / planks;
  for (let index = 0; index < planks; index += 1) {
    const z = northZ + plankDepth * (index + 0.5);
    const arch = Math.sin(((index + 0.5) / planks) * Math.PI) * 0.16;
    const color = index % 2 === 0 ? PALETTE.plank : PALETTE.plankDark;
    parts.push(part(new BoxGeometry(width - 0.1 + random() * 0.1, 0.13, plankDepth * 0.9),
      color, {
        position: [centerX + (random() - 0.5) * 0.06, 0.1 + arch, z],
        rotation: [0, (random() - 0.5) * 0.05, (random() - 0.5) * 0.03],
      }));
  }
  // Side beams, rails, posts and brass caps.
  for (const side of [-1, 1]) {
    const x = centerX + side * (width / 2 - 0.06);
    parts.push(part(new BoxGeometry(0.16, 0.2, length + 0.2), PALETTE.plankDark,
      { position: [x, 0.02, (southZ + northZ) / 2] }));
    parts.push(part(new BoxGeometry(0.1, 0.1, length * 0.92), PALETTE.timber,
      { position: [x, 0.62, (southZ + northZ) / 2] }));
    for (let post = 0; post < 4; post += 1) {
      const z = northZ + 0.1 + (length - 0.2) * (post / 3);
      const arch = Math.sin((post / 3) * Math.PI) * 0.16;
      parts.push(part(new BoxGeometry(0.17, 0.62, 0.17), PALETTE.timber,
        { position: [x, 0.38 + arch * 0.5, z] }));
      parts.push(part(new OctahedronGeometry(0.11), PALETTE.brass,
        { position: [x, 0.76 + arch * 0.5, z] }));
    }
  }
  // Stone piers under the deck.
  for (const zFraction of [0.3, 0.7]) {
    parts.push(part(new CylinderGeometry(0.26, 0.34, 0.75, 6), PALETTE.stoneDark, {
      position: [centerX, -0.38, northZ + length * zFraction], scale: [width * 1.4, 1, 1],
    }));
  }
  return mergeParts(parts);
}

function buildCurb(toWorld, random) {
  const blocks = [];
  const add = (tx, ty, along) => {
    const [x, z] = toWorld(tx, ty);
    blocks.push({ x, z, along, height: 0.22 + random() * 0.12, tilt: (random() - 0.5) * 0.12 });
  };
  for (let ty = 0.35; ty < 32; ty += 0.7) {
    if (Math.abs(ty - RIVER_CENTER) < 1.15) continue;
    add(-0.2, ty, "y");
    add(18.2, ty, "y");
  }
  for (let tx = 0.35; tx < 18; tx += 0.7) {
    add(tx, -0.2, "x");
    add(tx, 32.2, "x");
  }
  return blocks;
}

function scatter(random, count, accept, attempts = count * 30) {
  const points = [];
  for (let attempt = 0; attempt < attempts && points.length < count; attempt += 1) {
    const tx = TERRAIN_X[0] + random() * (TERRAIN_X[1] - TERRAIN_X[0]);
    const ty = TERRAIN_Y[0] + random() * (TERRAIN_Y[1] - TERRAIN_Y[0]);
    const candidate = accept(tx, ty);
    if (candidate === false) continue;
    const spacing = typeof candidate === "number" ? candidate : 0;
    if (spacing > 0 && points.some((point) => Math.hypot(point.tx - tx, point.ty - ty) < spacing)) continue;
    points.push({ tx, ty });
  }
  return points;
}

function roundTreeGeometry() {
  return mergeParts([
    part(new CylinderGeometry(0.12, 0.18, 0.9, 6), PALETTE.trunk, { position: [0, 0.45, 0] }),
    part(new IcosahedronGeometry(0.78, 0), PALETTE.leaf, { position: [0, 1.35, 0], scale: [1, 0.9, 1] }),
    part(new IcosahedronGeometry(0.52, 0), PALETTE.leafLight, { position: [0.28, 1.78, 0.18] }),
    part(new IcosahedronGeometry(0.42, 0), PALETTE.leafLight, { position: [-0.35, 1.55, 0.25] }),
  ]);
}

function pineGeometry() {
  return mergeParts([
    part(new CylinderGeometry(0.1, 0.15, 0.6, 5), PALETTE.trunk, { position: [0, 0.3, 0] }),
    part(new ConeGeometry(0.85, 1.1, 7), PALETTE.pine, { position: [0, 1.0, 0] }),
    part(new ConeGeometry(0.66, 0.95, 7), PALETTE.pine, { position: [0, 1.55, 0], rotation: [0, 0.4, 0] }),
    part(new ConeGeometry(0.44, 0.8, 7), PALETTE.leaf, { position: [0, 2.05, 0], rotation: [0, 0.8, 0] }),
  ]);
}

function instanced(geometry, material, transforms, colorFor) {
  const mesh = new InstancedMesh(geometry, material, transforms.length);
  const dummy = new Object3D();
  const color = new Color();
  transforms.forEach((transform, index) => {
    dummy.position.set(transform.x, transform.y, transform.z);
    dummy.rotation.set(transform.rx ?? 0, transform.ry ?? 0, transform.rz ?? 0);
    dummy.scale.set(transform.sx ?? transform.s, transform.sy ?? transform.s, transform.sz ?? transform.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (colorFor) mesh.setColorAt(index, colorFor(transform, color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** Static terrain, river, bridges and framing decoration. */
function boardMat(toWorld, texture, fromRow, toRow) {
  const [west, north] = toWorld(0, toRow);
  const [east, south] = toWorld(BOARD_COLUMNS, fromRow);
  const geometry = new PlaneGeometry(east - west, south - north, 1, 1);
  const uv = geometry.getAttribute("uv");
  // PlaneGeometry UV v=1 is the top (north) edge; canvas v=1 is ty=32.
  for (let index = 0; index < uv.count; index += 1) {
    const v = uv.getY(index);
    uv.setY(index, (fromRow + (toRow - fromRow) * v) / BOARD_ROWS);
  }
  uv.needsUpdate = true;
  const mesh = new Mesh(geometry, texture);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((west + east) / 2, 0, (north + south) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

export function createTerrain(toWorld, { document, maxAnisotropy, tileDepth }) {
  const group = new Group();
  const disposables = [];
  const keep = (value) => { disposables.push(value); return value; };
  const vertexMaterial = keep(new MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true,
  }));

  const ground = new Mesh(keep(buildGround(toWorld)), vertexMaterial);
  ground.receiveShadow = true;
  group.add(ground);

  const boardTexture = keep(new CanvasTexture(paintBoardTexture(document)));
  boardTexture.colorSpace = SRGBColorSpace;
  boardTexture.anisotropy = maxAnisotropy;
  const boardMaterial = keep(new MeshStandardMaterial({ map: boardTexture, roughness: 0.95, metalness: 0 }));
  for (const [fromRow, toRow] of [[0, RIVER_CENTER - 1], [RIVER_CENTER + 1, BOARD_ROWS]]) {
    const mat = boardMat(toWorld, boardMaterial, fromRow, toRow);
    keep(mat.geometry);
    group.add(mat);
  }

  const [, riverZ] = toWorld(0, RIVER_CENTER);
  const [left] = toWorld(TERRAIN_X[0], 0);
  const [right] = toWorld(TERRAIN_X[1], 0);
  const water = createWaterMaterial(tileDepth * 1.0, riverZ);
  keep(water.material);
  const waterMesh = new Mesh(keep(new PlaneGeometry(right - left, tileDepth * 2.1, 1, 1)), water.material);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set((left + right) / 2, -0.24, riverZ);
  waterMesh.receiveShadow = true;
  group.add(waterMesh);

  for (const bridge of BRIDGES) {
    const mesh = new Mesh(keep(buildBridge(toWorld, bridge.x0, bridge.x1)), vertexMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const random = seededRandom(20_261_107);
  const stoneMaterial = keep(new MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, flatShading: true,
  }));
  const curbBlocks = buildCurb(toWorld, random);
  const curb = instanced(keep(new BoxGeometry(1, 1, 1)), stoneMaterial, curbBlocks.map((block) => ({
    x: block.x, y: block.height / 2 - 0.05, z: block.z,
    sx: block.along === "x" ? 0.62 : 0.34, sy: block.height, sz: block.along === "x" ? 0.34 : 0.62 * tileDepth,
    ry: block.tilt,
  })), (_, color) => color.setHex(PALETTE.stone).offsetHSL(0, 0, (random() - 0.5) * 0.1));
  curb.castShadow = true;
  curb.receiveShadow = true;
  group.add(curb);

  const offBoard = (margin, spacing) => (tx, ty) => {
    if (outsideDistance(tx, ty) < margin) return false;
    if (Math.abs(ty - RIVER_CENTER) < 1.4) return false;
    return spacing;
  };
  const treeSpots = scatter(random, 46, offBoard(0.9, 1.25));
  const roundSpots = treeSpots.filter((_, index) => index % 3 !== 0);
  const pineSpots = treeSpots.filter((_, index) => index % 3 === 0);
  const placeOnTerrain = (spot, scale) => {
    const [x, z] = toWorld(spot.tx, spot.ty);
    return { x, y: heightAt(spot.tx, spot.ty) - 0.05, z, s: scale, ry: random() * Math.PI * 2 };
  };
  const treeTint = (_, color) => color.setRGB(1, 1, 1).offsetHSL((random() - 0.5) * 0.04, 0, (random() - 0.5) * 0.12);
  const rounds = instanced(keep(roundTreeGeometry()), vertexMaterial,
    roundSpots.map((spot) => placeOnTerrain(spot, 0.95 + random() * 0.55)), treeTint);
  const pines = instanced(keep(pineGeometry()), vertexMaterial,
    pineSpots.map((spot) => placeOnTerrain(spot, 0.95 + random() * 0.6)), treeTint);
  for (const mesh of [rounds, pines]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const rockSpots = scatter(random, 34, (tx, ty) => {
    const outside = outsideDistance(tx, ty);
    if (outside < 0.35) return false;
    return 0.7;
  });
  const riverRocks = scatter(random, 10, (tx, ty) =>
    outsideDistance(tx, ty) > 0.2 && Math.abs(Math.abs(ty - RIVER_CENTER) - 1.05) < 0.25 ? 0.6 : false);
  const rocks = instanced(keep(new DodecahedronGeometry(0.42, 0)), stoneMaterial,
    [...rockSpots, ...riverRocks].map((spot) => {
      const placed = placeOnTerrain(spot, 0.5 + random() * 0.9);
      return { ...placed, sy: placed.s * (0.55 + random() * 0.3), rx: random(), rz: random() * 0.4 };
    }), (_, color) => color.setHex(PALETTE.rock).offsetHSL(0, -0.05 + random() * 0.05, (random() - 0.5) * 0.14));
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);

  const leafMaterial = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }));
  const bushSpots = scatter(random, 40, (tx, ty) => {
    const outside = outsideDistance(tx, ty);
    if (outside < 0.3 || Math.abs(ty - RIVER_CENTER) < 1.2) return false;
    return 0.6;
  });
  const bushes = instanced(keep(new IcosahedronGeometry(0.42, 0)), leafMaterial, bushSpots.map((spot) => {
    const placed = placeOnTerrain(spot, 0.6 + random() * 0.7);
    return { ...placed, sy: placed.s * 0.75, y: placed.y + 0.12 };
  }), (_, color) => color.setHex(random() > 0.5 ? PALETTE.leafLight : PALETTE.leaf)
    .offsetHSL((random() - 0.5) * 0.03, 0, (random() - 0.5) * 0.08));
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  group.add(bushes);

  const flowerColors = [PALETTE.flowerPink, PALETTE.flowerYellow, PALETTE.flowerWhite];
  const flowerSpots = scatter(random, 150, (tx, ty) =>
    outsideDistance(tx, ty) > 0.15 && Math.abs(ty - RIVER_CENTER) > 1.15 ? 0.22 : false);
  const flowers = instanced(keep(new OctahedronGeometry(0.1, 0)), leafMaterial, flowerSpots.map((spot) => {
    const placed = placeOnTerrain(spot, 0.8 + random() * 0.8);
    return { ...placed, y: placed.y + 0.12 };
  }), (_, color) => color.setHex(flowerColors[Math.floor(random() * flowerColors.length)]));
  group.add(flowers);

  const tuftSpots = scatter(random, 90, (tx, ty) =>
    outsideDistance(tx, ty) > 0.1 && Math.abs(ty - RIVER_CENTER) > 1.1 ? 0.3 : false);
  const tufts = instanced(keep(new ConeGeometry(0.09, 0.42, 4)), leafMaterial, tuftSpots.flatMap((spot) => {
    const placed = placeOnTerrain(spot, 1);
    return [-0.1, 0, 0.1].map((offset, index) => ({
      x: placed.x + offset, y: placed.y + 0.18, z: placed.z + (index - 1) * 0.05,
      s: 0.8 + random() * 0.6, rz: offset * 2.5, ry: random(),
    }));
  }), (_, color) => color.setHex(PALETTE.grassLight).offsetHSL(0, 0, (random() - 0.5) * 0.15));
  group.add(tufts);

  // Reeds along the river outside the board.
  const reedSpots = scatter(random, 26, (tx, ty) => {
    if (tx > -0.4 && tx < 18.4) return false;
    return Math.abs(Math.abs(ty - RIVER_CENTER) - 0.95) < 0.2 ? 0.3 : false;
  });
  const reeds = instanced(keep(new CylinderGeometry(0.025, 0.04, 0.9, 4)), leafMaterial,
    reedSpots.flatMap((spot) => {
      const placed = placeOnTerrain(spot, 1);
      return [0, 1, 2].map((index) => ({
        x: placed.x + (index - 1) * 0.12, y: placed.y + 0.4, z: placed.z + (random() - 0.5) * 0.2,
        s: 0.8 + random() * 0.5, rz: (random() - 0.5) * 0.3,
      }));
    }), (_, color) => color.setHex(PALETTE.mossDark).offsetHSL(0.02, 0, (random() - 0.5) * 0.1));
  group.add(reeds);

  return {
    group,
    water: water.uniforms,
    dispose() {
      for (const value of disposables) value.dispose();
    },
  };
}

export { heightAt as terrainHeightAt };
