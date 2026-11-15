// MATCH-006: a fallen crown tower opens its lane's forward pocket for the side
// that felled it, in LiveBattle, GameSession, the opponent AI and the RL API.
import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDeployment, getDeploymentPolicy } from "../src/sim/deployment.js";
import {
  destroyedOpposingLaneTowers,
  pocketDeploymentAnchor,
} from "../src/sim/deployment-pockets.js";
import { getArenaGeometry } from "../src/sim/arena-geometry.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle } from "../src/sim/live-battle.js";
import { createRLEnvironment, RLEnvironment } from "../src/rl/environment.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const SIDES = ["south", "north"];
const LANES = ["west", "east"];
const BRIDGE_X = { east: 14_500, west: 3_500 };
const other = (lane) => lane === "west" ? "east" : "west";
const rival = (side) => side === "south" ? "north" : "south";
// A point in the side's own half, a tile short of the river, in the lane.
const ownBridgeSide = (side, lane) => ({ x: BRIDGE_X[lane], y: side === "south" ? 14_000 : 18_000 });
// A point deep in the rival half, past the pocket, clear of every tower.
const deepRivalGround = (side, lane) => ({ x: lane === "west" ? 1_000 : 17_000,
  y: side === "south" ? 27_000 : 5_000 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const SETUP = createShippedGameSessionSetup(1);
const BATTLE_SETUP = JSON.parse(SETUP).battleSetup;

function towerHitpoints(towers, side, lane) {
  return towers.find((tower) => tower.side === side && tower.lane === lane).hitpoints;
}

/** LiveBattle where `side` has felled the rival crown tower in `lane`. */
function battleWithFallenTower(side, lane) {
  const battle = new LiveBattle(BATTLE_SETUP);
  let sequence = 0;
  for (let wave = 0; wave < 40; wave += 1) {
    if (towerHitpoints(battle.state.towers, rival(side), lane) === 0) return battle;
    for (const cardId of ["coilblade", "mossguard", "brassbolt"]) {
      battle.scheduleDeploy(canonical({ cardId, point: ownBridgeSide(side, lane),
        sequence: sequence++, side, tick: battle.state.tick }));
    }
    battle.stepMany(60);
  }
  throw new Error(`${side} could not fell the ${lane} tower`);
}

function scheduleAt(battle, side, point, sequence) {
  return battle.scheduleDeploy(canonical({ cardId: "mossguard", point, sequence, side,
    tick: battle.state.tick }));
}

test("pocket: destroyed lanes come from tower records, per side, sorted", () => {
  const towers = getArenaGeometry().towers.map((tower) => ({ ...tower, hitpoints: 100 }));
  assert.deepEqual(destroyedOpposingLaneTowers(towers, "south"), []);
  const fall = (side, lane) => towers.find((tower) =>
    tower.side === side && tower.lane === lane).hitpoints = 0;
  fall("north", "east");
  assert.deepEqual(destroyedOpposingLaneTowers(towers, "south"), ["east"]);
  assert.deepEqual(destroyedOpposingLaneTowers(towers, "north"), []);
  fall("north", "west");
  fall("south", "west");
  assert.deepEqual(destroyedOpposingLaneTowers(towers, "south"), ["east", "west"]);
  assert.deepEqual(destroyedOpposingLaneTowers(towers, "north"), ["west"]);
  // A fallen central tower opens no pocket.
  towers.find((tower) => tower.side === "south" && tower.role === "central").hitpoints = 0;
  assert.deepEqual(destroyedOpposingLaneTowers(towers, "north"), ["west"]);
});

test("pocket: rectangles sit in the felled tower's quarter, river edge to tower front", () => {
  const { forwardPockets, edgeInset } = getDeploymentPolicy()
    .estimatedMasksNotCollisionAuthoritative;
  const geometry = getArenaGeometry();
  for (const side of SIDES) {
    const king = geometry.towers.find((tower) => tower.side === rival(side) &&
      tower.role === "central").bounds;
    for (const lane of LANES) {
      const pocket = forwardPockets[side][lane];
      const tower = geometry.towers.find((candidate) => candidate.side === rival(side) &&
        candidate.lane === lane).bounds;
      // Starts at the river's edge on the rival side and reaches the tower's front face.
      if (side === "south") {
        assert.equal(pocket.minY, geometry.river.maxY);
        assert.equal(pocket.maxY, tower.minY);
      } else {
        assert.equal(pocket.maxY, geometry.river.minY);
        assert.equal(pocket.minY, tower.maxY);
      }
      // Covers the tower's half of the arena, inside the edge inset.
      assert.ok(pocket.minX <= tower.minX && pocket.maxX >= tower.maxX);
      assert.equal(lane === "west" ? pocket.minX : 18_000 - pocket.maxX, edgeInset);
      assert.equal(lane === "west" ? pocket.maxX : pocket.minX, 9_000);
      // Never reaches the king tower or a tower footprint.
      assert.ok(pocket.maxY < king.minY || pocket.minY > king.maxY);
      // The anchor offered to the AI is inside, and legal only when open.
      const anchor = pocketDeploymentAnchor(side, lane);
      assert.equal(evaluateDeployment({ destroyedOpposingLaneTowers: [lane],
        placementClass: "ground_entity", point: anchor, side }).reason, "destroyed_lane_pocket");
      assert.equal(evaluateDeployment({ destroyedOpposingLaneTowers: [other(lane)],
        placementClass: "ground_entity", point: anchor, side }).legal, false);
    }
  }
});

for (const side of SIDES) {
  for (const lane of LANES) {
    test(`pocket: LiveBattle admits ${side} into the ${lane} pocket only after that tower falls`, () => {
      const pocket = pocketDeploymentAnchor(side, lane);
      const fresh = new LiveBattle(BATTLE_SETUP);
      assert.throws(() => scheduleAt(fresh, side, pocket, 0), /opposing_side_locked/);

      const battle = battleWithFallenTower(side, lane);
      assert.deepEqual(battle.destroyedOpposingLaneTowers(side), [lane]);
      assert.deepEqual(battle.destroyedOpposingLaneTowers(rival(side)), []);
      // The other lane's pocket and deeper rival ground stay locked.
      assert.throws(() => scheduleAt(battle, side, pocketDeploymentAnchor(side, other(lane)),
        900_000), /opposing_side_locked/);
      assert.throws(() => scheduleAt(battle, side, deepRivalGround(side, lane), 900_001),
        /opposing_side_locked/);
      // The defender gains nothing on the attacker's half.
      assert.throws(() => scheduleAt(battle, rival(side), {
        x: pocket.x, y: 32_000 - pocket.y }, 900_002), /opposing_side_locked/);
      const event = scheduleAt(battle, side, pocket, 900_003);
      assert.equal(event.type, "deploy-scheduled");
      const deployed = battle.step().find((entry) => entry.type === "deployed" &&
        entry.sequence === 900_003);
      assert.deepEqual(deployed.point, pocket);
      // The battle replays byte for byte from its own snapshot.
      assert.equal(LiveBattle.restore(battle.serialize()).serialize(), battle.serialize());
    });
  }
}

/** Scripted south play: push `lane` from the south bank with any affordable unit. */
function playSouth(session, lane, untilTick, { stride = 30 } = {}) {
  let commandId = session.state.pendingPlayerCommands.length + 1_000;
  while (!session.state.terminal && session.state.tick < untilTick) {
    const state = session.state;
    if (towerHitpoints(state.battle.towers, "north", lane) === 0) return state.tick;
    const slot = state.decks.south.hand.findIndex((cardId) => {
      const card = state.cardRuntime.cards.find(({ id }) => id === cardId);
      return card.kind === "unit" && card.cost <= state.elixir.sides.south.amount;
    });
    if (slot >= 0) {
      session.submitPlayerCommand(canonical({ cardId: state.decks.south.hand[slot],
        commandId: commandId++, point: ownBridgeSide("south", lane), slot, tick: state.tick,
        type: "deploy" }));
    }
    session.stepMany(stride);
  }
  throw new Error(`south did not fell the north ${lane} tower`);
}

function submitAffordable(session, point, commandId) {
  const state = session.state;
  const slot = state.decks.south.hand.findIndex((cardId) => {
    const card = state.cardRuntime.cards.find(({ id }) => id === cardId);
    return card.kind === "unit" && card.cost <= state.elixir.sides.south.amount;
  });
  assert.ok(slot >= 0, "an affordable unit is in hand");
  return session.submitPlayerCommand(canonical({ cardId: state.decks.south.hand[slot], commandId,
    point, slot, tick: state.tick, type: "deploy" }));
}

// The AI always attacks west, so the scripted west push needs a seed whose
// card draws let it win that lane (seed 3 fells it at tick 1260).
const SESSION_SEED = { east: 1, west: 3 };

for (const lane of LANES) {
  test(`pocket: GameSession accepts a south ${lane} pocket drop after the tower falls, and replays it`, () => {
    const session = new GameSession(createShippedGameSessionSetup(SESSION_SEED[lane]));
    const pocket = pocketDeploymentAnchor("south", lane);
    assert.throws(() => submitAffordable(session, pocket, 1), /opposing_side_locked/);
    playSouth(session, lane, 3_000);
    // Wait for elixir, then drop into the pocket.
    while (session.state.elixir.sides.south.amount < 4) session.stepMany(15);
    assert.throws(() => submitAffordable(session, pocketDeploymentAnchor("south", other(lane)),
      5_000), /opposing_side_locked/);
    assert.throws(() => submitAffordable(session, deepRivalGround("south", lane), 5_000),
      /opposing_side_locked/);
    submitAffordable(session, pocket, 5_000);
    const from = session.replay.length;
    session.stepMany(2);
    const deployed = session.replay.slice(from).find((event) =>
      event.type === "session-deployed" && event.side === "south");
    assert.deepEqual(deployed.deployment.point, pocket);
    const restored = GameSession.restore(session.serialize());
    assert.equal(restored.serialize(), session.serialize());
    assert.equal(canonical(restored.replay), canonical(session.replay));
  });
}

test("pocket: the opponent AI deploys into its open pocket, and the match replays exactly", () => {
  const session = new GameSession(SETUP);
  const fallTick = () => session.replay.find((event) => event.type === "tower-destroyed" &&
    event.towerId === "south:lane:west")?.tick ?? null;
  while (fallTick() === null && session.state.tick < 3_600) session.stepMany(60);
  const fellAt = fallTick();
  assert.ok(fellAt !== null, "the AI fells the south west tower");
  assert.equal(destroyedOpposingLaneTowers(session.state.battle.towers, "north").join(), "west");
  const north = () => session.replay.filter((event) => event.type === "session-deployed" &&
    event.side === "north").map((event) => ({ point: event.deployment.point, tick: event.tick }));
  assert.ok(north().every(({ point }) => point.y >= 17_000), "no pocket use before the fall");
  const anchor = pocketDeploymentAnchor("north", "west");
  while (!north().some(({ point }) => point.x === anchor.x && point.y === anchor.y) &&
      session.state.tick < fellAt + 3_600 && !session.state.terminal) {
    session.stepMany(120);
  }
  const pocketDrops = north().filter(({ point }) => point.y < 15_000);
  assert.ok(pocketDrops.length > 0, "the AI used its pocket");
  assert.ok(pocketDrops.every(({ point, tick }) => point.x === anchor.x &&
    point.y === anchor.y && tick > fellAt));

  // Same inputs, different advance chunking: identical match.
  const chunked = new GameSession(SETUP);
  while (chunked.state.tick < session.state.tick) {
    chunked.stepMany(Math.min(97, session.state.tick - chunked.state.tick));
  }
  assert.equal(canonical(chunked.replay), canonical(session.replay));
  assert.equal(canonical(chunked.state), canonical(session.state));
  assert.equal(GameSession.restore(session.serialize()).serialize(), session.serialize());
});

test("pocket: RL action mask opens the pocket exactly as the sim does", () => {
  const environment = createRLEnvironment({ seed: 1 });
  const lane = "east";
  const action = (slot, point) => 1 + slot * 576 + Math.floor(point.y / 1_000) * 18 +
    Math.floor(point.x / 1_000);
  const pocket = pocketDeploymentAnchor("south", lane);
  const river = { x: 9_500, y: 15_500 };
  let observation = environment.observe();
  assert.equal(observation.actionMask[action(0, pocket)], false);
  for (let step = 0; step < 200; step += 1) {
    if (towerHitpoints(observation.towers, "north", lane) === 0) break;
    const slot = [0, 1, 2, 3].find((index) =>
      observation.actionMask[action(index, ownBridgeSide("south", lane))]);
    observation = environment.step(slot === undefined ? 0
      : action(slot, ownBridgeSide("south", lane))).observation;
  }
  assert.equal(towerHitpoints(observation.towers, "north", lane), 0);
  while (!observation.actionMask.slice(1).some(Boolean) ||
      ![0, 1, 2, 3].some((slot) => observation.actionMask[action(slot, pocket)])) {
    observation = environment.step(0).observation;
  }
  // Every tile of every affordable ground slot matches evaluateDeployment
  // (ground slots are the affordable ones that cannot target the river).
  const lanes = destroyedOpposingLaneTowers(observation.towers, "south");
  assert.deepEqual(lanes, [lane]);
  let groundSlots = 0;
  for (let slot = 0; slot < 4; slot += 1) {
    const open = [...Array(576).keys()].some((index) => observation.actionMask[1 + slot * 576 + index]);
    if (!open || observation.actionMask[action(slot, river)]) continue;
    groundSlots += 1;
    for (let index = 0; index < 576; index += 1) {
      const point = { x: (index % 18) * 1_000 + 500, y: Math.floor(index / 18) * 1_000 + 500 };
      assert.equal(observation.actionMask[1 + slot * 576 + index], evaluateDeployment({
        destroyedOpposingLaneTowers: lanes, placementClass: "ground_entity", point,
        side: "south" }).legal, `slot ${slot} tile ${JSON.stringify(point)}`);
    }
  }
  assert.ok(groundSlots > 0);
  const slot = [0, 1, 2, 3].find((index) => observation.actionMask[action(index, pocket)]);
  assert.equal(observation.actionMask[action(slot, pocketDeploymentAnchor("south", other(lane)))],
    false);
  assert.equal(observation.actionMask[action(slot, deepRivalGround("south", lane))], false);
  // The masked-in pocket action really plays, and replays identically.
  const snapshot = environment.serialize();
  const elixirBefore = observation.elixir;
  const result = environment.step(action(slot, pocket));
  assert.ok(result.observation.elixir < elixirBefore + 2, "the pocket drop spent elixir");
  const lastCommand = JSON.parse(JSON.parse(environment.serialize()).session).transcript
    .filter(({ type }) => type === "submit").at(-1).command;
  assert.deepEqual(lastCommand.point, { x: 14_500, y: 18_500 });
  const replayed = RLEnvironment.restore(snapshot);
  replayed.step(action(slot, pocket));
  assert.equal(replayed.serialize(), environment.serialize());
});
