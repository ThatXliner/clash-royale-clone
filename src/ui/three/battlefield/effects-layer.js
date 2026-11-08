// Projectiles, impacts and spell areas on the 3D battlefield.
//
// The simulation's combat-effect feed is the only source: each new feed
// record (projectile launch, melee contact, area impact) spawns a short-lived
// visual that then runs on the wall clock. The feed is append-only, so the
// layer remembers the last record it consumed and never replays history.
// Sim projectiles often resolve within a few ticks; their visuals keep a
// minimum flight time so a shot reads as a shot without touching the sim.
import {
  CircleGeometry,
  Color,
  DodecahedronGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  RingGeometry,
  ShapeGeometry,
  Shape,
  Vector3,
} from "../three-module.js";
import { createEffectModel } from "../units/index.js";
import { createFadingInstances } from "./fading-instances.js";
import { TEAM } from "./palette.js";

const MAX_PROJECTILES = 192;
const MAX_BURSTS = 192;
const MAX_WAVES = 64;
const MAX_DECALS = 8;
const TICKS_PER_SECOND = 60;
const TOWER_MUZZLE = Object.freeze({ central: 7.0, lane: 6.0 });
const TOWER_BODY = Object.freeze({ central: 2.6, lane: 2.3 });

const STYLE_SPEED = Object.freeze({ bolt: 21, heavy: 18, orb: 15, lob: 10, pellet: 24 });

function rationalPoint(point) {
  const denominator = Number(point.denominator);
  return { tx: Number(point.xNumerator) / denominator / 1000, ty: Number(point.yNumerator) / denominator / 1000 };
}

function starShape(points, inner) {
  const shape = new Shape();
  for (let index = 0; index < points * 2; index += 1) {
    const angle = (index / (points * 2)) * Math.PI * 2;
    const radius = index % 2 === 0 ? 1 : inner;
    const x = Math.sin(angle) * radius;
    const y = Math.cos(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/**
 * @param {{ toWorld, elevation, depthScale, isReducedMotion, units, towerAnchor }} options
 *   units: the unit layer (anchor/nearest/notifyAttack); towerAnchor(id) → tower record or null.
 */
export function createEffectLayer({ toWorld, elevation, depthScale, isReducedMotion, units, towerAnchor }) {
  const group = new Group();
  group.name = "battlefield-effects";
  const disposables = [];
  const keep = (value) => { disposables.push(value); return value; };
  const billboard = new Quaternion().setFromEuler(new Euler(-elevation, 0, 0));
  const flat = new Quaternion();

  const instanced = (name, geometry, material, capacity, order) => {
    const mesh = new InstancedMesh(keep(geometry), keep(material), capacity);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    group.add(mesh);
    return mesh;
  };
  const glowMaterial = () => new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const fading = (options) => {
    const value = createFadingInstances(options);
    disposables.push(value);
    group.add(value.mesh);
    return value;
  };
  const meshes = {
    bolt: instanced("projectile-bolt", new OctahedronGeometry(1, 0), glowMaterial(), MAX_PROJECTILES, 6),
    orb: instanced("projectile-orb", new IcosahedronGeometry(1, 1), glowMaterial(), MAX_PROJECTILES, 6),
    lob: instanced("projectile-lob", new DodecahedronGeometry(1, 0), glowMaterial(), MAX_PROJECTILES, 6),
  };
  const trails = fading({
    name: "projectile-trail", geometry: new OctahedronGeometry(1, 0), capacity: MAX_PROJECTILES, renderOrder: 5,
  });
  const bursts3d = fading({
    name: "impact-burst", geometry: new ShapeGeometry(starShape(8, 0.45)), capacity: MAX_BURSTS, renderOrder: 8,
  });
  const waves3d = fading({
    name: "impact-wave", geometry: new RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), capacity: MAX_WAVES,
    renderOrder: 4, polygonOffset: -3,
  });

  // Spell areas: a tinted ground decal with a crisp rim, a few at a time.
  const decalDisc = keep(new CircleGeometry(1, 48).rotateX(-Math.PI / 2));
  const decalRim = keep(new RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2));
  const decalInner = keep(new RingGeometry(0.5, 0.56, 48).rotateX(-Math.PI / 2));
  const decals = [];
  for (let index = 0; index < MAX_DECALS; index += 1) {
    const holder = new Group();
    holder.visible = false;
    const fill = new Mesh(decalDisc, keep(new MeshBasicMaterial({
      color: 0xffffff, depthWrite: false, opacity: 0.3, toneMapped: false, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })));
    const rim = new Mesh(decalRim, keep(new MeshBasicMaterial({
      color: 0xffffff, depthWrite: false, opacity: 0.9, toneMapped: false, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    })));
    const inner = new Mesh(decalInner, rim.material);
    fill.renderOrder = 2;
    rim.renderOrder = 3;
    inner.renderOrder = 3;
    holder.add(fill, rim, inner);
    group.add(holder);
    decals.push({ holder, fill, rim, inner, active: null });
  }

  const team = {
    south: { glow: new Color(TEAM.south.glow), light: new Color(TEAM.south.light), main: new Color(TEAM.south.main) },
    north: { glow: new Color(TEAM.north.glow), light: new Color(TEAM.north.light), main: new Color(TEAM.north.main) },
  };
  const neutral = { glow: new Color(0xfff0b0), light: new Color(0xfff7dc), main: new Color(0xe9a83a) };
  const ember = new Color(0xffa13a);
  const white = new Color(0xffffff);

  const projectiles = [];
  const bursts = [];
  const waves = [];
  const orbs = [];
  const orbPool = new Map();
  let lastEventId = -1;
  let source = null;
  let clock = 0;
  // Cosmetic variety without ambient randomness: a golden-ratio sequence.
  let variety = 0;
  const nextSpin = () => {
    variety = (variety + 0.6180339887) % 1;
    return variety * Math.PI * 2;
  };
  const seenAreas = new Map();
  const spellSides = new Map();

  const sideColor = (side) => (side === "south" || side === "north" ? team[side] : neutral);

  const world = (tx, ty) => {
    const [x, z] = toWorld(tx, ty);
    return { x, z };
  };

  const sourceAnchor = (sourceId) => {
    if (typeof sourceId === "number") return units.anchor(sourceId);
    if (typeof sourceId === "string") {
      const tower = towerAnchor(sourceId);
      if (tower === null) return null;
      const { x, z } = world(tower.x / 1000, tower.y / 1000);
      return { side: tower.side, x, y: 0, z, height: TOWER_MUZZLE[tower.role] ?? 6, hover: 0, tower: true, role: tower.role };
    }
    return null;
  };

  const spawnBurst = (x, y, z, color, size, duration = 0.32) => {
    if (bursts.length >= MAX_BURSTS) bursts.shift();
    bursts.push({ x, y, z, color: color.clone(), size, start: clock, duration, spin: nextSpin() });
  };
  const spawnWave = (x, y, z, radiusX, radiusZ, color, duration = 0.5) => {
    if (waves.length >= MAX_WAVES) waves.shift();
    waves.push({ x, y, z, radiusX, radiusZ, color: color.clone(), start: clock, duration });
  };

  const launch = (record, now) => {
    const payload = record.payload;
    const origin = sourceAnchor(payload.sourceId);
    const from = rationalPoint(payload.from);
    const fromWorld = world(from.tx, from.ty);
    const side = origin?.side ?? null;
    let style = "bolt";
    if (origin?.tower) style = "heavy";
    else if (origin?.attack === "lob") style = "lob";
    else if (origin?.attack === "arc" || origin?.attack === "pulse") style = "orb";
    if (payload.direction === "pellet") style = "pellet";
    if (payload.direction === "return") style = "orb";
    const launchHeight = origin === null ? 1 : origin.tower ? origin.height
      : origin.layer === "air" ? Math.max(origin.hover, origin.height * 0.55) : origin.height * 0.55;
    const ends = payload.segments.length > 0 ? payload.segments.map(({ to }) => to)
      : payload.to === null ? [] : [payload.to];
    for (const end of ends) {
      const to = rationalPoint(end);
      const toWorldPoint = world(to.tx, to.ty);
      let targetHeight = 0.6;
      if (payload.direction === "unit-to-tower") {
        targetHeight = 2.4;
      } else {
        const target = units.nearest(toWorldPoint.x, toWorldPoint.z);
        if (target !== null) {
          targetHeight = target.layer === "air" ? Math.max(target.hover, target.height * 0.55) : target.height * 0.5;
        }
      }
      const startX = origin?.tower ? origin.x : fromWorld.x;
      const startZ = origin?.tower ? origin.z : fromWorld.z;
      const distance = Math.hypot(toWorldPoint.x - startX, toWorldPoint.z - startZ, targetHeight - launchHeight);
      const simSeconds = Math.max(0, (payload.impactTick - record.tick) / TICKS_PER_SECOND);
      const flight = Math.min(1.1, Math.max(simSeconds, Math.min(0.55, Math.max(0.1, distance / STYLE_SPEED[style]))));
      if (projectiles.length >= MAX_PROJECTILES) projectiles.shift();
      projectiles.push({
        style, side,
        from: new Vector3(startX, launchHeight, startZ),
        to: new Vector3(toWorldPoint.x, targetHeight, toWorldPoint.z),
        arc: style === "lob" ? 0.8 + distance * 0.22 : 0,
        returns: payload.direction === "return",
        start: now, duration: flight * (payload.direction === "return" ? 2 : 1),
        spin: nextSpin(),
      });
    }
  };

  const areaSide = (payload, hints) => {
    if (typeof payload.sourceId === "number") {
      const origin = units.anchor(payload.sourceId);
      if (origin !== null) return origin.side;
    }
    if (payload.effectId !== null && spellSides.has(payload.effectId)) return spellSides.get(payload.effectId).side;
    for (const spell of hints?.spells ?? []) if (spell.effectId === payload.effectId) return spell.side;
    return null;
  };

  const placeArea = (record, hints, now) => {
    const payload = record.payload;
    const center = rationalPoint(payload.from);
    const { x, z } = world(center.tx, center.ty);
    const radius = payload.radius / 1000;
    const side = areaSide(payload, hints);
    const colors = sideColor(side);
    const spell = payload.effectId !== null ? spellSides.get(payload.effectId) ?? null : null;
    const reduced = isReducedMotion();
    // Ground decal.
    const slot = decals.find((decal) => decal.active === null) ??
      decals.reduce((oldest, decal) => (decal.active.start < oldest.active.start ? decal : oldest));
    slot.active = { start: now, duration: reduced ? 0.9 : 1.25, radius };
    slot.holder.position.set(x, 0.02, z);
    slot.holder.visible = true;
    slot.fill.material.color.copy(colors.main);
    slot.rim.material.color.copy(colors.light);
    // Impact: shockwave + bright burst.
    spawnWave(x, 0.05, z, radius, radius * depthScale, colors.glow, reduced ? 0.35 : 0.55);
    spawnBurst(x, 0.9, z, colors.main, Math.min(2.2, 0.7 + radius * 0.45), 0.4);
    if (!reduced) spawnBurst(x, 0.95, z, white, Math.min(1.1, 0.3 + radius * 0.2), 0.2);
    if (spell?.cardId === "squall-orb" || (spell === null && radius >= 2)) {
      const orbSide = side ?? "south";
      const key = `${orbSide}:${reduced}`;
      const model = orbPool.get(key)?.pop() ?? createEffectModel("squall-orb", orbSide, { reducedMotion: reduced });
      model.setPose("attack", { duration: 0.6 });
      model.object.position.set(x, 0, z);
      model.object.scale.setScalar(1.25);
      group.add(model.object);
      orbs.push({ model, key, start: now, x, z });
    }
  };

  const processFeed = (events, hints, now) => {
    if (events.length === 0) return;
    let firstNew = events.length;
    while (firstNew > 0 && events[firstNew - 1].eventId > lastEventId) firstNew -= 1;
    for (let index = firstNew; index < events.length; index += 1) {
      const record = events[index];
      if (record.phase !== "open") continue;
      if (record.type === "projectile") {
        launch(record, now);
        if (typeof record.payload.sourceId === "number") units.notifyAttack(record.payload.sourceId, now);
      } else if (record.type === "area") {
        placeArea(record, hints, now);
      } else if (record.type === "contact") {
        const point = rationalPoint(record.payload.point);
        const { x, z } = world(point.tx, point.ty);
        const target = typeof record.payload.targetId === "number" ? units.anchor(record.payload.targetId) : null;
        const sourceUnit = typeof record.payload.sourceId === "number" ? units.anchor(record.payload.sourceId) : null;
        const height = target === null ? 1.2 : target.layer === "air" ? Math.max(target.hover, target.height * 0.55)
          : target.height * 0.55;
        spawnBurst(target?.x ?? x, height, target?.z ?? z, sideColor(sourceUnit?.side ?? null).light, 0.42, 0.22);
        if (typeof record.payload.sourceId === "number") units.notifyAttack(record.payload.sourceId, now);
      }
    }
    lastEventId = events[events.length - 1].eventId;
  };

  /**
   * @param effects canonical combat-effects view (events = feed records)
   * @param hints   presentation hints (spell casters) or null
   */
  const sync = (effects, hints, now, frameSource = null) => {
    clock = now;
    if (frameSource !== null && frameSource !== source) {
      reset();
      source = frameSource;
      // Never replay a restored or remounted session's history.
      lastEventId = effects.events.length === 0 ? -1 : effects.events[effects.events.length - 1].eventId;
      return;
    }
    for (const spell of hints?.spells ?? []) {
      spellSides.set(spell.effectId, { side: spell.side, cardId: spell.cardId });
    }
    if (spellSides.size > 64) spellSides.delete(spellSides.keys().next().value);
    processFeed(effects.events, hints, now);
    // Splash rings the session derives from projectile impacts.
    for (const area of effects.areas) {
      if (seenAreas.has(area.key)) continue;
      seenAreas.set(area.key, now);
      if (area.key.startsWith("area.")) continue;
      const center = rationalPoint(area.point);
      const { x, z } = world(center.tx, center.ty);
      const radius = area.radius / 1000;
      const match = /^projectile\.[a-z-]+\.([0-9]+)\./u.exec(area.key);
      const origin = match === null ? null : units.anchor(Number(match[1]));
      const colors = sideColor(origin?.side ?? null);
      spawnWave(x, 0.06, z, radius, radius * depthScale, colors.glow, 0.42);
      spawnBurst(x, 0.6, z, ember, Math.min(1.6, 0.5 + radius * 0.4), 0.3);
    }
    if (seenAreas.size > 256) {
      for (const key of seenAreas.keys()) {
        seenAreas.delete(key);
        if (seenAreas.size <= 192) break;
      }
    }
  };

  const tmpMatrix = new Matrix4();
  const tmpPosition = new Vector3();
  const tmpScale = new Vector3();
  const tmpQuaternion = new Quaternion();
  const tmpColor = new Color();
  const forward = new Vector3(0, 0, 1);
  const direction = new Vector3();
  const previous = new Vector3();
  const spinQuaternion = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);
  const zAxis = new Vector3(0, 0, 1);

  const pointAt = (projectile, u, out) => {
    let t = u;
    if (projectile.returns) t = u < 0.5 ? u * 2 : (1 - u) * 2;
    out.lerpVectors(projectile.from, projectile.to, t);
    if (projectile.arc > 0) out.y += Math.sin(Math.PI * t) * projectile.arc;
    return out;
  };

  const animate = (now, dtSeconds) => {
    clock = now;
    const reduced = isReducedMotion();
    const counts = { bolt: 0, orb: 0, lob: 0 };
    let trailCount = 0;
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      const u = (now - projectile.start) / 1000 / projectile.duration;
      if (u >= 1) {
        projectiles.splice(index, 1);
        if (!projectile.returns) {
          const colors = sideColor(projectile.side);
          spawnBurst(projectile.to.x, projectile.to.y, projectile.to.z,
            projectile.style === "lob" ? ember : colors.light,
            projectile.style === "heavy" ? 0.75 : projectile.style === "lob" ? 0.8 : 0.5, 0.26);
        }
        continue;
      }
      const head = pointAt(projectile, Math.max(0, u), tmpPosition);
      pointAt(projectile, Math.max(0, u - 0.06), previous);
      direction.subVectors(head, previous);
      if (direction.lengthSq() < 1e-8) direction.subVectors(projectile.to, projectile.from);
      direction.normalize();
      tmpQuaternion.setFromUnitVectors(forward, direction);
      const colors = sideColor(projectile.side);
      let mesh = meshes.bolt;
      let key = "bolt";
      if (projectile.style === "bolt" || projectile.style === "heavy") {
        const thick = projectile.style === "heavy" ? 0.17 : 0.11;
        tmpScale.set(thick, thick, projectile.style === "heavy" ? 0.7 : 0.5);
        tmpColor.copy(colors.light);
      } else if (projectile.style === "pellet") {
        tmpScale.set(0.08, 0.08, 0.22);
        tmpColor.copy(colors.light);
      } else if (projectile.style === "orb") {
        mesh = meshes.orb;
        key = "orb";
        const pulse = reduced ? 1 : 1 + 0.15 * Math.sin(now / 40 + projectile.spin);
        tmpScale.setScalar(0.2 * pulse);
        tmpColor.copy(colors.glow);
      } else {
        mesh = meshes.lob;
        key = "lob";
        spinQuaternion.setFromAxisAngle(yAxis, now / 120 + projectile.spin);
        tmpQuaternion.multiply(spinQuaternion);
        tmpScale.setScalar(0.24);
        tmpColor.copy(ember);
      }
      tmpMatrix.compose(head, tmpQuaternion, tmpScale);
      mesh.setMatrixAt(counts[key], tmpMatrix);
      mesh.setColorAt(counts[key], tmpColor);
      counts[key] += 1;
      // Streak behind the head, in the shooter's team colour.
      const length = projectile.style === "lob" ? 0.6 : projectile.style === "heavy" ? 1.3 : 0.95;
      tmpQuaternion.setFromUnitVectors(forward, direction);
      tmpPosition.copy(head).addScaledVector(direction, -length * 0.55);
      const width = projectile.style === "heavy" ? 0.15 : 0.1;
      tmpScale.set(width, width, length * 0.55);
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      trails.setAt(trailCount, tmpMatrix, tmpColor.copy(projectile.style === "lob" ? ember : colors.main),
        projectile.style === "lob" ? 0.45 : 0.6);
      trailCount += 1;
    }
    for (const key of ["bolt", "orb", "lob"]) {
      meshes[key].count = counts[key];
      meshes[key].instanceMatrix.needsUpdate = true;
      meshes[key].instanceColor.needsUpdate = true;
    }
    trails.commit(trailCount);

    let burstCount = 0;
    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const burst = bursts[index];
      const u = (now - burst.start) / 1000 / burst.duration;
      if (u >= 1) {
        bursts.splice(index, 1);
        continue;
      }
      const grow = reduced ? 1 : 0.45 + 0.55 * (1 - (1 - u) ** 2);
      spinQuaternion.setFromAxisAngle(zAxis, burst.spin + (reduced ? 0 : u * 0.8));
      tmpQuaternion.copy(billboard).multiply(spinQuaternion);
      tmpPosition.set(burst.x, burst.y, burst.z);
      tmpScale.setScalar(burst.size * grow);
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      bursts3d.setAt(burstCount, tmpMatrix, burst.color, 0.95 * (1 - u) ** 1.4);
      burstCount += 1;
    }
    bursts3d.commit(burstCount);

    let waveCount = 0;
    for (let index = waves.length - 1; index >= 0; index -= 1) {
      const wave = waves[index];
      const u = (now - wave.start) / 1000 / wave.duration;
      if (u >= 1) {
        waves.splice(index, 1);
        continue;
      }
      const grow = reduced ? 1 : 0.3 + 0.7 * (1 - (1 - u) ** 3);
      tmpPosition.set(wave.x, wave.y, wave.z);
      tmpScale.set(wave.radiusX * grow, 1, wave.radiusZ * grow);
      tmpMatrix.compose(tmpPosition, flat, tmpScale);
      waves3d.setAt(waveCount, tmpMatrix, wave.color, 0.9 * (1 - u));
      waveCount += 1;
    }
    waves3d.commit(waveCount);

    for (const decal of decals) {
      if (decal.active === null) continue;
      const u = (now - decal.active.start) / 1000 / decal.active.duration;
      if (u >= 1) {
        decal.active = null;
        decal.holder.visible = false;
        continue;
      }
      const grow = reduced ? 1 : Math.min(1, 0.7 + u * 6 * 0.3);
      const r = decal.active.radius * grow;
      decal.holder.scale.set(r, 1, r * depthScale);
      const fade = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      decal.fill.material.opacity = 0.3 * fade;
      decal.rim.material.opacity = 0.95 * fade;
      decal.inner.rotation.y = reduced ? 0 : u * 1.5;
    }

    for (let index = orbs.length - 1; index >= 0; index -= 1) {
      const orb = orbs[index];
      const t = (now - orb.start) / 1000;
      const drop = Math.min(1, t / 0.2);
      orb.model.object.position.y = (1 - drop * drop) * (reduced ? 0 : 3.5);
      const fade = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.35);
      orb.model.object.scale.setScalar(1.25 * Math.max(0.001, fade));
      orb.model.update(dtSeconds);
      if (fade <= 0) {
        orb.model.object.removeFromParent();
        if (!orbPool.has(orb.key)) orbPool.set(orb.key, []);
        orbPool.get(orb.key).push(orb.model);
        orbs.splice(index, 1);
      }
    }
    return projectiles.length > 0 || bursts.length > 0 || waves.length > 0 || orbs.length > 0 ||
      decals.some((decal) => decal.active !== null);
  };

  function reset() {
    projectiles.length = 0;
    bursts.length = 0;
    waves.length = 0;
    for (const orb of orbs) {
      orb.model.object.removeFromParent();
      if (!orbPool.has(orb.key)) orbPool.set(orb.key, []);
      orbPool.get(orb.key).push(orb.model);
    }
    orbs.length = 0;
    for (const decal of decals) {
      decal.active = null;
      decal.holder.visible = false;
    }
    seenAreas.clear();
    spellSides.clear();
    lastEventId = -1;
    source = null;
  }

  /** Warm-up: one of everything visible so every program compiles once. */
  const showcase = (now) => {
    clock = now;
    for (const side of ["south", "north"]) {
      for (const style of ["bolt", "orb", "lob"]) {
        projectiles.push({
          style, side, from: new Vector3(0, 1, 0), to: new Vector3(1, 1, 1), arc: 0, returns: false,
          start: now, duration: 0.05, spin: 0,
        });
      }
      spawnBurst(0, 1, 0, team[side].light, 0.5);
      spawnWave(0, 0.05, 0, 1, 1, team[side].glow);
      if (!orbPool.has(`${side}:${isReducedMotion()}`)) {
        orbPool.set(`${side}:${isReducedMotion()}`, [createEffectModel("squall-orb", side, { reducedMotion: isReducedMotion() })]);
      }
    }
    const decal = decals[0];
    decal.active = { start: now, duration: 0.05, radius: 1 };
    decal.holder.visible = true;
    animate(now, 0);
    const warmOrbs = [];
    for (const models of orbPool.values()) for (const model of models) {
      group.add(model.object);
      warmOrbs.push(model);
    }
    return () => {
      for (const model of warmOrbs) model.object.removeFromParent();
      reset();
      animate(clock, 0);
    };
  };

  return {
    group,
    sync,
    animate,
    reset,
    showcase,
    get activeCount() { return projectiles.length + bursts.length + waves.length + orbs.length; },
    get counts() {
      return {
        projectiles: projectiles.length, bursts: bursts.length, waves: waves.length, orbs: orbs.length,
        decals: decals.filter((decal) => decal.active !== null).length,
      };
    },
    dispose() {
      reset();
      for (const models of orbPool.values()) for (const model of models) model.dispose();
      orbPool.clear();
      for (const value of disposables) value.dispose();
      group.clear();
    },
  };
}
