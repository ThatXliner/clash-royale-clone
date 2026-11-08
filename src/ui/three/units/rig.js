// Procedural pose clips shared by every unit design. Each frame the rig
// resets joints to their rest transform, then layers the base pose, the hit
// overlay, and the design's own flourish on top. All motion is a pure
// function of the clip clock, so the same dt sequence gives the same frame.
import { flashMaterial } from "./kit.js";

export const UNIT_POSES = Object.freeze(["idle", "walk", "attack", "hit", "death", "deploy"]);

const TAU = Math.PI * 2;
const DEPLOY_SECONDS = 0.5;
const HIT_SECONDS = 0.3;
const FLASH_SECONDS = 0.12;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t * t * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function easeOutBack(t) {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
// 0→1 over [a,b]
const span = (t, a, b) => clamp01((t - a) / (b - a));

function captureRest(joints) {
  const rest = new Map();
  for (const joint of Object.values(joints)) {
    rest.set(joint, {
      position: joint.position.clone(),
      rotation: joint.rotation.clone(),
      scale: joint.scale.clone(),
    });
  }
  return rest;
}

function resetToRest(rest) {
  for (const [joint, pose] of rest) {
    joint.position.copy(pose.position);
    joint.rotation.copy(pose.rotation);
    joint.scale.copy(pose.scale);
  }
}

// Attack timing (seconds) and the normalised strike moment per style.
const ATTACK = Object.freeze({
  swing: { seconds: 0.62, strike: 0.5 },
  slam: { seconds: 0.8, strike: 0.55 },
  thrust: { seconds: 0.5, strike: 0.45 },
  shoot: { seconds: 0.55, strike: 0.35 },
  lob: { seconds: 0.75, strike: 0.45 },
  spin: { seconds: 0.7, strike: 0.5 },
  bash: { seconds: 0.6, strike: 0.45 },
  dive: { seconds: 0.6, strike: 0.5 },
  arc: { seconds: 0.7, strike: 0.45 },
  pulse: { seconds: 0.7, strike: 0.4 },
  none: { seconds: 0.5, strike: 0.5 },
});

export function attackTiming(style) {
  return ATTACK[style] ?? ATTACK.swing;
}

export function createRig({ design, frame, meshes, reducedMotion }) {
  const j = design.joints;
  const rest = captureRest({ ...j, mover: frame.mover, lift: frame.lift });
  const amp = reducedMotion ? 0.25 : 1;
  const motion = design.motion;
  const timing = attackTiming(design.attack);
  const deathSeconds = design.layer === "structure" ? 1.2 : 1.05;
  const h = design.height;
  const hover = design.hover ?? 0;
  const state = {
    pose: "deploy",
    t: 0,
    clock: 0,
    hitT: Infinity,
    flashing: false,
    deathDone: false,
    hidden: design.hidden === true ? false : null,
    hiddenAmount: 0,
    attackSeconds: timing.seconds,
    timeScale: 1,
    fall: 0,
  };
  const jointList = Object.values(j);
  for (const mesh of meshes) mesh.userData.baseMaterial = mesh.material;

  function setFlash(on) {
    if (on === state.flashing) return;
    state.flashing = on;
    for (const mesh of meshes) {
      if (mesh.userData.noFlash) continue;
      mesh.material = on ? flashMaterial(mesh.userData.baseMaterial, design.side) : mesh.userData.baseMaterial;
    }
  }

  function legsAndArms(phase, swing, armSwing) {
    if (j.legL) j.legL.rotation.x += Math.sin(phase) * swing;
    if (j.legR) j.legR.rotation.x -= Math.sin(phase) * swing;
    if (j.armL) j.armL.rotation.x -= Math.sin(phase) * armSwing;
    if (j.armR && design.attack !== "shoot" && design.attack !== "lob") {
      j.armR.rotation.x += Math.sin(phase) * armSwing;
    }
  }

  function flap(rate, angle, offset = 0.25) {
    const a = (Math.sin(state.clock * TAU * rate) * angle + offset) * (reducedMotion ? 0.4 : 1);
    if (j.wingL) j.wingL.rotation.z += a;
    if (j.wingR) j.wingR.rotation.z -= a;
  }

  function idle(t) {
    const breathe = Math.sin(t * TAU * 0.7) * amp;
    if (motion === "flyer") {
      j.body.position.y += Math.sin(t * TAU * 0.55) * 0.06 * amp;
      j.body.rotation.z += Math.sin(t * TAU * 0.4) * 0.05 * amp;
      flap(design.flapRate ?? 2.2, 0.45);
    } else if (motion === "structure") {
      j.body.scale.y *= 1 + breathe * 0.008;
    } else if (motion === "hopper") {
      const hop = Math.abs(Math.sin(t * TAU * 0.9)) * 0.04 * amp;
      j.body.position.y += hop;
      j.body.scale.y *= 1 + breathe * 0.04;
    } else {
      j.body.position.y += breathe * 0.012 * h;
      if (j.head) j.head.rotation.z += Math.sin(t * TAU * 0.35) * 0.05 * amp;
      if (j.armL) j.armL.rotation.z += breathe * 0.04;
      if (j.armR) j.armR.rotation.z -= breathe * 0.04;
    }
  }

  function walk(t) {
    const rate = design.walkRate ?? 1.6;
    const phase = t * TAU * rate;
    if (motion === "flyer") {
      j.body.position.y += Math.sin(t * TAU * 0.9) * 0.05 * amp;
      j.body.rotation.x += 0.18 * amp;
      flap((design.flapRate ?? 2.2) * 1.5, 0.6);
    } else if (motion === "structure") {
      idle(t);
    } else if (motion === "hopper") {
      const hop = Math.abs(Math.sin(phase)) * 0.14 * h * amp;
      j.body.position.y += hop;
      j.body.rotation.x += 0.12 * amp;
      j.body.rotation.z += Math.sin(phase) * 0.12 * amp;
      legsAndArms(phase, 0.7 * amp, 0.5 * amp);
    } else {
      j.body.position.y += Math.abs(Math.sin(phase)) * 0.05 * h * amp;
      j.body.rotation.x += 0.1 * amp;
      j.body.rotation.z += Math.sin(phase) * 0.04 * amp;
      legsAndArms(phase, 0.75 * amp, 0.5 * amp);
    }
  }

  function attack(t) {
    const u = clamp01(t / state.attackSeconds);
    const s = timing.strike;
    const wind = easeInOut(span(u, 0, s * 0.85));
    const hit = easeOutCubic(span(u, s * 0.85, s));
    const back = easeInOut(span(u, s + 0.12, 1));
    // pre-strike (0..1), strike (0..1), settle (0..1)
    const k = amp;
    switch (design.attack) {
      case "swing": {
        const arm = -2.7 * wind * (1 - hit) + -0.5 * hit * (1 - back);
        if (j.armR) j.armR.rotation.x += arm * k;
        j.body.rotation.x += (-0.15 * wind * (1 - hit) + 0.25 * hit * (1 - back)) * k;
        j.body.position.z += 0.12 * h * hit * (1 - back) * k;
        j.body.rotation.y += (0.35 * wind * (1 - hit) - 0.25 * hit * (1 - back)) * k;
        break;
      }
      case "slam": {
        const arms = -2.9 * wind * (1 - hit) + -0.6 * hit * (1 - back);
        if (j.armR) j.armR.rotation.x += arms * k;
        if (j.armL) j.armL.rotation.x += arms * k;
        j.body.rotation.x += (-0.25 * wind * (1 - hit) + 0.35 * hit * (1 - back)) * k;
        j.body.scale.y *= 1 + (0.06 * wind * (1 - hit) - 0.1 * hit * (1 - back)) * k;
        j.body.position.y += 0.08 * h * wind * (1 - hit) * k;
        break;
      }
      case "thrust": {
        if (j.armR) j.armR.rotation.x += (-0.6 * wind - 0.9 * hit * (1 - back)) * k;
        j.body.position.z += (-0.06 * wind + 0.3 * hit) * (1 - back) * h * k;
        j.body.rotation.x += 0.25 * hit * (1 - back) * k;
        break;
      }
      case "bash": {
        if (j.armL) j.armL.rotation.x += (-0.4 * wind - 0.9 * hit * (1 - back)) * k;
        if (j.armR) j.armR.rotation.x += -2.2 * wind * (1 - hit) * k + -0.6 * hit * (1 - back) * k;
        j.body.position.z += (-0.08 * wind + 0.28 * hit) * (1 - back) * h * k;
        j.body.rotation.x += (-0.1 * wind + 0.2 * hit) * (1 - back) * k;
        break;
      }
      case "shoot": {
        const kick = hit * (1 - back);
        j.body.position.z -= 0.08 * h * kick * k;
        j.body.rotation.x -= 0.12 * kick * k;
        if (j.armR) j.armR.rotation.x -= 0.25 * kick * k;
        if (j.weapon) j.weapon.position.z -= 0.06 * kick * k;
        break;
      }
      case "lob": {
        const kick = hit * (1 - back);
        j.body.scale.y *= 1 - 0.08 * wind * (1 - hit) * k + 0.05 * kick * k;
        j.body.rotation.x -= 0.2 * kick * k;
        if (j.weapon) j.weapon.rotation.x -= (0.25 * wind * (1 - hit) + 0.35 * kick) * k;
        break;
      }
      case "spin": {
        j.body.rotation.y += TAU * easeInOut(span(u, s * 0.5, s + 0.25)) * (reducedMotion ? 0 : 1);
        j.body.position.y += 0.06 * h * Math.sin(Math.PI * span(u, s * 0.5, s + 0.25)) * k;
        if (j.armR) j.armR.rotation.z -= 1.2 * Math.sin(Math.PI * span(u, s * 0.4, s + 0.3)) * k;
        break;
      }
      case "dive": {
        const dip = hit * (1 - back);
        j.body.position.z += (-0.1 * wind + 0.45 * dip) * k;
        j.body.position.y += (0.12 * wind - 0.4 * dip) * k;
        j.body.rotation.x += (-0.3 * wind + 0.7 * dip) * k;
        flap(4, 0.7);
        break;
      }
      case "arc": {
        const kick = hit * (1 - back);
        if (j.armR) j.armR.rotation.x += (-2.4 * wind * (1 - hit) - 1.8 * kick) * k;
        j.body.position.z -= 0.04 * h * kick * k;
        break;
      }
      case "pulse": {
        const kick = hit * (1 - back);
        j.body.scale.y *= 1 - 0.1 * wind * (1 - hit) * k + 0.08 * kick * k;
        j.body.scale.x *= 1 + 0.05 * wind * (1 - hit) * k;
        j.body.scale.z *= 1 + 0.05 * wind * (1 - hit) * k;
        if (j.weapon) j.weapon.rotation.x -= (0.3 * wind * (1 - hit) - 0.25 * kick) * k;
        break;
      }
      default:
        break;
    }
    if (motion === "flyer" && design.attack !== "dive") flap(3, 0.5);
    else if (motion !== "flyer") idleFeet();
    return { wind, hit, back, u };
  }

  function idleFeet() {
    // Planted stance while striking.
    if (j.legL) j.legL.rotation.x -= 0.15 * amp;
    if (j.legR) j.legR.rotation.x += 0.2 * amp;
  }

  function deploy(t) {
    const u = clamp01(t / DEPLOY_SECONDS);
    const grow = reducedMotion ? easeOutCubic(u) : easeOutBack(u);
    const m = frame.mover;
    if (design.layer === "structure") {
      m.scale.set(0.6 + 0.4 * grow, Math.max(0.001, grow), 0.6 + 0.4 * grow);
      m.position.y -= (1 - easeOutCubic(u)) * 0.3;
    } else {
      m.scale.setScalar(Math.max(0.001, grow));
      m.position.y += (1 - easeOutCubic(u)) * (motion === "flyer" ? 1.2 : 0.7) * (reducedMotion ? 0.3 : 1);
    }
    if (motion === "flyer") flap(4, 0.6);
  }

  function death(t) {
    const u = clamp01(t / deathSeconds);
    const m = frame.mover;
    if (design.layer === "structure") {
      const shake = (1 - span(u, 0, 0.35)) * Math.sin(t * TAU * 14) * 0.05 * amp;
      m.position.x += shake;
      m.rotation.z += 0.12 * easeInCubic(span(u, 0.15, 0.7)) * amp;
      const crush = easeInCubic(span(u, 0.2, 0.85));
      m.scale.set(1 + 0.15 * crush, Math.max(0.001, 1 - 0.9 * crush), 1 + 0.15 * crush);
      m.position.y -= 0.15 * crush;
      const gone = easeInCubic(span(u, 0.8, 1));
      m.scale.multiplyScalar(Math.max(0.001, 1 - gone));
      return u >= 1;
    }
    if (motion === "flyer") {
      const fall = easeInCubic(span(u, 0, 0.5));
      frame.lift.position.y -= hover * fall;
      j.body.rotation.z += 2.4 * fall * amp;
      j.body.rotation.x += 0.6 * fall * amp;
      flap(6, 0.9 * (1 - fall));
    } else {
      const topple = easeInCubic(span(u, 0, 0.42));
      const angle = (Math.PI / 2) * 0.92 * topple * (reducedMotion ? 0.3 : 1);
      // fall 0 topples backward (local -Z); right/left topple toward local -X/+X
      // (the model faces +Z, so its right hand is -X). Placement uses this to
      // keep every fall across the screen, never along the view direction.
      if (state.fall === 0) m.rotation.x -= angle;
      else m.rotation.z += state.fall * angle;
      m.position.y += Math.sin(Math.PI * span(u, 0, 0.3)) * 0.12 * h * amp;
      if (j.armL) j.armL.rotation.z += 0.8 * topple * amp;
      if (j.armR) j.armR.rotation.z -= 0.8 * topple * amp;
    }
    const gone = easeInCubic(span(u, 0.55, 1));
    m.scale.multiplyScalar(Math.max(0.001, 1 - gone));
    m.position.y -= 0.2 * gone;
    return u >= 1;
  }

  function hitOverlay(t) {
    const u = clamp01(t / HIT_SECONDS);
    if (u >= 1) return;
    const k = (1 - easeOutCubic(u)) * amp;
    if (design.layer === "structure") {
      j.body.position.x += Math.sin(t * TAU * 18) * 0.03 * k;
      j.body.scale.y *= 1 - 0.04 * k;
    } else {
      j.body.position.z -= 0.1 * h * k;
      j.body.rotation.x -= 0.25 * k;
      j.body.scale.y *= 1 - 0.1 * k;
      j.body.scale.x *= 1 + 0.06 * k;
      j.body.scale.z *= 1 + 0.06 * k;
    }
  }

  function apply() {
    resetToRest(rest);
    const t = state.t;
    let attackInfo = null;
    let pose = state.pose;
    if (pose === "deploy") {
      idle(state.clock);
      deploy(t);
    } else if (pose === "idle") idle(t);
    else if (pose === "walk") walk(t);
    else if (pose === "attack") {
      if (t <= state.attackSeconds) attackInfo = attack(t);
      else {
        pose = "idle";
        idle(t);
      }
    } else if (pose === "death") {
      state.deathDone = death(t);
    }
    if (state.hitT < HIT_SECONDS && pose !== "death") hitOverlay(state.hitT);
    setFlash(state.hitT < FLASH_SECONDS && pose !== "death");
    design.animate?.({
      joints: j, pose, t, clock: state.clock, amp, attack: attackInfo, reducedMotion,
      hiddenAmount: state.hiddenAmount,
    });
    // Parts are skinned to bones, so a hidden joint collapses instead.
    for (const joint of jointList) {
      if (joint.visible === false) joint.scale.setScalar(1e-4);
    }
    if (frame.teamRing) {
      const r = frame.teamRing.userData.baseRadius * Math.min(1, frame.mover.scale.x);
      frame.teamRing.scale.set(r, 1, r);
      frame.teamRing.visible = frame.mover.visible && frame.mover.scale.x > 0.02;
    }
    if (frame.shadow) {
      const altitude = Math.max(0, frame.lift.position.y + j.body.position.y) * frame.mover.scale.y * (design.scale ?? 1);
      const s = design.shadowRadius * (1 - Math.min(0.45, altitude * 0.12)) * frame.mover.scale.x;
      frame.shadow.scale.set(s, 1, s);
    }
  }

  return {
    get pose() { return state.pose; },
    setPose(pose, { duration, fall } = {}) {
      if (!UNIT_POSES.includes(pose)) throw new RangeError(`unknown unit pose ${String(pose)}`);
      if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) {
        throw new RangeError("pose duration must be a positive number of seconds");
      }
      if (fall !== undefined && fall !== "back" && fall !== "left" && fall !== "right") {
        throw new RangeError("death fall must be back, left or right");
      }
      if (pose === "death") state.fall = fall === "right" ? 1 : fall === "left" ? -1 : 0;
      if (pose === "attack") state.attackSeconds = duration ?? timing.seconds;
      if (pose === "hit") {
        if (state.pose === "death") return;
        state.hitT = 0;
      } else {
        state.pose = pose;
        state.t = 0;
        state.deathDone = false;
        if (pose !== "death") {
          frame.mover.visible = true;
          if (frame.shadow) frame.shadow.visible = true;
        }
      }
      apply();
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("unit update dt must be a finite non-negative number");
      dt *= state.timeScale;
      state.t += dt;
      state.clock += dt;
      state.hitT += dt;
      if (state.hidden !== null) {
        const target = state.hidden ? 1 : 0;
        const step = dt * (reducedMotion ? 6 : 2.5);
        state.hiddenAmount += Math.max(-step, Math.min(step, target - state.hiddenAmount));
      }
      if (state.pose === "deploy" && state.t >= DEPLOY_SECONDS) {
        state.pose = "idle";
        state.t -= DEPLOY_SECONDS;
      }
      apply();
      if (state.pose === "death" && state.deathDone) {
        frame.mover.visible = false;
        if (frame.teamRing) frame.teamRing.visible = false;
        if (frame.shadow) frame.shadow.visible = false;
        return true;
      }
      return false;
    },
    setHidden(hidden, { immediate = false } = {}) {
      if (typeof hidden !== "boolean") throw new TypeError("unit hidden state must be a boolean");
      if (state.hidden === null) return;
      state.hidden = hidden;
      if (immediate) state.hiddenAmount = hidden ? 1 : 0;
      apply();
    },
    setTimeScale(scale) {
      if (!Number.isFinite(scale) || scale < 0) throw new RangeError("unit time scale must be a finite non-negative number");
      state.timeScale = scale;
    },
    apply,
    deathSeconds,
    get attackSeconds() { return state.attackSeconds; },
    attackStrike: timing.strike,
    setFlash,
  };
}
