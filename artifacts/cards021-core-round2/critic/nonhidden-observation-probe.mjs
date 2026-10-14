import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

const cwd = process.cwd();
const { createRLEnvironment } = await import(pathToFileURL(`${cwd}/src/rl/environment.js`));
const { EDITABLE_DECK_CARD_IDS } = await import(pathToFileURL(`${cwd}/src/content/session-troop-roster.js`));
const { DeckCycle } = await import(pathToFileURL(`${cwd}/src/sim/deck.js`));
const deck = ["ember-basin", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
let seed;
for (let candidate = 0; candidate < 1_000; candidate += 1) {
  if (new DeckCycle({ deck, seed: `${candidate}:south` }).state.hand.includes("ember-basin")) {
    seed = candidate;
    break;
  }
}
assert.notEqual(seed, undefined);
const env = createRLEnvironment({ deck, seed, strideTicks: 1, horizonTicks: 1_800 });
const initial = env.observe();
const slot = initial.hand.indexOf("ember-basin");
const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
  actionSlot === slot && point.x === 3_500 && point.y === 14_500);
assert.ok(action && initial.actionMask[action.id]);
const observation = env.step(action.id).observation;
const structure = observation.structures.find(({ cardId }) => cardId === "ember-basin");
assert.ok(structure);
assert.equal(Object.hasOwn(structure, "hidden"), false);
assert.equal(Object.hasOwn(structure, "hiddenPolicyQuestions"), false);
console.log(JSON.stringify({
  seed,
  tick: observation.tick,
  structureKeys: Object.keys(structure).sort(),
  structureSha256: hash(canonical(structure)),
  structure,
}));
