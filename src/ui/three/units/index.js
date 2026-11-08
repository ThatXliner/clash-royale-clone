// Procedural low-poly model kit for every unit, structure and spell prop.
//
// createUnitModel(kind, side) returns a self-animating Object3D:
// - 1 world unit = 1 tile; origin at the ground contact point (flyers are
//   lifted inside the object, origin stays on the ground beneath them);
//   faces +Z by default.
// - Models are true-proportioned. The battlefield stretches ground depth by
//   1/sin(47°) so tiles read square under its 47° orthographic camera, but it
//   does NOT stretch its towers, and units must match the towers: place a
//   model at boardToWorld(x, y) with a uniform scale. Footprints and team
//   rings then foreshorten to sin(47°) on screen exactly like tower bases.
//   Do not counter-scale model z (it would shear under facing rotation).
// - Each model draws one skinned lit mesh (+ its shadow pass), an optional
//   unlit glow mesh, and a team ring (+ a shadow blob for flyers and small
//   units, which skip shadow casting): at most 6 draw calls.
// - Baked geometry is cached per kind + side and materials are global; a
//   model owns only its Object3D wrappers and Skeleton, which dispose() frees.
//
// Model API: { object, kind, side, height, layer, radius, parts, pose,
//   setPose(pose, { duration }), update(dt) -> deathFinished, setTimeScale(s),
//   attackSeconds, attackStrike, setHidden(hidden, { immediate }), dispose() }.
// setPose("attack", { duration }) stretches the one-shot attack clip to the
// sim's attack cadence; the blow lands at attackStrike * duration.
// setPose("death", { fall }) topples a ground unit "back" (default), "left" or
// "right" in its own frame; the battlefield picks the one that reads across
// the screen under its tilted camera.
import { MeshBasicMaterial, Group, Mesh } from "../three-module.js";
import {
  assertSide, bakeModel, createBuilder, disposeKitCaches, drawCallCount, G, overlayMaterial, TEAM_COLORS, triangleCount,
} from "./kit.js";
import { createRig, UNIT_POSES } from "./rig.js";
import { GROUND_DESIGNS } from "./designs-ground.js";
import { AIR_DESIGNS } from "./designs-air.js";
import { EFFECT_DESIGNS, STRUCTURE_DESIGNS } from "./designs-structures.js";

const UNIT_DESIGNS = Object.freeze({ ...GROUND_DESIGNS, ...AIR_DESIGNS, ...STRUCTURE_DESIGNS });

export const UNIT_MODEL_KINDS = Object.freeze(Object.keys(UNIT_DESIGNS));
export const EFFECT_MODEL_KINDS = Object.freeze(Object.keys(EFFECT_DESIGNS));
export { UNIT_POSES, TEAM_COLORS };

function teamRingMaterial(side) {
  return overlayMaterial(`team-ring:${side}`, () => new MeshBasicMaterial({
    color: TEAM_COLORS[side].main,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }));
}

function shadowMaterial() {
  return overlayMaterial("shadow-blob", () => new MeshBasicMaterial({
    color: "#10181C",
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }));
}

function build(kind, design, side, reducedMotion) {
  assertSide(side);
  if (typeof reducedMotion !== "boolean") throw new TypeError("reducedMotion must be a boolean");
  const object = new Group();
  object.name = `unit:${kind}:${side}`;
  const scale = design.scale ?? 1;
  const scaler = new Group();
  scaler.name = "scaler";
  scaler.scale.setScalar(scale);
  const mover = new Group();
  mover.name = "mover";
  const lift = new Group();
  lift.name = "lift";
  lift.position.y = design.hover ?? 0;
  object.add(scaler);
  scaler.add(mover);
  mover.add(lift);

  const blob = design.motion === "flyer" || design.blob === true;
  const b = createBuilder(side);
  b.group("body", lift);
  design.build(b);
  const { meshes, skeleton } = bakeModel({
    kind, side, host: mover, root: object, joints: b.joints, parts: b.parts, castShadow: !blob,
  });

  let teamRing = null;
  if (design.layer !== "effect") {
    const ringRadius = (blob ? design.shadowRadius ?? design.radius : design.radius) * scale *
      (design.layer === "structure" ? 1.02 : 1);
    teamRing = new Mesh(G.ring(design.layer === "structure" ? 0.86 : blob ? 0.74 : 0.7), teamRingMaterial(side));
    teamRing.name = "team-ring";
    teamRing.scale.set(ringRadius, 1, ringRadius);
    teamRing.userData.baseRadius = ringRadius;
    teamRing.position.y = 0.012;
    teamRing.renderOrder = 1;
    object.add(teamRing);
  }
  let shadow = null;
  if (blob) {
    shadow = new Mesh(G.disc(16), shadowMaterial());
    shadow.name = "shadow-blob";
    shadow.position.y = 0.008;
    shadow.renderOrder = 1;
    object.add(shadow);
  }

  const rig = createRig({
    design: { ...design, side, joints: b.joints, shadowRadius: (design.shadowRadius ?? design.radius) * scale },
    frame: { mover, lift, shadow, teamRing },
    meshes,
    reducedMotion,
  });
  object.userData.unitModel = { kind, side, layer: design.layer };
  rig.setPose("deploy");
  rig.update(0);

  let disposed = false;
  return {
    object,
    kind,
    side,
    height: design.height * scale,
    layer: design.layer,
    radius: design.radius * scale,
    parts: Object.freeze({ teamRing, shadow, body: b.joints.body, meshes: Object.freeze([...meshes]) }),
    get pose() { return rig.pose; },
    get triangles() { return triangleCount(object); },
    get drawCalls() { return drawCallCount(object); },
    get attackSeconds() { return rig.attackSeconds; },
    attackStrike: rig.attackStrike,
    setPose(pose, options) {
      if (disposed) throw new Error("unit model is disposed");
      rig.setPose(pose, options);
    },
    update(dtSeconds) {
      if (disposed) return true;
      return rig.update(dtSeconds);
    },
    setTimeScale(timeScale) {
      rig.setTimeScale(timeScale);
    },
    // Only buried-coil has a hidden state; other kinds ignore it.
    setHidden(hidden, options) {
      rig.setHidden(hidden, options);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      object.clear();
      skeleton.dispose();
    },
  };
}

/** Static placement facts for a kind, without building a model. */
export function unitDesignInfo(kind) {
  const design = Object.hasOwn(UNIT_DESIGNS, kind) ? UNIT_DESIGNS[kind]
    : Object.hasOwn(EFFECT_DESIGNS, kind) ? EFFECT_DESIGNS[kind] : null;
  if (design === null) throw new RangeError(`no unit model for kind ${String(kind)}`);
  const scale = design.scale ?? 1;
  return Object.freeze({
    attack: design.attack ?? "none",
    height: design.height * scale,
    hover: (design.hover ?? 0) * scale,
    layer: design.layer,
    motion: design.motion,
    radius: design.radius * scale,
  });
}

export function createUnitModel(kind, side, { reducedMotion = false } = {}) {
  if (typeof kind !== "string" || !Object.hasOwn(UNIT_DESIGNS, kind)) {
    throw new RangeError(`no unit model for kind ${String(kind)}`);
  }
  return build(kind, UNIT_DESIGNS[kind], side, reducedMotion);
}

// Spell props (cards with no field entity), same interface; layer "effect".
export function createEffectModel(kind, side, { reducedMotion = false } = {}) {
  if (typeof kind !== "string" || !Object.hasOwn(EFFECT_DESIGNS, kind)) {
    throw new RangeError(`no effect model for kind ${String(kind)}`);
  }
  return build(kind, EFFECT_DESIGNS[kind], side, reducedMotion);
}

export function disposeUnitModelCaches() {
  disposeKitCaches();
}
