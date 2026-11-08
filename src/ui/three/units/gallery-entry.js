// Standalone gallery for the unit model kit (not part of the release build).
// Query parameters:
//   view=grid|phone   grid: labelled close-up of every kind and both sides;
//                     phone: models at in-game scale (20 CSS px per tile),
//                     north facing the camera, south facing away.
//   pose=<pose>       hold every model in one pose (default: cycle).
//   t=<seconds>       time into the frozen pose.
//   labels=0|1        toggle labels (phone view defaults to off).
//   kinds=a,b         only show these kinds.
import * as THREE from "three";
import {
  createEffectModel,
  createUnitModel,
  EFFECT_MODEL_KINDS,
  UNIT_MODEL_KINDS,
  UNIT_POSES,
} from "./index.js";

const params = new URLSearchParams(location.search);
const view = params.get("view") === "phone" ? "phone" : "grid";
const frozenPose = UNIT_POSES.includes(params.get("pose")) ? params.get("pose") : null;
const DEFAULT_T = { idle: 0.4, walk: 0.15, attack: 0.3, hit: 0.06, death: 0.38, deploy: 0.3 };
const frozenT = Number.isFinite(Number(params.get("t"))) && params.has("t")
  ? Number(params.get("t")) : DEFAULT_T[frozenPose] ?? 0;
const showLabels = params.has("labels") ? params.get("labels") !== "0" : view === "grid";
const PX_PER_TILE = 20;
const TILT = THREE.MathUtils.degToRad(55);

document.body.classList.add(view);
if (!showLabels) document.body.classList.add("bare");
document.getElementById("pose").textContent = frozenPose ?? "cycle";

const requestedKinds = params.get("kinds")?.split(",").filter(Boolean) ?? null;
const ALL_KINDS = [...UNIT_MODEL_KINDS, ...EFFECT_MODEL_KINDS]
  .filter((kind) => requestedKinds === null || requestedKinds.includes(kind));
const make = (kind, side) => (EFFECT_MODEL_KINDS.includes(kind)
  ? createEffectModel(kind, side) : createUnitModel(kind, side));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById("stage").append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#7FA65A");

// Two-tone tile checker so tile scale is visible.
function grassTexture() {
  const size = 2;
  const data = new Uint8Array(size * size * 4);
  const a = [0x78, 0xA8, 0x52];
  const b = [0x6E, 0x9C, 0x4A];
  for (let i = 0; i < size * size; i += 1) {
    const c = (i % 2) ^ (Math.floor(i / size) % 2) ? a : b;
    data.set([...c, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const GROUND = 80;
const groundTex = grassTexture();
groundTex.repeat.set(GROUND / 2, GROUND / 2);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND, GROUND),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const hemi = new THREE.HemisphereLight("#DCEEFF", "#4F6A34", 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#FFE1B3", 2.7);
sun.position.set(-7, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

// Layout.
const models = [];
const labels = [];
function place(kind, side, x, z, faceY) {
  const model = make(kind, side);
  model.object.position.set(x, 0, z);
  model.object.rotation.y = faceY;
  scene.add(model.object);
  models.push(model);
  return model;
}

let extent = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
if (view === "grid") {
  const columns = Math.min(Number(params.get("cols")) || 7, ALL_KINDS.length);
  const cellW = 3.9;
  const cellD = 4.3;
  ALL_KINDS.forEach((kind, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cx = (col - (columns - 1) / 2) * cellW;
    const cz = row * cellD;
    const structure = ["ember-basin", "buried-coil", "aether-well", "bulwark-needle"].includes(kind);
    const gap = structure ? 1.0 : 0.65;
    place(kind, "south", cx - gap, cz, 0.45);
    place(kind, "north", cx + gap, cz, -0.45);
    labels.push({ text: kind, sub: models.at(-1).layer, position: new THREE.Vector3(cx, 0, cz + 1.15) });
  });
  const rows = Math.ceil(ALL_KINDS.length / columns);
  extent = { minX: -columns * cellW / 2, maxX: columns * cellW / 2, minZ: -cellD * 0.85, maxZ: (rows - 1) * cellD + cellD * 0.4 };
} else {
  // Phone: two armies facing each other across a "river" gap.
  const perRow = 7;
  const spacing = 2.6;
  const placeArmy = (side, z0, dir) => {
    ALL_KINDS.forEach((kind, index) => {
      const col = index % perRow;
      const row = Math.floor(index / perRow);
      const x = (col - (perRow - 1) / 2) * spacing + (row % 2 ? spacing / 2 : 0) - spacing / 4;
      const z = z0 + dir * row * 3.0;
      place(kind, side, x, z, side === "north" ? 0 : Math.PI);
      labels.push({ text: kind, sub: side, position: new THREE.Vector3(x, 0, z + 0.7) });
    });
  };
  placeArmy("north", -3.5, -1);
  placeArmy("south", 3.5, 1);
  extent = { minX: -10, maxX: 10, minZ: -16, maxZ: 16 };
}

// Orthographic camera tilted 55 degrees, looking north (-Z).
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const centre = new THREE.Vector3((extent.minX + extent.maxX) / 2, 0, (extent.minZ + extent.maxZ) / 2);
function fitCamera() {
  const w = innerWidth;
  const h = innerHeight;
  const dist = 60;
  camera.position.set(centre.x, Math.sin(TILT) * dist, centre.z + Math.cos(TILT) * dist);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  if (view === "phone") {
    const halfW = w / PX_PER_TILE / 2;
    const halfH = halfW * (h / w);
    Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  } else {
    // Fit the projected bounds of every model (plus label room) to the view.
    const box = new THREE.Box3();
    // Measure every model in a settled idle pose, then restore the deploy clip.
    for (const model of models) {
      model.setPose("idle");
      model.update(0.5);
      box.expandByObject(model.object);
      model.setPose("deploy");
    }
    for (const { position } of labels) box.expandByPoint(position);
    const inverse = camera.matrixWorldInverse;
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inverse);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const margin = 0.4;
    minX -= margin; maxX += margin; minY -= margin * 1.5; maxY += margin;
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
  const span = Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ) / 2 + 3;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.copy(centre);
  sun.position.copy(centre).add(new THREE.Vector3(-7, 14, 9));
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
  const v = new THREE.Vector3();
  labels.forEach(({ position }, index) => {
    v.copy(position).project(camera);
    const node = labelNodes[index];
    node.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    node.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  });
}
placeLabels();
addEventListener("resize", () => { fitCamera(); placeLabels(); });

// Pose driving.
const CYCLE = [["deploy", 0.8], ["idle", 1.6], ["walk", 2.0], ["attack", 1.0], ["attack", 1.0], ["hit", 0.9], ["death", 1.5]];
const cycleLength = CYCLE.reduce((sum, [, d]) => sum + d, 0);

function holdPose() {
  for (const model of models) {
    if (frozenPose === "hit") {
      model.setPose("idle");
      model.update(0.5);
      model.setPose("hit");
    } else {
      model.setPose(frozenPose);
    }
    // Fixed steps keep frames identical between runs.
    let remaining = frozenT;
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
  if (index !== cycleIndex) {
    cycleIndex = index;
    const pose = CYCLE[index][0];
    for (const model of models) {
      // Hit is an overlay: show it on top of the idle stance.
      model.setPose(pose === "hit" ? "idle" : pose);
      if (pose === "hit") model.setPose("hit");
    }
    document.getElementById("pose").textContent = `cycle: ${pose}`;
  }
  if (CYCLE[index][0] === "hit" && Math.floor((t + dt) / 0.3) !== Math.floor(t / 0.3)) {
    for (const model of models) model.setPose("hit");
  }
  for (const model of models) model.update(dt);
}

function render() {
  renderer.render(scene, camera);
}

if (frozenPose) {
  holdPose();
  render();
  window.__unitGallery = { ready: true, info: renderer.info.render, models: models.length };
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
