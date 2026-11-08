import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from "../three-module.js";
import { BOARD_COLUMNS, BOARD_ROWS, createTerrain } from "./terrain.js";
import { createTowerSet } from "./towers.js";
import { createUnitLayer } from "./units-layer.js";
import { createEffectLayer } from "./effects-layer.js";

// Orthographic camera tilted about the world x-axis. Ground depth is stretched
// by 1/sin(elevation) so one board tile projects to exactly one DOM tile in
// both directions: the ground plane maps affinely onto the DOM playfield, and
// every pointer/tile conversion in the input layer stays unchanged.
export const BATTLEFIELD_ELEVATION = (47 * Math.PI) / 180;
const DEPTH_SCALE = 1 / Math.sin(BATTLEFIELD_ELEVATION);
const CAMERA_DISTANCE = 120;
const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 0.75;
// Moving units refresh the sun's shadow map at most this often.
const SHADOW_REFRESH_MS = 15;

/** Board tile coordinates (tx east, ty north) → world [x, z]. */
export function boardToWorld(tx, ty) {
  return [tx - BOARD_COLUMNS / 2, (BOARD_ROWS / 2 - ty) * DEPTH_SCALE];
}

const VIEW_STYLE = `.battlefield-3d{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:#24402a}
.battlefield-3d>canvas{display:block;width:100%;height:100%}
.battlefield-3d::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 78% 62% at 50% 46%,transparent 58%,#0c1a1466 84%,#08120ead 100%)}
.battle-shell[data-renderer="three"]{background:#24402a}
.battle-shell[data-renderer="three"] .arena{border-color:transparent!important;background:none!important;box-shadow:none!important}
.battle-shell[data-renderer="three"] .arena::before,.battle-shell[data-renderer="three"] .arena::after{display:none!important}
.battle-shell[data-renderer="three"] .arena>.arena-half,.battle-shell[data-renderer="three"] .arena>.lane,.battle-shell[data-renderer="three"] .arena>.river,.battle-shell[data-renderer="three"] .arena>.bridge,.battle-shell[data-renderer="three"] .arena>.tower-pad,.battle-shell[data-renderer="three"] .combat-marker--tower{visibility:hidden!important}
.battle-shell[data-renderer="three"] .combat-marker--entity-ground,.battle-shell[data-renderer="three"] .combat-marker--entity-air,.battle-shell[data-renderer="three"] .combat-target-link,.battle-shell[data-renderer="three"] .combat-effects__frame{display:none!important}`;
// The rules above live with the scene (not arena-shell.css) so the DOM
// renderer's pinned stylesheet stays byte-identical; the canvas sits under the
// transparent DOM arena while input and HUD keep their layers. In 3D mode the
// DOM unit markers, target links and effect sprites stay in the document
// (tests and the projection transaction rely on them) but are not displayed:
// the canvas draws every unit, projectile and area instead.

export function createBattlefieldView({ document, window, onFailure }) {
  const container = document.createElement("div");
  container.className = "battlefield-3d";
  container.dataset.ui = "battlefield-3d";
  container.setAttribute("aria-hidden", "true");
  const style = document.createElement("style");
  style.dataset.ui = "battlefield-3d-style";
  style.textContent = VIEW_STYLE;
  container.appendChild(style);
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  let context = null;
  try {
    context = canvas.getContext("webgl2", {
      alpha: false, antialias: true, depth: true, powerPreference: "high-performance", stencil: false,
    });
  } catch {
    context = null;
  }
  if (context === null) return null;

  const renderer = new WebGLRenderer({ canvas, context, antialias: true });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x24402a, 1);

  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  let reducedMotion = motionQuery?.matches === true;

  const scene = new Scene();
  scene.background = new Color(0x24402a);
  const camera = new OrthographicCamera(-12, 12, 20, -22, 1, 400);
  camera.position.set(0, Math.sin(BATTLEFIELD_ELEVATION) * CAMERA_DISTANCE,
    Math.cos(BATTLEFIELD_ELEVATION) * CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);

  const hemisphere = new HemisphereLight(0xdcefff, 0x5a6b3c, 1.25);
  scene.add(hemisphere);
  const sun = new DirectionalLight(0xffe4c0, 2.7);
  sun.position.set(-16, 30, 18);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  // Tight shadow frustum around the visible diorama.
  {
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    const view = new Matrix4().lookAt(sun.position, sun.target.position, new Vector3(0, 1, 0));
    view.setPosition(sun.position);
    const inverse = view.clone().invert();
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    const corner = new Vector3();
    for (const x of [-14, 14]) for (const y of [-1, 7.5]) for (const z of [-27, 30]) {
      corner.set(x, y, z).applyMatrix4(inverse);
      min.min(corner);
      max.max(corner);
    }
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = min.x;
    shadowCamera.right = max.x;
    shadowCamera.bottom = min.y;
    shadowCamera.top = max.y;
    shadowCamera.near = Math.max(0.5, -max.z - 2);
    shadowCamera.far = -min.z + 2;
    shadowCamera.updateProjectionMatrix();
  }

  const terrain = createTerrain(boardToWorld, {
    document, maxAnisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()), tileDepth: DEPTH_SCALE,
  });
  scene.add(terrain.group);
  const towers = createTowerSet({
    document, toWorld: boardToWorld, isReducedMotion: () => reducedMotion,
  });
  scene.add(towers.group);
  const units = createUnitLayer({
    toWorld: boardToWorld, elevation: BATTLEFIELD_ELEVATION, isReducedMotion: () => reducedMotion,
  });
  scene.add(units.group);
  let towerRecords = new Map();
  const effects = createEffectLayer({
    toWorld: boardToWorld,
    elevation: BATTLEFIELD_ELEVATION,
    depthScale: DEPTH_SCALE,
    isReducedMotion: () => reducedMotion,
    units,
    towerAnchor: (id) => towerRecords.get(id) ?? null,
  });
  scene.add(effects.group);

  // Read-only diagnostics for browser probes: CPU milliseconds spent per
  // animation frame (animate + draw) and per observed UI frame, last 1024 each.
  const timing = { render: new Float32Array(1024), update: new Float32Array(1024), renders: 0, updates: 0 };
  Object.defineProperty(container, "battlefieldDebug", {
    value: Object.freeze({
      renderer, scene, units, effects,
      timings() {
        const take = (values, count) => Array.from(values.slice(0, Math.min(count, values.length)));
        return { render: take(timing.render, timing.renders), update: take(timing.update, timing.updates) };
      },
      resetTimings() { timing.renders = 0; timing.updates = 0; },
      freeze(frozen) { presentationNow(); clockScale = frozen ? 0 : 1; dirty = true; },
    }),
  });

  let shell = null;
  let disposed = false;
  let dirty = true;
  let layoutDirty = true;
  let pixelRatio = 0;
  let size = { width: 0, height: 0 };
  let frameHandle = 0;
  let shadowsDirty = true;
  let lastFrameAt = null;
  let lastShadowAt = -Infinity;

  const currentPixelRatio = () => {
    const frameScale = Number(document.documentElement?.dataset?.combatFrameScale);
    const scale = Number.isFinite(frameScale) && frameScale > 0 ? frameScale : 1;
    const device = window.devicePixelRatio || 1;
    return Math.min(MAX_PIXEL_RATIO, Math.max(MIN_PIXEL_RATIO, device * scale));
  };

  const layout = () => {
    layoutDirty = false;
    const arena = shell?.querySelector('[data-ui="arena"]');
    if (!arena) return false;
    const box = container.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
      layoutDirty = true;
      return false;
    }
    const outer = arena.getBoundingClientRect();
    const fieldWidth = arena.clientWidth;
    const fieldHeight = arena.clientHeight;
    if (fieldWidth <= 0 || fieldHeight <= 0) {
      layoutDirty = true;
      return false;
    }
    const centerX = outer.left + arena.clientLeft - box.left + fieldWidth / 2;
    const centerY = outer.top + arena.clientTop - box.top + fieldHeight / 2;
    const horizontal = fieldWidth / BOARD_COLUMNS;
    // Ground depth is pre-stretched, so a tile row spans one view unit per
    // `vertical` pixels exactly when tiles are square on screen.
    const vertical = fieldHeight / BOARD_ROWS;
    camera.left = -centerX / horizontal;
    camera.right = (box.width - centerX) / horizontal;
    camera.top = centerY / vertical;
    camera.bottom = -(box.height - centerY) / vertical;
    camera.updateProjectionMatrix();
    const ratio = currentPixelRatio();
    if (ratio !== pixelRatio || box.width !== size.width || box.height !== size.height) {
      pixelRatio = ratio;
      size = { width: box.width, height: box.height };
      renderer.setPixelRatio(ratio);
      renderer.setSize(box.width, box.height, false);
    }
    dirty = true;
    return true;
  };

  const resizeObserver = typeof window.ResizeObserver === "function"
    ? new window.ResizeObserver(() => { layoutDirty = true; dirty = true; })
    : null;
  const onResize = () => { layoutDirty = true; dirty = true; };
  window.addEventListener("resize", onResize, { passive: true });
  const onMotionChange = () => { reducedMotion = motionQuery.matches === true; dirty = true; };
  motionQuery?.addEventListener?.("change", onMotionChange);

  const fail = (reason) => {
    if (disposed) return;
    onFailure?.(reason);
  };
  const onContextLost = (event) => {
    event.preventDefault();
    fail("webgl-context-lost");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  // Presentation clock: wall time, except that a probe may freeze it (with the
  // match clock stopped) to inspect one instant, e.g. a projectile mid-flight.
  let clockScale = 1;
  let clockBase = 0;
  let clockAnchor = null;
  const presentationNow = (wall = window.performance.now()) => {
    if (clockAnchor === null) clockAnchor = wall;
    if (wall > clockAnchor) {
      clockBase += (wall - clockAnchor) * clockScale;
      clockAnchor = wall;
    }
    return clockBase;
  };

  const render = (wallNow) => {
    const now = presentationNow(wallNow);
    frameHandle = window.requestAnimationFrame(render);
    if (disposed || shell === null || document.visibilityState === "hidden") return;
    if (layoutDirty || currentPixelRatio() !== pixelRatio) {
      if (!layout()) return;
    }
    const began = window.performance.now();
    const dt = lastFrameAt === null ? 0 : Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    const towerMotion = towers.animate(now);
    const unitMotion = units.animate(now, dt);
    const effectMotion = effects.animate(now, dt);
    const ambient = !reducedMotion;
    if (!dirty && !ambient && !towerMotion && !unitMotion && !effectMotion) return;
    terrain.water.uTime.value = reducedMotion ? 0 : now / 1000;
    if (unitMotion && now - lastShadowAt >= SHADOW_REFRESH_MS) shadowsDirty = true;
    if (towers.consumeShadowsDirty() || shadowsDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowsDirty = false;
      lastShadowAt = now;
    }
    try {
      renderer.render(scene, camera);
    } catch (error) {
      fail(error);
      return;
    }
    dirty = false;
    timing.render[timing.renders++ % timing.render.length] = window.performance.now() - began;
  };

  return {
    element: container,
    mount(nextShell) {
      if (disposed) return;
      if (shell !== null && resizeObserver) resizeObserver.disconnect();
      shell = nextShell;
      shell.insertBefore(container, shell.firstChild);
      if (resizeObserver) {
        resizeObserver.observe(container);
        const arena = shell.querySelector('[data-ui="arena"]');
        if (arena) resizeObserver.observe(arena);
      }
      layoutDirty = true;
      dirty = true;
      shadowsDirty = true;
      // A new battle (restart, deck change) starts from an empty board.
      units.reset();
      effects.reset();
      if (frameHandle === 0) frameHandle = window.requestAnimationFrame(render);
    },
    /** Observe one committed UI frame (read-only) plus its animation hints. */
    update(frame, hints = null) {
      if (disposed) return;
      const now = presentationNow();
      const began = window.performance.now();
      const combatView = frame.combat;
      towers.update(combatView.towers, now);
      towerRecords = new Map(combatView.towers.filter((tower) => !tower.destroyed)
        .map((tower) => [tower.id, tower]));
      units.sync(combatView, hints, now, frame.source ?? null);
      if (frame.effects) effects.sync(frame.effects, hints, now, frame.source ?? null);
      dirty = true;
      timing.update[timing.updates++ % timing.update.length] = window.performance.now() - began;
    },
    /**
     * Compile every shader, upload textures and render one off-screen frame
     * (shadow pass included) before the match clock starts, in short tasks.
     */
    async warm(frame) {
      if (disposed) return;
      const yieldTask = () => new Promise((resolve) => window.setTimeout(resolve, 0));
      const start = presentationNow();
      if (frame?.combat) towers.update(frame.combat.towers, start);
      await yieldTask();
      if (disposed) return;
      const warmGroup = new Group();
      warmGroup.name = "warm-up";
      const created = units.prewarm();
      created.forEach((model, index) => {
        model.object.position.set(-8 + (index % 12) * 1.4, 0, -20 + Math.floor(index / 12) * 3);
        model.setPose(index % 3 === 0 ? "walk" : "attack");
        model.setPose("hit");
        model.update(0.02);
        warmGroup.add(model.object);
      });
      scene.add(warmGroup);
      const endShowcase = effects.showcase(start);
      await yieldTask();
      if (disposed) return;
      for (const texture of terrain.textures ?? []) renderer.initTexture(texture);
      await yieldTask();
      if (disposed) return;
      try {
        await renderer.compileAsync(scene, camera);
      } catch {}
      if (disposed) return;
      await yieldTask();
      if (disposed) return;
      if (size.width === 0) renderer.setSize(360, 640, false);
      renderer.shadowMap.needsUpdate = true;
      try { renderer.render(scene, camera); } catch {}
      await yieldTask();
      if (disposed) return;
      for (const model of created) {
        model.setPose("idle");
        units.release(model);
      }
      warmGroup.removeFromParent();
      endShowcase();
      shadowsDirty = true;
      dirty = true;
    },
    get stats() {
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs?.length ?? 0,
        units: units.liveCount,
        effects: effects.activeCount,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameHandle !== 0) window.cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", onResize);
      motionQuery?.removeEventListener?.("change", onMotionChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      terrain.dispose();
      towers.dispose();
      units.dispose();
      effects.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      container.remove();
      shell = null;
    },
  };
}
