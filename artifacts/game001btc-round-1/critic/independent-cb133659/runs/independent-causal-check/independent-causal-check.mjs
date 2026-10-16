import assert from "node:assert/strict";
import { LiveBattle, parseLiveBattleSetup } from "../../../source-attempt-2/candidate/src/sim/live-battle.js";
import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../../../source-attempt-2/candidate/src/content/playable-roster.js";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const raw = { initialWindupTicks: { central: 0, lane: 0 },
  questions: createPlayableRosterQuestionRecords(), roster: createPlayableRoster() };
const setup = parseLiveBattleSetup(canonicalJson(raw));
const briar = setup.roster.find(({ id }) => id === "briar-band");
const interval = briar.entities[0].sourceConfidencePolicy.deploymentInterval;
assert.deepEqual(interval, { milliseconds: 100, sourceId: "supercell-2020-06-02-multi-unit-deployment", ticks: 6 });
const archetypes = briar.entities.flatMap(({ archetypeId, count }) =>
  Array.from({ length: count }, () => archetypeId));
assert.equal(archetypes.length, 6);

const battle = new LiveBattle(setup);
for (const [side, sequence, point] of [
  ["south", 0, { x: 3_500, y: 14_500 }],
  ["north", 1, { x: 3_500, y: 17_500 }],
]) {
  battle.scheduleDeploy(canonicalJson({ cardId: "briar-band", point, sequence, side, tick: 0 }));
}
const first = battle.step(0);
const deployments = first.filter(({ type }) => type === "deployed");
assert.equal(deployments.length, 2);
const reserved = new Map(deployments.map(({ entityIds, side }) => [side, entityIds]));
assert.equal(reserved.get("south").length, 6);
assert.equal(reserved.get("north").length, 6);
assert.equal(new Set([...reserved.get("south"), ...reserved.get("north")]).size, 12);
assert.deepEqual(first.filter(({ type }) => type === "spawn").map(({ id, tick }) => ({ id, tick })),
  [{ id: reserved.get("south")[0], tick: 0 }, { id: reserved.get("north")[0], tick: 0 }]);
assert.deepEqual(battle.state.units.filter(({ cardId }) => cardId === "briar-band")
  .map(({ id, side, archetypeId }) => ({ id, side, archetypeId })), [
    { id: reserved.get("south")[0], side: "south", archetypeId: archetypes[0] },
    { id: reserved.get("north")[0], side: "north", archetypeId: archetypes[0] },
  ]);

const boundaries = [];
for (let memberIndex = 1; memberIndex < archetypes.length; memberIndex += 1) {
  const tick = memberIndex * interval.ticks;
  const events = battle.stepMany(interval.ticks);
  const spawned = events.filter(({ type }) => type === "spawn");
  assert.deepEqual(spawned.map(({ id, tick: spawnTick }) => ({ id, tick: spawnTick })), [
    { id: reserved.get("south")[memberIndex], tick },
    { id: reserved.get("north")[memberIndex], tick },
  ]);
  for (const side of ["south", "north"]) {
    const unit = battle.state.units.find(({ id }) => id === reserved.get(side)[memberIndex]);
    assert.deepEqual({ id: unit?.id, cardId: unit?.cardId, side: unit?.side, archetypeId: unit?.archetypeId },
      { id: reserved.get(side)[memberIndex], cardId: "briar-band", side, archetypeId: archetypes[memberIndex] });
  }
  boundaries.push({ tick, ids: spawned.map(({ id }) => id), memberIndex });
}
assert.equal(battle.state.units.filter(({ cardId }) => cardId === "briar-band").length, 12);
assert.equal(battle.state.pendingDeployments.length, 0);
assert.equal(battle.state.tick, 31);

const validSnapshot = JSON.parse(new LiveBattle(setup).serialize());
const paired = "paired-\uD83D\uDE00";
const generic = structuredClone(validSnapshot);
const genericKey = generic.setup.questions[0].key;
generic.setup.questions[0].source = paired;
const genericBytes = canonicalJson(generic);
assert.equal(LiveBattle.restore(genericBytes).serialize(), genericBytes);
const bound = structuredClone(validSnapshot);
const boundClaim = bound.setup.questions.find(({ key }) => key === "briar-runner.count");
assert.ok(boundClaim);
boundClaim.source = paired;
assert.throws(() => LiveBattle.restore(canonicalJson(bound)),
  /roster\[6\]\.entities\[0\] source confidence QUESTION provenance diverges/u);
const lone = structuredClone(validSnapshot);
lone.setup.questions[0].source = "\uD800";
assert.throws(() => LiveBattle.restore(canonicalJson(lone)), /Unicode scalar/u);

console.log(JSON.stringify({
  deploymentReceiptIds: Object.fromEntries(reserved),
  firstBoundaryIds: first.filter(({ type }) => type === "spawn").map(({ id }) => id),
  pendingMemberBoundaries: boundaries,
  totalBriarMembers: battle.state.units.filter(({ cardId }) => cardId === "briar-band").length,
  genericQuestionKey: genericKey,
  genericPairedSource: "accepted",
  boundQuestionKey: boundClaim.key,
  boundPairedSource: "rejected at provenance",
  loneSurrogate: "rejected at Unicode scalar preflight",
  pendingDeploymentsAfterFinalMember: battle.state.pendingDeployments.length,
  finalTick: battle.state.tick,
}, null, 2));
