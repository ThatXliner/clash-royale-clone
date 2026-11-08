// Procedural low-poly model kit for every unit, structure and spell prop.
//
// createUnitModel(kind, side) returns a self-animating THREE.Object3D:
// 1 world unit = 1 tile, origin at the ground contact point (flyers are
// lifted inside the object, origin stays on the ground beneath them), facing
// +Z. Geometry and materials are shared through module caches; a model owns
// only its Object3D wrappers, so dispose() never frees shared resources.
import * as THREE from "three";
import {
  assertSide, createBuilder, disposeKitCaches, G, mergeStaticMeshes, overlayMaterial, TEAM_COLORS, triangleCount,
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
  return overlayMaterial(`team-ring:${side}`, () => new THREE.MeshBasicMaterial({
    color: TEAM_COLORS[side].main,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }));
}

function shadowMaterial() {
  return overlayMaterial("shadow-blob", () => new THREE.MeshBasicMaterial({
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
  const object = new THREE.Group();
  object.name = `unit:${kind}:${side}`;
  const scale = design.scale ?? 1;
  const scaler = new THREE.Group();
  scaler.name = "scaler";
  scaler.scale.setScalar(scale);
  const mover = new THREE.Group();
  mover.name = "mover";
  const lift = new THREE.Group();
  lift.name = "lift";
  lift.position.y = design.hover ?? 0;
  object.add(scaler);
  scaler.add(mover);
  mover.add(lift);

  const b = createBuilder(side);
  b.group("body", lift);
  design.build(b);
  const meshes = mergeStaticMeshes(kind, lift, b.joints, b.meshes);
  // Flyers rely on the shadow blob; a cast shadow lands far off to the side.
  if (design.motion === "flyer") for (const mesh of meshes) mesh.castShadow = false;

  let teamRing = null;
  if (design.layer === "ground" || design.layer === "structure") {
    const ringRadius = (design.layer === "structure" ? design.radius * 1.02 : design.radius) * scale;
    teamRing = new THREE.Mesh(G.ring(design.layer === "structure" ? 0.86 : 0.7), teamRingMaterial(side));
    teamRing.name = "team-ring";
    teamRing.scale.set(ringRadius, 1, ringRadius);
    teamRing.userData.baseRadius = ringRadius;
    teamRing.position.y = 0.012;
    teamRing.renderOrder = 1;
    object.add(teamRing);
  }
  let shadow = null;
  if (design.motion === "flyer") {
    shadow = new THREE.Mesh(G.disc(16), shadowMaterial());
    shadow.name = "shadow-blob";
    shadow.position.y = 0.008;
    shadow.userData.baseRadius = (design.shadowRadius ?? design.radius) * scale;
    shadow.renderOrder = 1;
    object.add(shadow);
  }

  const frame = { mover, lift, shadow, teamRing };
  const rig = createRig({
    design: { ...design, joints: b.joints, shadowRadius: (design.shadowRadius ?? design.radius) * scale },
    frame,
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
    parts: Object.freeze({ teamRing, shadow, body: b.joints.body }),
    get pose() { return rig.pose; },
    get triangles() { return triangleCount(object); },
    setPose(pose) {
      if (disposed) throw new Error("unit model is disposed");
      rig.setPose(pose);
    },
    update(dtSeconds) {
      if (disposed) return true;
      return rig.update(dtSeconds);
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
    },
  };
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
