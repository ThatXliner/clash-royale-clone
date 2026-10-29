import assert from "node:assert/strict";
import test from "node:test";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import { LiveBattle } from "../src/sim/live-battle.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function battleWithBuilding(point = null) {
  const witness = structuredClone(createSessionTroopWitness("stonehauler"));
  witness.roster[1] = projectSessionNonUnitBattleCard("bulwark-needle");
  const keys = new Set();
  function collect(value) {
    if (value === null || typeof value !== "object") return;
    if (typeof value.questionKey === "string") keys.add(value.questionKey);
    for (const child of Object.values(value)) collect(child);
  }
  collect(witness.roster);
  witness.questions = witness.questions.filter(({ key }) => keys.has(key));
  const battle = new LiveBattle(canonical(witness));
  battle.scheduleDeploy(JSON.stringify({ cardId: "stonehauler", point: { x: 3_500, y: 14_500 },
    sequence: 0, side: "south", tick: 0 }));
  if (point !== null) {
    battle.scheduleStructure({ cardId: "bulwark-needle", destination: null,
      point, sequence: 1, side: "north", tick: 0 });
  }
  battle.step();
  return battle;
}

function seeker(battle) {
  return battle.state.units.find(({ cardId, side }) =>
    cardId === "stonehauler" && side === "south");
}

test("Stonehauler does not route toward an enemy building beyond its sight", () => {
  const control = battleWithBuilding();
  const remote = battleWithBuilding({ x: 14_500, y: 28_500 });
  const stone = seeker(remote);
  const structure = remote.state.structures[0];
  const dx = BigInt(stone.position.x - structure.position.x);
  const dy = BigInt(stone.position.y - structure.position.y);
  const sight = BigInt(stone.radius + stone.sightRange);
  assert.ok(dx * dx + dy * dy > sight * sight, "the fixture is beyond runtime sight");
  assert.ok(seeker(control).movement.target, "control approaches a crown tower");
  assert.deepEqual(stone.movement.target, seeker(control).movement.target,
    "a remote building cannot divert the structure seeker's tower approach");
  assert.notDeepEqual(stone.movement.target.position, structure.position);
  const restored = LiveBattle.restore(remote.serialize());
  remote.stepMany(5);
  restored.stepMany(5);
  assert.equal(restored.serialize(), remote.serialize());
});

test("Stonehauler still routes toward a visible enemy building", () => {
  const battle = battleWithBuilding({ x: 3_500, y: 17_500 });
  const stone = seeker(battle);
  assert.deepEqual(stone.movement.target.position, battle.state.structures[0].position);
  assert.equal(stone.targetMode, "buildings");
});
