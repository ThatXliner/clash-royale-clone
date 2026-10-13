import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../../../src/content/playable-roster.js";
import { evaluateDeployment } from "../../../src/sim/deployment.js";
import { GameSession } from "../../../src/sim/game-session.js";

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry === undefined ? fallback : Number(entry.slice(prefix.length));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
const triggerY = argument("trigger-y", 15_000);
const deployY = argument("deploy-y", 5_500);
const sourceTick = argument("source-tick", 0);
const endTick = argument("end-tick", 18_000);
const roster = createPlayableRoster();
let bytes;
let session;
if (sourceTick === 0) {
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 }, questions, roster });
  const deck = roster.map(({ id }) => id);
  const legalNorthDeployments = deck.flatMap((cardId) => [
    { cardId, point: { x: 3_500, y: 17_500 } },
    { cardId, point: { x: 14_500, y: 17_500 } },
  ]).sort((left, right) => left.cardId.localeCompare(right.cardId) || left.point.x - right.point.x);
  bytes = canonical({ battleSetup, deck, legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }), seed: 0,
    startingElixir: { north: 10, south: 10 }, thinkIntervalTicks: 1, thinkOffsetTicks: 0 });
  session = new GameSession(bytes);
} else {
  bytes = readFileSync(new URL(`./checkpoint-${sourceTick}.session.json`, import.meta.url), "utf8").trim();
  session = GameSession.restore(bytes);
}
assert.equal(session.state.tick, sourceTick);
const costs = new Map(roster.map(({ id, cost }) => [id, cost]));
const defensive = new Map(roster.map((card) => [card.id, {
  airPressure: card.entities.filter(({ targetMode }) => targetMode === "ground-and-air")
    .reduce((sum, entity) => sum + entity.count * entity.damage * 1_000 / entity.hitSpeedTicks, 0),
  durability: card.entities.reduce((sum, entity) => sum + entity.count * entity.hitpoints, 0),
  groundPressure: card.entities.reduce((sum, entity) => sum + entity.count * entity.damage * 1_000 / entity.hitSpeedTicks, 0),
  range: Math.max(...card.entities.map(({ rangeMillitiles }) => rangeMillitiles)),
  speed: card.entities.reduce((sum, entity) => sum + entity.count * entity.movementMillitilesPerSecond, 0),
}]));
function planAttempt() {
  const state = session.state;
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === "north" && position.y < triggerY);
  if (incoming.length === 0) return null;
  const candidates = state.decks.south.hand.map((cardId, slot) =>
    ({ ...defensive.get(cardId), cardId, cost: costs.get(cardId), slot }))
    .sort((left, right) => right.durability - left.durability || left.speed - right.speed ||
      left.cost - right.cost || left.cardId.localeCompare(right.cardId));
  const airThreat = incoming.some(({ layer }) => layer === "air");
  const pressure = airThreat ? "airPressure" : "groundPressure";
  const card = candidates.filter(({ cost }) => cost <= state.elixir.sides.south.amount)
    .filter((candidate) => candidate[pressure] > 0)
    .sort((left, right) => right.durability - left.durability ||
      right[pressure] - left[pressure] || right.range - left.range ||
      left.speed - right.speed || left.cost - right.cost ||
      left.cardId.localeCompare(right.cardId))[0];
  if (card === undefined || card.cost > state.elixir.sides.south.amount) return null;
  const lanes = state.battle.towers.filter(({ id }) => id.startsWith("south:lane:"));
  const nearestThreat = incoming.sort((left, right) =>
    left.position.y - right.position.y || left.id - right.id)[0];
  const lane = nearestThreat === undefined
    ? lanes.sort((left, right) => left.hitpoints - right.hitpoints || left.id.localeCompare(right.id))[0]
    : lanes.sort((left, right) => Math.abs(left.position.x - nearestThreat.position.x) -
      Math.abs(right.position.x - nearestThreat.position.x) || left.id.localeCompare(right.id))[0];
  assert.ok(lane);
  return { cardId: card.cardId, point: { x: lane.position.x, y: deployY }, slot: card.slot, tick: state.tick };
}
let commandId = sourceTick === 0 ? 1 :
  JSON.parse(bytes).transcript.filter(({ type }) => type === "submit").length + 1;
const attempts = [];
const significantEvents = [];
while (session.state.tick < endTick && !session.state.terminal) {
  const fromTick = session.state.tick;
  const plan = planAttempt();
  if (plan !== null) {
    const command = { ...plan, commandId, type: "deploy" };
    const admitted = session.submitPlayerCommand(canonical(command));
    assert.equal(admitted.accepted, true);
    attempts.push({ ...plan, commandId });
    commandId += 1;
  }
  const events = session.stepMany(Math.min(300, endTick - fromTick));
  for (const event of events) {
    if (event.type === "tower-destroyed" || event.type === "match_end" ||
        event.type === "external-structure-contact") significantEvents.push(event);
  }
}
const state = session.state;
const contacts = significantEvents.filter(({ type }) => type === "external-structure-contact");
const units = state.battle.units;
const geometryChecks = [3_500, 14_500].map((x) => {
  const decision = evaluateDeployment({ side: "south", placementClass: "ground_entity",
    point: { x, y: deployY }, destroyedOpposingLaneTowers: [] });
  return { x, y: deployY, ...decision };
});
assert.ok(geometryChecks.every(({ legal }) => legal), "both defensive lane points are legal");
const summary = {
  scope: "Offline deterministic seed-zero policy trial; not a browser endurance or published GH-equivalence claim.",
  policy: { triggerY, deployY, sourceTick, endTick, trigger: "alive north units inside the south-half threshold",
    selection: "affordable cards that can target the incoming layer; durability first, then target-layer pressure/range, with slower movement as a tie-breaker",
    placement: "the existing defensive point behind the threatened south lane tower",
    cadence: "one planned attempt per 300-tick browser-workload segment",
    guardRefresh: false },
  sourceSnapshot: { kind: sourceTick === 0 ? "exact seed-zero setup" : "transcript-derived checkpoint",
    bytes: bytes.length, sha256: hash(bytes) },
  outcome: { tick: state.tick, terminal: state.terminal, clock: state.clock,
    towers: state.battle.towers.map(({ id, hitpoints }) => ({ id, hitpoints })),
    activeUnits: { north: units.filter(({ alive, side }) => alive && side === "north").length,
      south: units.filter(({ alive, side }) => alive && side === "south").length,
      totalCreated: { north: units.filter(({ side }) => side === "north").length,
        south: units.filter(({ side }) => side === "south").length } },
    towerContacts: { total: contacts.length,
      againstNorth: contacts.filter(({ structureId }) => structureId.startsWith("north:")).length,
      againstSouth: contacts.filter(({ structureId }) => structureId.startsWith("south:")).length },
    northDeployments: state.cardRuntime.history.filter(({ side }) => side === "north").length,
    southDeployments: state.cardRuntime.history.filter(({ side }) => side === "south").length,
    acceptedSouthCommands: attempts.length, elixir: state.elixir.sides, southDeck: state.decks.south },
  placementChecks: geometryChecks,
  attempts,
  significantEvents,
};
const output = `probe-state-adaptive-trigger-${triggerY}-deploy-${deployY}-from-${sourceTick}.json`;
writeFileSync(new URL(output, import.meta.url), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
