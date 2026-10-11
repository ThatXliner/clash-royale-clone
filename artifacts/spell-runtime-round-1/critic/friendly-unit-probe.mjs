import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.CANDIDATE_ROOT;
assert.ok(root);
const importAt = (path) => import(pathToFileURL(join(root, path)));
const [{ createPlayableRoster, createPlayableRosterQuestionRecords },
  { createSessionRadiusSpellProfileReceipts }, { projectSessionNonUnitBattleCard },
  { LiveBattle }] = await Promise.all([
  importAt("src/content/playable-roster.js"),
  importAt("src/content/session-spell-profile-receipts.js"),
  importAt("src/content/session-card-catalog.js"),
  importAt("src/sim/live-battle.js"),
]);
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

const roster = structuredClone(createPlayableRoster());
roster[0] = structuredClone(projectSessionNonUnitBattleCard("squall-orb"));
const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) =>
  [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy]
    .filter((policy) => policy?.kind === "question")
    .map(({ questionKey }) => questionKey))));
const questions = createPlayableRosterQuestionRecords()
  .filter(({ key }) => referenced.has(key));
const battle = new LiveBattle(canonical({ initialWindupTicks: { central: 0, lane: 0 },
  questions, roster, spellProfileReceipts: createSessionRadiusSpellProfileReceipts() }));
const center = { x: 5_000, y: 16_000 };
for (const [sequence, side, point] of [
  [0, "south", { x: 5_000, y: 14_000 }],
  [1, "north", { x: 5_000, y: 18_000 }],
  [2, "north", { x: 10_000, y: 18_000 }],
]) {
  battle.scheduleDeploy(canonical({ cardId: "mossguard", point, sequence, side, tick: 0 }));
}
battle.step();
const before = Object.fromEntries(battle.state.units.map((unit) =>
  [`${unit.side}:${unit.id}`, { id: unit.id, side: unit.side, hitpoints: unit.hitpoints,
    point: unit.position }]));
battle.scheduleSpell({ cardId: "squall-orb", point: center, sequence: 3,
  side: "south", tick: battle.state.tick });
battle.stepMany(3);
const after = Object.fromEntries(battle.state.units.map((unit) =>
  [`${unit.side}:${unit.id}`, { id: unit.id, side: unit.side, hitpoints: unit.hitpoints,
    point: unit.position }]));
const unitHits = battle.events.filter(({ targetKind, type }) =>
  type === "spell-area-hit" && targetKind === "unit");
const result = {
  candidateRoot: root,
  profileId: "squall-orb-radius-v2",
  center,
  before,
  after,
  unitHits: unitHits.map(({ damage, side, targetId }) => ({ damage, side, targetId })),
  friendlyUnchanged: before["south:1"].hitpoints === after["south:1"].hitpoints,
  enemyDamaged: after["north:2"].hitpoints < before["north:2"].hitpoints,
  offRadiusUnchanged: before["north:3"].hitpoints === after["north:3"].hitpoints,
};
assert.equal(result.friendlyUnchanged, true);
assert.equal(result.enemyDamaged, true);
assert.equal(result.offRadiusUnchanged, true);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
