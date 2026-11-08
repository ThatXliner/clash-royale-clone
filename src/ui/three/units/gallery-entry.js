// Standalone gallery for the unit model kit (not part of the release build).
// It mirrors the battlefield (src/ui/three/battlefield/scene.js): 47° orthographic
// tilt, ACES tone mapping at exposure 1.08, the same hemisphere + sun, and
// ground depth stretched by 1/sin(47°) so tiles read square. Models are placed
// on the stretched ground at true proportions, exactly as the battlefield
// should place them (see index.js).
// Query parameters:
//   view=grid|phone   grid: labelled close-up of every kind and both sides;
//                     phone: in-game scale (20 CSS px per tile), north facing
//                     the camera, south facing away.
//   pose=<pose>       hold every model in one pose (default: cycle).
//   t=<seconds>       time into the held pose.
//   labels=0|1        toggle labels (phone view defaults to off).
//   kinds=a,b         only show these kinds;  cols=n  grid columns.
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DataTexture,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "../three-module.js";
import { PALETTE } from "../battlefield/palette.js";
import {
  createEffectModel,
  createUnitModel,
  EFFECT_MODEL_KINDS,
  UNIT_MODEL_KINDS,
  UNIT_POSES,
} from "./index.js";

const ELEVATION = (47 * Math.PI) / 180;
const DEPTH = 1 / Math.sin(ELEVATION);
const PX_PER_TILE = 20;

const params = new URLSearchParams(location.search);
const view = params.get("view") === "phone" ? "phone" : "grid";
const heldPose = UNIT_POSES.includes(params.get("pose")) ? params.get("pose") : null;
const DEFAULT_T = { idle: 0.4, walk: 0.15, attack: 0.3, hit: 0.06, death: 0.38, deploy: 0.3 };
const heldT = params.has("t") && Number.isFinite(Number(params.get("t")))
  ? Number(params.get("t")) : DEFAULT_T[heldPose] ?? 0;
const showLabels = params.has("labels") ? params.get("labels") !== "0" : view === "grid";

document.body.classList.add(view);
if (!showLabels) document.body.classList.add("bare");
document.getElementById("pose").textContent = heldPose ?? "cycle";

const requestedKinds = params.get("kinds")?.split(",").filter(Boolean) ?? null;
const ALL_KINDS = [...UNIT_MODEL_KINDS, ...EFFECT_MODEL_KINDS]
  .filter((kind) => requestedKinds === null || requestedKinds.includes(kind));
const STRUCTURES = new Set(["ember-basin", "buried-coil", "aether-well", "bulwark-needle"]);
const make = (kind, side) => (EFFECT_MODEL_KINDS.includes(kind)
  ? createEffectModel(kind, side) : createUnitModel(kind, side));

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
document.getElementById("stage").append(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x24402a);

// Two-tone tile checker in the battlefield's grass colours.
function grassTexture() {
  const tones = [PALETTE.grassLight, PALETTE.grassMid];
  const data = new Uint8Array(4 * 4);
  for (let i = 0; i < 4; i += 1) {
    const hex = tones[(i % 2) ^ (Math.floor(i / 2) % 2)];
    data.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], i * 4);
  }
  const tex = new DataTexture(data, 2, 2);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const GROUND_TILES = 80;
const groundTex = grassTexture();
groundTex.repeat.set(GROUND_TILES / 2, GROUND_TILES / 2);
const ground = new Mesh(
  new PlaneGeometry(GROUND_TILES, GROUND_TILES * DEPTH),
  new MeshStandardMaterial({ map: groundTex, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const hemisphere = new HemisphereLight(0xdcefff, 0x5a6b3c, 1.25);
scene.add(hemisphere);
const sun = new DirectionalLight(0xffe4c0, 2.7);
const SUN_OFFSET = new Vector3(-16, 30, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 2.5;
scene.add(sun, sun.target);

const models = [];
const labels = [];
// Positions are given in board tiles; depth is stretched like the battlefield.
function place(kind, side, tx, ty, faceY) {
  const model = make(kind, side);
  model.object.position.set(tx, 0, ty * DEPTH);
  model.object.rotation.y = faceY;
  scene.add(model.object);
  models.push(model);
  return model;
}
const label = (text, sub, tx, ty) => labels.push({ text, sub, position: new Vector3(tx, 0, ty * DEPTH) });

if (view === "grid") {
  const columns = Math.min(Number(params.get("cols")) || 7, ALL_KINDS.length);
  const cellW = 3.9;
  const cellD = 3.4;
  ALL_KINDS.forEach((kind, index) => {
    const cx = ((index % columns) - (columns - 1) / 2) * cellW;
    const cy = Math.floor(index / columns) * cellD;
    const gap = STRUCTURES.has(kind) ? 1.0 : 0.65;
    place(kind, "south", cx - gap, cy, 0.45);
    const north = place(kind, "north", cx + gap, cy, -0.45);
    label(kind, north.layer, cx, cy + 0.95);
  });
} else {
  // Phone: two armies facing each other across an empty middle band.
  const perRow = 7;
  const spacing = 2.6;
  const army = (side, y0, dir) => ALL_KINDS.forEach((kind, index) => {
    const row = Math.floor(index / perRow);
    const tx = ((index % perRow) - (perRow - 1) / 2) * spacing + (row % 2 ? spacing / 2 : 0) - spacing / 4;
    const ty = y0 + dir * row * 2.6;
    place(kind, side, tx, ty, side === "north" ? 0 : Math.PI);
    label(kind, side, tx, ty + 0.6);
  });
  army("north", -3.5, -1);
  army("south", 3.5, 1);
}

const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const centre = new Vector3();
{
  const box = new Box3();
  for (const model of models) box.expandByPoint(model.object.position);
  box.getCenter(centre);
  centre.y = 0;
}

function fitCamera() {
  const w = innerWidth;
  const h = innerHeight;
  camera.position.set(centre.x, Math.sin(ELEVATION) * 120, centre.z + Math.cos(ELEVATION) * 120);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  if (view === "phone") {
    // One tile = 20 CSS px across, and one stretched tile row = 20 px down.
    const halfW = w / PX_PER_TILE / 2;
    const halfH = h / PX_PER_TILE / 2;
    Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  } else {
    // Fit the projected bounds of every model, measured in a settled idle pose.
    const box = new Box3();
    for (const model of models) {
      const { x, z } = model.object.position;
      const r = model.radius + 0.6;
      const top = model.kind === "stormkite" ? 2.6 : model.height + 0.2;
      box.expandByPoint(new Vector3(x - r, 0, z - r)).expandByPoint(new Vector3(x + r, top, z + r));
    }
    for (const { position } of labels) box.expandByPoint(position);
    const inverse = camera.matrixWorldInverse;
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new Vector3(x, y, z).applyMatrix4(inverse);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    minX -= 0.4; maxX += 0.4; minY -= 0.6; maxY += 0.4;
    let halfW = (maxX - minX) / 2;
    let halfH = (maxY - minY) / 2;
    if (halfW / halfH < w / h) halfW = halfH * (w / h);
    else halfH = halfW * (h / w);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    Object.assign(camera, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH });
  }
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const span = 34;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.copy(centre);
  sun.position.copy(centre).add(SUN_OFFSET);
}
fitCamera();

const labelLayer = document.getElementById("labels");
const labelNodes = labels.map(({ text, sub }) => {
  const node = document.createElement("div");
  node.className = "unit-label";
  node.innerHTML = `${text}<small>${sub}</small>`;
  labelLayer.append(node);
  return node;
});
function placeLabels() {
  const v = new Vector3();
  labels.forEach(({ position }, index) => {
    v.copy(position).project(camera);
    labelNodes[index].style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    labelNodes[index].style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  });
}
placeLabels();
addEventListener("resize", () => { fitCamera(); placeLabels(); });

// Pose driving.
const CYCLE = [["deploy", 0.8], ["idle", 1.6], ["walk", 2.0], ["attack", 1.0], ["attack", 1.0], ["hit", 0.9], ["death", 1.5]];
const cycleLength = CYCLE.reduce((sum, [, d]) => sum + d, 0);

function holdPose() {
  for (const model of models) {
    if (heldPose === "hit") {
      model.setPose("idle");
      model.update(0.5);
    }
    model.setPose(heldPose);
    // Fixed steps keep frames identical between runs.
    let remaining = heldT;
    while (remaining > 1e-9) {
      const step = Math.min(1 / 60, remaining);
      model.update(step);
      remaining -= step;
    }
  }
}

let clock = 0;
let cycleIndex = -1;
function drive(dt) {
  clock += dt;
  let t = clock % cycleLength;
  let index = 0;
  while (t > CYCLE[index][1]) {
    t -= CYCLE[index][1];
    index += 1;
  }
  const pose = CYCLE[index][0];
  if (index !== cycleIndex) {
    cycleIndex = index;
    for (const model of models) {
      // Hit is an overlay: show it on top of the idle stance.
      model.setPose(pose === "hit" ? "idle" : pose);
      if (pose === "hit") model.setPose("hit");
    }
    document.getElementById("pose").textContent = `cycle: ${pose}`;
  }
  if (pose === "hit" && Math.floor((t + dt) / 0.3) !== Math.floor(t / 0.3)) {
    for (const model of models) model.setPose("hit");
  }
  for (const model of models) model.update(dt);
}

function render() {
  renderer.render(scene, camera);
}

if (heldPose) {
  holdPose();
  render();
  let drawCalls = 0;
  for (const model of models) drawCalls += model.drawCalls;
  window.__unitGallery = { ready: true, info: { ...renderer.info.render }, models: models.length, drawCalls };
} else {
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    drive(dt);
    render();
  });
  window.__unitGallery = { ready: true, models: models.length };
}
