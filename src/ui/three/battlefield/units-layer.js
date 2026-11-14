// Live units and structures on the 3D battlefield.
//
// sync() receives each committed UI frame (combat view + read-only animation
// hints) and records the simulation's positions per tick; animate() runs on
// the renderer's own animation frame and interpolates between those records
// on the wall clock. Nothing here is ever read by the simulation: the view
// only consumes immutable frames, so rendering cannot change match results.
//
// Models come from the R3D-002 kit (src/ui/three/units), pooled per kind and
// side and placed at true proportions at boardToWorld positions. Overlays
// (health bars, deploy rings) are instanced so a busy board costs a handful
// of draw calls on top of the models themselves.
import {
  Box3,
  Color,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
} from "../three-module.js";
import { createUnitModel, UNIT_MODEL_KINDS, unitDesignInfo } from "../units/index.js";
import { TEAM } from "./palette.js";
import { createFadingInstances } from "./fading-instances.js";

const TICKS_PER_SECOND = 60;
const MAX_BARS = 320;
const MAX_RINGS = 160;
const TURN_RATE = 11;
const MOVE_EPSILON = 0.004;
const IDLE_AFTER_TICKS = 5;
const SNAP_DISTANCE = 3;
const STALE_SYNC_MS = 250;
const DEPLOY_PULSE_SECONDS = 0.7;
const HIT_COOLDOWN_SECONDS = 0.14;
const BAR_HEIGHT = 0.17;
// Presentation-only crowd spreading, measured on screen: each body is an
// ellipse as tall as it stands under the 47° camera, flyers drawn where they
// hover, and overlapping ellipses push apart (a little vertical overlap is
// allowed: the head of the unit behind still shows).
const CROWD_SPACING = 0.92;
const CROWD_DEPTH_WEIGHT = 0.85;
const CROWD_LATERAL = 0.55;
// Largest drawn offset from the simulated spot, in tiles. A unit fighting a
// target within CROWD_ENGAGED_RANGE tiles also stays within its simulated gap
// plus CROWD_LINK_SLACK tiles of that target.
const CROWD_MAX_OFFSET = 0.5;
// On a bridge deck a ground crowd may fan out further along the deck than
// across it (the rails bound the across axis anyway).
const CROWD_DECK_ALONG = 1.3;
const CROWD_DECK_ACROSS = 0.75;
// A same-kind group of at least SWARM_MIN ground units on a deck is laid out
// as a block, slots SWARM_PITCH body widths apart.
const SWARM_MIN = 3;
const SWARM_PITCH = 0.95;
// Rows along the deck sit further apart: under the tilted camera the unit
// behind would otherwise stand in the unit in front of it.
const SWARM_ROW_PITCH = 1.35;
const SWARM_ROW_MIN = 0.6;
// Candidate along-deck shifts of a swarm block (tiles north) and the cost of
// each tile of shift against flyer cover.
const SWARM_SHIFTS = Object.freeze([0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1, 1]);
const SWARM_SHIFT_COST = 0.4;
const CROWD_NEAR = 0.6;
// A flyer just behind a deck swarm block (on screen, it is drawn high above
// its ground spot and would bury the block) dips: it flies lower by this
// share of its hover height, easing in and out at FLYER_DIP_RATE.
const FLYER_DIP = 0.6;
const FLYER_DIP_RATE = 5;
// How far from a block a flyer's ground spot may be for it to dip (tiles).
const FLYER_DIP_ACROSS = 1.6;
const FLYER_DIP_SOUTH = 2.2;
const FLYER_DIP_NORTH = 0.5;
const CROWD_ENGAGED_RANGE = 1.5;
const CROWD_LINK_SLACK = 0.25;
// ...but never closer in than this (tiles): a swarm on one target rings it.
const CROWD_ENGAGED_REACH = 0.6;
// Relaxation passes per simulated tick; each resolves part of every overlap.
const CROWD_PASSES = 7;
const CROWD_STIFFNESS = 0.6;
// A pass that moves no spread further than this (tiles) ends the solve early.
const CROWD_SETTLED = 0.004;
const CROWD_EASE_RATE = 7;
const BRIDGE_DECK_MARGIN = 0.24;
const DEPTH_STRETCH = 1 / Math.sin((47 * Math.PI) / 180);
const CHIP_DECAY_PER_SECOND = 1.6;

// Uniform placement scale. Models stay true-proportioned (no depth stretch);
// a uniform enlargement keeps every silhouette readable at phone size next
// to the six-tile towers.
export const PLACEMENT_SCALE = Object.freeze({ unit: 1.6, structure: 1.45 });

function placementInfo(kind) {
  const info = unitDesignInfo(kind);
  const scale = info.layer === "structure" ? PLACEMENT_SCALE.structure : PLACEMENT_SCALE.unit;
  return Object.freeze({
    ...info, scale, height: info.height * scale, hover: info.hover * scale, radius: info.radius * scale,
  });
}

const BRIDGES = Object.freeze([[2.5, 4.5], [13.5, 15.5]]);
const RIVER = Object.freeze({ north: 17.05, south: 14.95 });

/** [west, east] tile edges of the bridge deck at a point on or near the river, else null. */
export function bridgeDeckAt(tx, ty) {
  if (ty <= RIVER.south - 0.6 || ty >= RIVER.north + 0.6) return null;
  for (const deck of BRIDGES) {
    if (tx >= deck[0] - 0.6 && tx <= deck[1] + 0.6) return deck;
  }
  return null;
}

/** Ground height under a ground unit (bridge decks arch over the river). */
export function groundHeightAt(tx, ty) {
  if (ty <= RIVER.south || ty >= RIVER.north) return 0;
  for (const [west, east] of BRIDGES) {
    if (tx >= west - 0.2 && tx <= east + 0.2) {
      const along = (ty - RIVER.south) / (RIVER.north - RIVER.south);
      return 0.17 + Math.sin(along * Math.PI) * 0.16;
    }
  }
  return 0;
}

const shortestAngle = (from, to) => {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

const FALLBACK_KIND = Object.freeze({ air: "duskwing", ground: "mossguard" });

export function resolveModelKind(kind, layer) {
  if (UNIT_MODEL_KINDS.includes(kind)) return kind;
  return FALLBACK_KIND[layer] ?? FALLBACK_KIND.ground;
}

function barMaterial(color, opacity = 1) {
  return new MeshBasicMaterial({
    color, depthTest: false, depthWrite: false, toneMapped: false, transparent: opacity < 1, opacity,
  });
}

/**
 * @param {{ toWorld: (tx: number, ty: number) => [number, number], elevation: number,
 *   isReducedMotion: () => boolean }} options
 */
export function createUnitLayer({ toWorld, elevation, isReducedMotion }) {
  const group = new Group();
  group.name = "battlefield-units";
  const modelGroup = new Group();
  modelGroup.name = "unit-models";
  group.add(modelGroup);

  const disposables = [];
  const keep = (value) => { disposables.push(value); return value; };

  // Billboards face the tilted orthographic camera.
  const billboard = new Quaternion().setFromEuler(new Euler(-elevation, 0, 0));
  const barGeometry = keep(new PlaneGeometry(1, 1));
  const fillGeometry = keep(new PlaneGeometry(1, 1).translate(0.5, 0, 0));
  const makeBars = (geometry, material, order) => {
    const mesh = new InstancedMesh(geometry, keep(material), MAX_BARS);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_BARS * 3), 3);
    group.add(mesh);
    return mesh;
  };
  const barFrame = makeBars(barGeometry, barMaterial(0xffffff), 30);
  const barChip = makeBars(fillGeometry, barMaterial(0xffffff), 31);
  const barFill = makeBars(fillGeometry, barMaterial(0xffffff), 32);
  barFrame.name = "health-frame";
  barChip.name = "health-chip";
  barFill.name = "health-fill";

  const rings = keep(createFadingInstances({
    name: "deploy-rings", geometry: new RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2),
    capacity: MAX_RINGS, renderOrder: 3, polygonOffset: -3,
  }));
  group.add(rings.mesh);

  const frameColor = new Color(0x12191c);
  const teamColors = (team) => ({
    bar: new Color(team.bar), glow: new Color(team.glow), main: new Color(team.main),
    // A damaged unit's bar frame (and so its empty track) stays in team colour.
    frame: new Color(team.deep).lerp(frameColor, 0.3),
  });
  const teamColor = { south: teamColors(TEAM.south), north: teamColors(TEAM.north) };
  const chipColor = new Color(0xe9d7b4);
  const flashColor = new Color(0xffffff);

  const pool = new Map();
  let poolMotion = isReducedMotion();
  const acquire = (kind, side) => {
    const reducedMotion = isReducedMotion();
    if (reducedMotion !== poolMotion) {
      for (const models of pool.values()) for (const model of models) model.dispose();
      pool.clear();
      poolMotion = reducedMotion;
    }
    const key = `${kind}:${side}`;
    const free = pool.get(key);
    const model = free?.pop() ?? createUnitModel(kind, side, { reducedMotion });
    model.object.position.set(0, 0, 0);
    model.object.rotation.set(0, 0, 0);
    model.setTimeScale(1);
    model.setPose("deploy");
    if (kind === "buried-coil") model.setHidden(false, { immediate: true });
    return model;
  };
  const release = (model) => {
    model.object.removeFromParent();
    const key = `${model.kind}:${model.side}`;
    if (!pool.has(key)) pool.set(key, []);
    const free = pool.get(key);
    if (free.length < 24) free.push(model);
    else model.dispose();
  };

  /** Pre-build (and later reuse) one model per kind and side. */
  const prewarm = (kinds = UNIT_MODEL_KINDS) => {
    const created = [];
    for (const kind of kinds) {
      for (const side of ["south", "north"]) {
        const key = `${kind}:${side}`;
        if ((pool.get(key)?.length ?? 0) > 0) continue;
        const model = createUnitModel(kind, side, { reducedMotion: isReducedMotion() });
        created.push(model);
      }
    }
    return created;
  };

  const entities = new Map();
  const halfWidths = new Map();
  const pulses = [];
  let lastTick = -1;
  let lastSyncAt = 0;
  let source = null;

  const removeAll = () => {
    for (const entity of entities.values()) {
      release(entity.model);
      entity.holder.removeFromParent();
    }
    entities.clear();
    pulses.length = 0;
    lastTick = -1;
  };

  const spawn = (record, now, tick) => {
    const kind = resolveModelKind(record.kind, record.layer);
    const info = placementInfo(kind);
    const model = acquire(kind, record.side);
    if (!halfWidths.has(kind)) {
      // Drawn half width (wings, weapons, hats) in the bind pose, once per kind.
      const box = new Box3();
      for (const mesh of model.parts.meshes) {
        if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
        box.union(mesh.geometry.boundingBox);
      }
      const designScale = model.object.getObjectByName("scaler")?.scale.x ?? 1;
      const half = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * designScale * info.scale;
      halfWidths.set(kind, Number.isFinite(half) ? half : info.radius);
    }
    const holder = new Group();
    holder.scale.setScalar(info.scale);
    holder.name = `entity:${record.key}`;
    holder.add(model.object);
    modelGroup.add(holder);
    const tx = record.x / 1000;
    const ty = record.y / 1000;
    const [x, z] = toWorld(tx, ty);
    const yaw = record.side === "south" ? Math.PI : 0;
    holder.position.set(x, record.layer === "ground" ? groundHeightAt(tx, ty) : 0, z);
    holder.rotation.y = yaw;
    const entity = {
      key: record.key, id: record.id, kind, side: record.side, layer: record.layer, info, model, holder,
      structure: info.layer === "structure",
      from: { x, z }, to: { x, z }, tx, ty, segmentStart: now, segmentMs: 1000 / TICKS_PER_SECOND,
      yaw, targetYaw: yaw, moving: false, stillTicks: IDLE_AFTER_TICKS, pose: "deploy",
      hp: record.healthNumerator, maxHp: record.healthDenominator, chip: 1, lastHitAt: -Infinity,
      targetPoint: null, attack: null, hint: null, attackUntil: 0, strikeTick: null,
      spawnTick: tick, deployUntilTick: tick, dying: false, hidden: record.hidden === true,
      baseX: x, baseZ: z, offsetX: 0, offsetZ: 0, spreadX: 0, spreadZ: 0, pushX: 0, pushZ: 0,
      linkKey: null, linkTarget: null, swarm: null, fixed: false, crowded: false, dip: false, dipAmount: 0,
      liftNode: model.object.getObjectByName("lift") ?? null,
    };
    if (kind === "buried-coil") model.setHidden(entity.hidden, { immediate: true });
    entities.set(record.key, entity);
    pulses.push({ x, z, side: record.side, radius: info.radius, start: now });
    return entity;
  };

  const kill = (entity) => {
    entity.dying = true;
    // Topple across the screen: sideways when the unit faces along the view
    // axis (north or south), backward when it faces east or west.
    const facesAcross = Math.abs(Math.sin(entity.yaw)) > 0.7;
    let fall = "back";
    if (!facesAcross) {
      const away = entity.targetPoint === null ? (entity.id % 2 === 0 ? 1 : -1)
        : Math.sign(entity.holder.position.x - entity.targetPoint.x) || 1;
      // Local -X (the model's right) points to world +X when facing -Z.
      const rightIsEast = Math.cos(entity.yaw) < 0;
      fall = (away > 0) === rightIsEast ? "right" : "left";
    }
    entity.model.setPose("death", { fall });
    entity.pose = "death";
  };

  const startAttack = (entity, durationSeconds, offsetSeconds, now) => {
    entity.model.setPose("attack", { duration: durationSeconds });
    if (offsetSeconds > 0) entity.model.update(offsetSeconds);
    entity.pose = "attack";
    entity.attackUntil = now + (durationSeconds - Math.max(0, offsetSeconds)) * 1000;
  };

  /** Feed-driven attack (structures, or any source without an attack clock). */
  const strikeNow = (entity, now) => {
    if (entity.dying || entity.pose === "deploy") return;
    if (entity.hint !== null && entity.hint.nextStrikeTick !== null) return;
    if (now < entity.attackUntil - 80) return;
    const duration = entity.model.attackSeconds;
    startAttack(entity, duration, duration * entity.model.attackStrike, now);
  };

  /**
   * @param combat canonical combat view (entities, links, towers, tick)
   * @param hints  read-only presentation hints (attack clocks) or null
   */
  const sync = (combat, hints, now, frameSource = null) => {
    if ((frameSource !== null && frameSource !== source) || combat.tick < lastTick) {
      removeAll();
      source = frameSource;
    }
    const tick = combat.tick;
    const advanced = lastTick < 0 ? 1 : tick - lastTick;
    const fresh = advanced > 0;
    const hintById = new Map();
    if (hints !== null && hints !== undefined) for (const unit of hints.units) hintById.set(unit.id, unit);
    const targets = new Map();
    for (const link of combat.links) targets.set(link.fromKey, link);
    const seen = new Set();
    let membershipChanged = false;
    for (const record of combat.entities) {
      seen.add(record.key);
      let entity = entities.get(record.key);
      if (entity === undefined || entity.dying) {
        if (entity !== undefined) {
          release(entity.model);
          entity.holder.removeFromParent();
        }
        entity = spawn(record, now, tick);
        membershipChanged = true;
      }
      const hint = hintById.get(record.id) ?? null;
      entity.hint = hint;
      if (hint !== null) entity.deployUntilTick = hint.spawnedAt + hint.deployTicks;
      else if (entity.structure && entity.spawnTick === tick) entity.deployUntilTick = tick + 60;
      const tx = record.x / 1000;
      const ty = record.y / 1000;
      if (fresh) {
        const [x, z] = toWorld(tx, ty);
        const current = { x: entity.baseX, z: entity.baseZ };
        const previousTo = entity.to;
        const moved = Math.hypot(x - previousTo.x, z - previousTo.z);
        if (Math.hypot(x - current.x, z - current.z) > SNAP_DISTANCE) {
          entity.from = { x, z };
        } else {
          entity.from = { x: current.x, z: current.z };
        }
        entity.to = { x, z };
        entity.tx = tx;
        entity.ty = ty;
        entity.segmentStart = now;
        entity.segmentMs = Math.max(8, Math.min(250, advanced * 1000 / TICKS_PER_SECOND));
        if (moved > MOVE_EPSILON * advanced) {
          entity.stillTicks = 0;
          entity.moving = true;
          entity.heading = Math.atan2(x - previousTo.x, z - previousTo.z);
        } else {
          entity.stillTicks += advanced;
          if (entity.stillTicks >= IDLE_AFTER_TICKS) entity.moving = false;
        }
      }
      const link = targets.get(record.key);
      if (link !== undefined) {
        const [lx, lz] = toWorld(link.x2 / 1000, link.y2 / 1000);
        entity.targetPoint = { x: lx, z: lz };
        entity.linkKey = typeof link.toKey === "string" ? link.toKey : null;
      } else {
        entity.targetPoint = null;
        entity.linkKey = null;
      }
      if (record.healthNumerator < entity.hp) {
        const at = now / 1000;
        if (at - entity.lastHitAt > HIT_COOLDOWN_SECONDS) {
          entity.model.setPose("hit");
          entity.lastHitAt = at;
        }
      }
      if (record.healthNumerator > entity.hp) entity.chip = record.healthNumerator / Math.max(1, record.healthDenominator);
      entity.hp = record.healthNumerator;
      entity.maxHp = record.healthDenominator;
      if (entity.kind === "buried-coil" && (record.hidden === true) !== entity.hidden) {
        entity.hidden = record.hidden === true;
        entity.model.setHidden(entity.hidden);
      }
    }
    for (const entity of entities.values()) {
      if (!seen.has(entity.key) && !entity.dying) {
        kill(entity);
        membershipChanged = true;
      }
    }
    if (fresh) {
      lastTick = tick;
      lastSyncAt = now;
      // The layout is re-solved every other tick (and whenever units come or go);
      // the drawn offsets ease between solves.
      if (tick % 2 === 0 || membershipChanged) layout();
    }
  };

  const tmpMatrix = new Matrix4();
  const tmpPosition = new Vector3();
  const tmpScale = new Vector3();
  const flat = new Quaternion();
  const tmpColor = new Color();

  const renderTick = (now) => {
    if (lastTick < 0) return 0;
    return lastTick + Math.min(2, Math.max(0, (now - lastSyncAt) / 1000 * TICKS_PER_SECOND));
  };

  const updateAttack = (entity, now, tickNow) => {
    const hint = entity.hint;
    if (hint === null || hint.nextStrikeTick === null || hint.statusWork) return;
    if (hint.attackPhase !== "winding" && hint.attackPhase !== "cycling") return;
    if (entity.targetPoint === null) return;
    const strike = hint.nextStrikeTick;
    if (entity.strikeTick === strike) return;
    const duration = Math.max(0.3, Math.min(2.4, hint.hitSpeedTicks / TICKS_PER_SECOND));
    const lead = duration * entity.model.attackStrike;
    const startTick = strike - lead * TICKS_PER_SECOND;
    if (tickNow < startTick) return;
    const offset = Math.min(lead, (tickNow - startTick) / TICKS_PER_SECOND);
    entity.strikeTick = strike;
    startAttack(entity, duration, offset, now);
  };

  // The simulation treats troops as points, so a swarm can share one exact
  // spot. Presentation spreads overlapping bodies apart on screen so every
  // member stays visible. Every other simulated tick a deterministic layout is
  // solved from scratch from the simulated positions alone (ids break ties),
  // so a held match draws a perfectly still board; the drawn offset then
  // eases toward that layout. Offsets stay small and honest: at most
  // CROWD_MAX_OFFSET tiles, never past a bridge's rails, and an attacker in
  // close combat stays beside its target. Never read by the simulation.
  const crowd = [];
  const linked = [];
  const byScreenU = (first, second) => first.screenU - second.screenU || first.id - second.id;
  const byId = (first, second) => first.id - second.id;
  const relax = (widest) => {
    for (const entity of crowd) {
      entity.pushX = 0;
      entity.pushZ = 0;
      // Where the body is drawn, in screen tiles (u east, v up the screen).
      entity.screenU = entity.to.x + entity.spreadX;
      entity.screenV = -(entity.to.z + entity.spreadZ) / DEPTH_STRETCH + entity.lift;
    }
    // Sweep east to west: only bodies whose screen columns overlap can touch.
    crowd.sort(byScreenU);
    for (let a = 0; a < crowd.length; a += 1) {
      const first = crowd[a];
      const reachU = (first.halfU + widest) * CROWD_SPACING;
      for (let b = a + 1; b < crowd.length; b += 1) {
        const second = crowd[b];
        if (second.screenU - first.screenU >= reachU) break;
        // Overlap of the two drawn bodies, as an ellipse metric: < 1 overlaps.
        const spanU = (first.halfU + second.halfU) * CROWD_SPACING;
        const spanV = (first.halfV + second.halfV) * CROWD_SPACING;
        let dv = (first.screenV - second.screenV) / spanV;
        if (dv >= 1 || dv <= -1) continue;
        let du = (first.screenU - second.screenU) / spanU;
        const distance = Math.hypot(du, dv);
        if (distance >= 1) continue;
        if (distance < 1e-4) {
          const angle = ((Math.min(first.id, second.id) * 0.6180339887 + Math.max(first.id, second.id) * 0.3819660113) % 1)
            * Math.PI * 2 * (first.id < second.id ? 1 : -1);
          du = Math.cos(angle);
          dv = Math.sin(angle);
        } else {
          du /= distance;
          dv /= distance;
        }
        // A file of units one behind the other also steps aside, so a column
        // on a bridge or lane fans out into staggered ranks.
        if (Math.abs(du) < 0.5) {
          const side = Math.abs(first.to.x - second.to.x) > 0.02 ? Math.sign(first.to.x - second.to.x)
            : first.id > second.id ? 1 : -1;
          du += side * CROWD_LATERAL;
        }
        // A flyer over a ground crowd does most of the moving: the ground
        // units are already packed between the rails.
        const firstAir = first.layer === "air";
        // A unit laid out in a deck swarm block holds its slot against anyone
        // outside its block; block mates push each other evenly. A toppling
        // unit stays put; the living step around it.
        if (first.fixed && second.fixed) continue;
        const share = first.fixed ? 0 : second.fixed ? 1
          : first.swarm !== null && second.swarm === null ? 0.15
          : second.swarm !== null && first.swarm === null ? 0.85
          : firstAir === (second.layer === "air") ? 0.5 : firstAir ? 0.8 : 0.2;
        const push = (1 - distance) * CROWD_STIFFNESS;
        // pushZ is in tiles toward the south (screen down).
        first.pushX += du * push * spanU * share;
        first.pushZ -= dv * push * spanV * share;
        second.pushX -= du * push * spanU * (1 - share);
        second.pushZ += dv * push * spanV * (1 - share);
      }
    }
    let moved = 0;
    for (const entity of crowd) {
      if (entity.fixed) continue;
      moved = Math.max(moved, bound(entity, entity.spreadX + entity.pushX, entity.spreadZ / DEPTH_STRETCH + entity.pushZ));
    }
    return moved;
  };
  /** Clamp a spread (px east, pz south, tiles) to the offset cap and the bridge rails. */
  const bound = (entity, px, pz) => {
    // The deck is checked at the sim spot and at the drawn spot, so nobody is
    // drawn standing in the river. Only a unit standing on the deck is held
    // between its rails (one on the bank beside a bridge end keeps its spot).
    const simDeck = entity.layer === "ground" ? bridgeDeckAt(entity.tx, entity.ty) : null;
    const onDeck = simDeck !== null && entity.tx >= simDeck[0] && entity.tx <= simDeck[1];
    const across = onDeck ? CROWD_DECK_ACROSS : CROWD_MAX_OFFSET;
    const along = onDeck ? CROWD_DECK_ALONG : CROWD_MAX_OFFSET;
    const reach = Math.hypot(px / across, pz / along);
    if (reach > 1) {
      px /= reach;
      pz /= reach;
    }
    const deck = entity.layer !== "ground" ? null : simDeck ?? bridgeDeckAt(entity.tx, entity.ty - pz);
    if (deck !== null && entity.tx >= deck[0] && entity.tx <= deck[1]) {
      px = Math.max(Math.min(0, deck[0] + BRIDGE_DECK_MARGIN - entity.tx),
        Math.min(Math.max(0, deck[1] - BRIDGE_DECK_MARGIN - entity.tx), px));
    }
    const moved = Math.hypot(px - entity.spreadX, pz - entity.spreadZ / DEPTH_STRETCH);
    entity.spreadX = px;
    entity.spreadZ = pz * DEPTH_STRETCH;
    return moved;
  };
  const layout = () => {
    crowd.length = 0;
    linked.length = 0;
    let widest = 0;
    for (const entity of entities.values()) {
      if (entity.structure) continue;
      // Body half extents on screen: flyers sit higher than their ground
      // spot, and a standing body is taller on screen than it is wide.
      const info = entity.info;
      const body = Math.max(0.2, info.height - info.hover);
      entity.lift = (info.hover + body * 0.5) * cosE;
      entity.halfU = Math.max(info.radius * 0.85, (halfWidths.get(entity.kind) ?? 0) * 0.7);
      entity.halfV = Math.max(info.radius * sinE, body * 0.5 * cosE) * CROWD_DEPTH_WEIGHT;
      // A dying unit is a fixed obstacle where it fell; the rest start at
      // their simulated spot.
      entity.fixed = entity.dying;
      entity.spreadX = entity.dying ? entity.offsetX : 0;
      entity.spreadZ = entity.dying ? entity.offsetZ : 0;
      entity.swarm = null;
      entity.linkTarget = null;
      entity.dip = false;
      widest = Math.max(widest, entity.halfU);
      crowd.push(entity);
    }
    // Close-combat pairs: the attacker keeps beside its target.
    for (const entity of crowd) {
      if (entity.fixed) continue;
      const target = entity.linkKey === null ? undefined : entities.get(entity.linkKey);
      entity.linkTarget = target !== undefined && !target.dying && !target.structure &&
        Math.hypot(target.tx - entity.tx, target.ty - entity.ty) <= CROWD_ENGAGED_RANGE ? target : null;
      if (entity.linkTarget !== null) linked.push(entity);
    }
    linked.sort(byId);
    formDeckSwarms();
    // Each pass spreads overlaps, then holds every close-combat attacker
    // within its simulated gap (plus a little slack) of its target: it may
    // step around the target, never away from it.
    for (let pass = 0; pass < CROWD_PASSES; pass += 1) {
      const moved = relax(widest);
      for (const entity of linked) holdToTarget(entity, entity.linkTarget);
      if (moved < CROWD_SETTLED) break;
    }
    markCrowded();
  };
  // A unit with two or more neighbours drawn within CROWD_NEAR tiles is in a
  // crowd (its health bar is drawn slimmer).
  const markCrowded = () => {
    for (const entity of crowd) {
      entity.near = 0;
    }
    for (let a = 0; a < crowd.length; a += 1) {
      const first = crowd[a];
      for (let b = a + 1; b < crowd.length; b += 1) {
        const second = crowd[b];
        const du = (first.to.x + first.spreadX) - (second.to.x + second.spreadX);
        const dv = ((first.to.z + first.spreadZ) - (second.to.z + second.spreadZ)) / DEPTH_STRETCH;
        if (Math.abs(du) < CROWD_NEAR && Math.abs(dv) < CROWD_NEAR) {
          first.near += 1;
          second.near += 1;
        }
      }
    }
    for (const entity of crowd) entity.crowded = entity.near >= 2;
  };
  // A same-kind swarm on a bridge deck is packed in a few exact sim spots, and
  // the rails leave no room to push it apart sideways alone. Lay it out as a
  // block on the deck instead: as many columns as fit between the rails, rows
  // running along the deck (northmost units in the north row), centred on the
  // swarm's simulated centre. The relaxation then starts from that block.
  const swarmGroups = new Map();
  const bySimNorth = (first, second) => second.ty - first.ty || first.id - second.id;
  const formDeckSwarms = () => {
    swarmGroups.clear();
    for (const entity of crowd) {
      if (entity.layer !== "ground" || entity.fixed) continue;
      const deck = bridgeDeckAt(entity.tx, entity.ty);
      if (deck === null || entity.tx < deck[0] || entity.tx > deck[1]) continue;
      const key = `${deck[0]}:${entity.side}:${entity.kind}`;
      let group = swarmGroups.get(key);
      if (group === undefined) {
        group = { deck, members: [] };
        swarmGroups.set(key, group);
      }
      group.members.push(entity);
    }
    // Flyers just behind a block dip lower, so they no longer bury it.
    for (const { deck, members } of swarmGroups.values()) {
      if (members.length < SWARM_MIN) continue;
      let south = Infinity;
      let north = -Infinity;
      for (const member of members) {
        south = Math.min(south, member.ty);
        north = Math.max(north, member.ty);
      }
      const middle = (deck[0] + deck[1]) / 2;
      for (const flyer of crowd) {
        if (flyer.layer !== "air" || flyer.fixed || flyer.dip) continue;
        if (Math.abs(flyer.tx - middle) > FLYER_DIP_ACROSS) continue;
        if (flyer.ty < south - FLYER_DIP_SOUTH || flyer.ty > north + FLYER_DIP_NORTH) continue;
        flyer.dip = true;
        flyer.lift -= flyer.info.hover * FLYER_DIP * cosE;
      }
    }
    for (const group of swarmGroups.values()) {
      const { deck, members } = group;
      if (members.length < SWARM_MIN) continue;
      members.sort(bySimNorth);
      const sample = members[0];
      const pitchU = sample.halfU * 2 * SWARM_PITCH;
      const pitchV = Math.max(SWARM_ROW_MIN, sample.halfV * 2 * SWARM_ROW_PITCH);
      const west = deck[0] + BRIDGE_DECK_MARGIN;
      const east = deck[1] - BRIDGE_DECK_MARGIN;
      const columns = Math.max(1, Math.min(members.length, Math.floor((east - west) / pitchU) + 1));
      const rows = Math.ceil(members.length / columns);
      let centreY = 0;
      for (const member of members) centreY += member.ty;
      centreY /= members.length;
      const centreX = (west + east) / 2;
      const slot = (index, shift) => {
        const row = Math.floor(index / columns);
        const inRow = Math.min(columns, members.length - row * columns);
        const column = index - row * columns;
        return [centreX + (column - (inRow - 1) / 2) * pitchU, centreY + shift + ((rows - 1) / 2 - row) * pitchV];
      };
      // Flyers are drawn high above their ground spot and would bury the
      // block; slide it along the deck to where they cover it least, counting
      // each flyer where it will be once it has risen clear (see relax).
      let bestShift = 0;
      let bestCost = Infinity;
      for (const shift of SWARM_SHIFTS) {
        let cost = Math.abs(shift) * SWARM_SHIFT_COST;
        members.forEach((member, index) => {
          const [x, y] = slot(index, shift);
          const [wx, wz] = toWorld(x, y);
          const v = -wz / DEPTH_STRETCH + member.lift;
          for (const other of crowd) {
            if (other.swarm === group || members.includes(other)) continue;
            const otherV = -other.to.z / DEPTH_STRETCH + other.lift;
            const du = (wx - other.to.x) / (member.halfU + other.halfU);
            const dv = (v - otherV) / (member.halfV + other.halfV);
            // A flyer over the block hides it; a ground unit beside it only touches.
            cost += Math.max(0, 1 - Math.hypot(du, dv)) * (other.layer === "air" ? 1 : 0.5);
          }
        });
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          bestShift = shift;
        }
      }
      members.forEach((member, index) => {
        const [slotX, slotY] = slot(index, bestShift);
        // pz runs south: a slot north of the sim spot is a negative pz.
        bound(member, slotX - member.tx, member.ty - slotY);
        member.swarm = group;
      });
    }
  };
  const holdToTarget = (entity, target) => {
    const simX = entity.to.x - target.to.x;
    const simZ = (entity.to.z - target.to.z) / DEPTH_STRETCH;
    const dx = simX + entity.spreadX - target.spreadX;
    const dz = simZ + (entity.spreadZ - target.spreadZ) / DEPTH_STRETCH;
    const drawn = Math.hypot(dx, dz);
    const allowed = Math.max(Math.hypot(simX, simZ) + CROWD_LINK_SLACK, CROWD_ENGAGED_REACH);
    if (drawn <= allowed) return;
    const keep = allowed / drawn;
    bound(entity, target.spreadX + dx * keep - simX, target.spreadZ / DEPTH_STRETCH + dz * keep - simZ);
  };
  const separate = (dtSeconds, reducedMotion) => {
    const ease = reducedMotion ? 1 : 1 - Math.exp(-CROWD_EASE_RATE * dtSeconds);
    for (const entity of entities.values()) {
      if (entity.dying || entity.structure) continue;
      entity.offsetX += (entity.spreadX - entity.offsetX) * ease;
      entity.offsetZ += (entity.spreadZ - entity.offsetZ) * ease;
    }
  };

  const animate = (now, dtSeconds) => {
    const reducedMotion = isReducedMotion();
    const tickNow = renderTick(now);
    const stale = now - lastSyncAt > STALE_SYNC_MS;
    let busy = pulses.length > 0;
    let bars = 0;
    for (const entity of entities.values()) {
      if (entity.dying) continue;
      const alpha = Math.min(1, Math.max(0, (now - entity.segmentStart) / entity.segmentMs));
      entity.baseX = entity.from.x + (entity.to.x - entity.from.x) * alpha;
      entity.baseZ = entity.from.z + (entity.to.z - entity.from.z) * alpha;
    }
    separate(dtSeconds, reducedMotion);
    for (const entity of entities.values()) {
      const { holder, model } = entity;
      busy = true;
      if (!entity.dying) {
        const x = entity.baseX + entity.offsetX;
        const z = entity.baseZ + entity.offsetZ;
        const tx = entity.tx;
        const ty = entity.ty;
        holder.position.set(x, entity.layer === "ground" && !entity.structure ? groundHeightAt(tx, ty) : 0, z);
        if (!entity.structure) {
          if (entity.targetPoint !== null && (!entity.moving || entity.pose === "attack")) {
            entity.targetYaw = Math.atan2(entity.targetPoint.x - x, entity.targetPoint.z - z);
          } else if (entity.moving && entity.heading !== undefined) {
            entity.targetYaw = entity.heading;
          }
          const delta = shortestAngle(entity.yaw, entity.targetYaw);
          entity.yaw += reducedMotion ? delta : delta * (1 - Math.exp(-TURN_RATE * dtSeconds));
          holder.rotation.y = entity.yaw;
        } else if (entity.targetPoint !== null && entity.kind !== "aether-well") {
          // Structures swivel toward their target, slowly.
          entity.targetYaw = Math.atan2(entity.targetPoint.x - x, entity.targetPoint.z - z);
          const delta = shortestAngle(entity.yaw, entity.targetYaw);
          entity.yaw += reducedMotion ? delta : delta * (1 - Math.exp(-5 * dtSeconds));
          holder.rotation.y = entity.yaw;
        }
        const deploying = tickNow < entity.deployUntilTick;
        if (entity.pose === "deploy" && model.pose !== "deploy") entity.pose = model.pose;
        if (!deploying || entity.pose !== "deploy") updateAttack(entity, now, tickNow);
        if (entity.pose !== "deploy" && !(entity.pose === "attack" && now < entity.attackUntil)) {
          // A paused or stalled match stops walk cycles instead of moonwalking.
          const wanted = entity.moving && !entity.structure && !stale ? "walk" : "idle";
          if (entity.pose !== wanted) {
            model.setPose(wanted);
            entity.pose = wanted;
          }
        }
      }
      const finished = model.update(dtSeconds);
      if (entity.layer === "air" && entity.liftNode !== null) {
        const dip = entity.dip && !entity.dying ? 1 : 0;
        entity.dipAmount += (dip - entity.dipAmount) * (reducedMotion ? 1 : 1 - Math.exp(-FLYER_DIP_RATE * dtSeconds));
        entity.liftNode.position.y *= 1 - FLYER_DIP * entity.dipAmount;
      }
      if (entity.dying && finished) {
        release(model);
        holder.removeFromParent();
        entities.delete(entity.key);
        continue;
      }
      if (entity.dying || bars >= MAX_BARS) continue;

      // Health: shown once damaged (structures always). Models carry their
      // side in their own team-coloured bodies; the bar's frame (and so its
      // empty track) and fill are in team colours too.
      const fraction = Math.max(0, Math.min(1, entity.hp / Math.max(1, entity.maxHp)));
      entity.chip = Math.max(fraction, entity.chip - CHIP_DECAY_PER_SECOND * dtSeconds * (reducedMotion ? 4 : 1));
      if (fraction >= 1 && !entity.structure) continue;
      if (entity.hidden && entity.kind === "buried-coil" && fraction >= 1) continue;
      // In a crowd the bars are slimmer so they cover less of the units behind.
      const width = Math.max(0.56, Math.min(1.3, entity.info.radius * 1.4 + 0.12)) * (entity.crowded ? 0.8 : 1);
      const barHeight = (width < 0.8 ? BAR_HEIGHT * 0.8 : BAR_HEIGHT) * (entity.crowded ? 0.65 : 1);
      const top = entity.info.height + 0.28;
      const colors = teamColor[entity.side];
      tmpPosition.set(holder.position.x, holder.position.y + top, holder.position.z);
      tmpScale.set(width + 0.08, barHeight + 0.08, 1);
      tmpMatrix.compose(tmpPosition, billboard, tmpScale);
      barFrame.setMatrixAt(bars, tmpMatrix);
      barFrame.setColorAt(bars, colors.frame);
      const left = holder.position.x - width / 2;
      tmpPosition.set(left, holder.position.y + top, holder.position.z);
      tmpScale.set(Math.max(0.0001, width * entity.chip), barHeight, 1);
      tmpMatrix.compose(tmpPosition, billboard, tmpScale);
      barChip.setMatrixAt(bars, tmpMatrix);
      barChip.setColorAt(bars, chipColor);
      tmpScale.set(Math.max(0.0001, width * fraction), barHeight, 1);
      tmpMatrix.compose(tmpPosition, billboard, tmpScale);
      barFill.setMatrixAt(bars, tmpMatrix);
      const flash = Math.max(0, 1 - (now / 1000 - entity.lastHitAt) / 0.12);
      tmpColor.copy(teamColor[entity.side].bar).lerp(flashColor, flash * 0.6);
      barFill.setColorAt(bars, tmpColor);
      bars += 1;
    }
    for (const mesh of [barFrame, barChip, barFill]) {
      mesh.count = bars;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // Deploy markers: a team ring that blooms out at the drop point, then a
    // tight ring that holds while the unit is still deploying.
    let ringCount = 0;
    for (let index = pulses.length - 1; index >= 0; index -= 1) {
      const pulse = pulses[index];
      const u = (now - pulse.start) / 1000 / DEPLOY_PULSE_SECONDS;
      if (u >= 1) {
        pulses.splice(index, 1);
        continue;
      }
      if (ringCount >= MAX_RINGS) continue;
      const grow = 1 - (1 - u) ** 3;
      const radius = (pulse.radius + 0.25) * (reducedMotion ? 1 : 0.55 + grow * 0.75);
      tmpPosition.set(pulse.x, 0.03, pulse.z);
      tmpScale.set(radius, 1, radius);
      tmpMatrix.compose(tmpPosition, flat, tmpScale);
      rings.setAt(ringCount, tmpMatrix, teamColor[pulse.side].glow, 0.95 * (1 - u));
      ringCount += 1;
    }
    for (const entity of entities.values()) {
      if (entity.dying || ringCount >= MAX_RINGS) continue;
      const remaining = entity.deployUntilTick - tickNow;
      if (remaining <= 0) continue;
      const total = Math.max(1, entity.deployUntilTick - entity.spawnTick);
      const u = 1 - remaining / total;
      const breathe = reducedMotion ? 0 : Math.sin(now / 90) * 0.04;
      const radius = entity.info.radius * (1.25 - 0.25 * u + breathe) + 0.08;
      tmpPosition.set(entity.holder.position.x, entity.holder.position.y + 0.035, entity.holder.position.z);
      tmpScale.set(radius, 1, radius);
      tmpMatrix.compose(tmpPosition, flat, tmpScale);
      rings.setAt(ringCount, tmpMatrix, teamColor[entity.side].main, 0.55 + 0.35 * (1 - u));
      ringCount += 1;
    }
    rings.commit(ringCount);
    return busy;
  };

  /** Interpolated world anchor of a live entity, for projectiles. */
  const anchor = (id) => {
    for (const entity of entities.values()) {
      if (entity.id !== id || entity.dying) continue;
      return {
        side: entity.side,
        x: entity.holder.position.x,
        y: entity.holder.position.y,
        z: entity.holder.position.z,
        height: entity.info.height,
        hover: entity.info.hover * (1 - FLYER_DIP * entity.dipAmount),
        kind: entity.kind,
        attack: entity.info.attack,
        layer: entity.info.layer,
      };
    }
    return null;
  };

  /** Nearest live entity to a world point (projectile targets carry no id). */
  const nearest = (x, z, maxDistance = 1.2) => {
    let best = null;
    let bestDistance = maxDistance;
    for (const entity of entities.values()) {
      if (entity.dying) continue;
      const distance = Math.hypot(entity.to.x - x, entity.to.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entity;
      }
    }
    return best === null ? null : {
      side: best.side, x: best.holder.position.x, y: best.holder.position.y, z: best.holder.position.z,
      height: best.info.height, hover: best.info.hover * (1 - FLYER_DIP * best.dipAmount), layer: best.info.layer,
    };
  };

  // Screen-plane coordinates under the tilted orthographic camera: u runs
  // east, v runs up the screen (both in tiles).
  const cosE = Math.cos(elevation);
  const sinE = Math.sin(elevation);
  const PLATE_OVERLAP = 0.12;
  /** Whether any live unit's body lies under a camera-facing plate centred at a world point. */
  const coversPlate = (x, y, z, halfWidth, halfHeight) => {
    const v = y * cosE - z * sinE;
    for (const entity of entities.values()) {
      if (entity.dying || entity.structure) continue;
      if (entity.hidden && entity.kind === "buried-coil") continue;
      const position = entity.holder.position;
      const reach = entity.info.radius * 0.85;
      if (Math.abs(position.x - x) > halfWidth + reach - PLATE_OVERLAP) continue;
      const base = position.y * cosE - position.z * sinE - entity.info.radius * sinE * 0.5;
      const top = base + entity.info.height * cosE;
      if (top < v - halfHeight + PLATE_OVERLAP || base > v + halfHeight - PLATE_OVERLAP) continue;
      return true;
    }
    return false;
  };

  const notifyAttack = (id, now) => {
    for (const entity of entities.values()) {
      if (entity.id === id && !entity.dying) strikeNow(entity, now);
    }
  };

  return {
    group,
    sync,
    animate,
    anchor,
    nearest,
    coversPlate,
    notifyAttack,
    prewarm,
    acquireForWarm: acquire,
    release,
    get count() { return entities.size; },
    /** Simulated spot, solved spread and crowd role of every live unit (diagnostics). */
    crowdDebug() {
      return [...entities.values()].filter((entity) => !entity.dying).map((entity) => ({
        key: entity.key, kind: entity.kind, side: entity.side, tx: entity.tx, ty: entity.ty,
        spreadX: entity.spreadX, spreadY: -entity.spreadZ / DEPTH_STRETCH,
        swarm: entity.swarm !== null && entity.swarm !== undefined, target: entity.linkTarget?.key ?? null,
      }));
    },
    /** Current presentation pose of a live entity (diagnostics and tests). */
    poseOf(id) {
      for (const entity of entities.values()) {
        if (entity.id === id) return { pose: entity.pose, strike: entity.model.attackStrike, dying: entity.dying };
      }
      return null;
    },
    get dyingCount() {
      let count = 0;
      for (const entity of entities.values()) if (entity.dying) count += 1;
      return count;
    },
    get liveCount() {
      let count = 0;
      for (const entity of entities.values()) if (!entity.dying) count += 1;
      return count;
    },
    reset() {
      removeAll();
      source = null;
    },
    dispose() {
      for (const entity of entities.values()) entity.model.dispose();
      entities.clear();
      for (const models of pool.values()) for (const model of models) model.dispose();
      pool.clear();
      for (const value of disposables) value.dispose();
      group.clear();
    },
  };
}
