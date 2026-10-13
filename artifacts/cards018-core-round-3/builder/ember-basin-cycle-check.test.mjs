import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createRLEnvironment } from "../../../src/rl/environment.js";

const documentationPath = new URL("../../../docs/rl-api.md", import.meta.url);
const documentedSourcePath = new URL("./documented-mixed-deck-example.mjs", import.meta.url);
const resultPath = new URL("./example-result.json", import.meta.url);

test("literal guide example checks Ember Basin cost and deck-cycle state", () => {
  const markdown = readFileSync(documentationPath, "utf8");
  const blocks = [...markdown.matchAll(/```js\r?\n([\s\S]*?)\r?\n```/g)]
    .map((match) => match[1]);
  assert.ok(blocks.length >= 2, "the guide includes its mixed-deck JavaScript example");
  const importedFromArtifact = blocks[1]
    .replace('from "../src/rl/environment.js";', 'from "../../../src/rl/environment.js";');
  assert.equal(readFileSync(documentedSourcePath, "utf8").trim(), importedFromArtifact,
    "the executed source is the literal guide example with only its relative import adjusted");

  const deck = [
    "ember-basin", "squall-orb", "coilblade", "mossguard",
    "copperskiff", "skymaul", "brassbolt", "reedsting",
  ];
  const env = createRLEnvironment({ deck, seed: 1, strideTicks: 1, horizonTicks: 120 });
  const initial = env.reset();
  const initialElixir = initial.elixir;
  const initialHand = [...initial.hand];
  const initialNext = initial.next;
  const slot = initialHand.indexOf("ember-basin");
  const space = env.actionSpace();
  const action = space.actions.find((candidate) =>
    candidate.slot === slot && candidate.point.x === 3_500 && candidate.point.y === 14_500);
  assert.ok(slot >= 0 && action && initial.actionMask[action.id],
    "the initial Ember Basin action is legal at the documented tile");

  const transition = env.step(action.id);
  const after = transition.observation;
  const basin = after.structures.find((structure) => structure.cardId === "ember-basin");
  assert.ok(basin, "the deployment creates the public structure record");
  assert.equal(transition.info.ticksAdvanced, 1);
  assert.equal(transition.reward, 0);
  assert.equal(initialElixir, 10);
  assert.equal(after.elixir, initialElixir - 4,
    "the one-tick deployment spends exactly four elixir");
  assert.equal(initialNext, "squall-orb");
  assert.equal(after.hand[slot], initialNext,
    "the played slot is replaced by the recorded next card");
  assert.equal(after.next, "mossguard",
    "the next card advances to the following card in the canonical cycle");
  assert.deepEqual(basin.policy.corpusFields.cost, {
    authoritative: true,
    confidence: "high",
    source: "pinned-pre-march-2023-card-roster-identity",
    value: 4,
  }, "the public profile receipt identifies the sourced cost separately from QUESTION fields");

  writeFileSync(fileURLToPath(resultPath), `${JSON.stringify({
    deck,
    actionId: action.id,
    initial: { elixir: initialElixir, hand: initialHand, next: initialNext },
    after: { elixir: after.elixir, hand: after.hand, next: after.next },
    spentElixir: initialElixir - after.elixir,
    costReceipt: basin.policy.corpusFields.cost,
    reward: transition.reward,
    tick: after.tick,
  }, null, 2)}\n`);
});
