import assert from "node:assert/strict";
import { PLAYABLE_CARD_IDS } from "../../../src/content/playable-roster.js";
import { createEditableGameSessionSetup } from "../../../src/content/editable-deck.js";
import {
  createSessionTroopWitnessQuestions,
  projectSessionTroopBattleCard,
} from "../../../src/content/session-troop-roster.js";

const visibleFields = Object.freeze([
  Object.freeze(["Count", "count"]),
  Object.freeze(["Health", "hitpoints"]),
  Object.freeze(["Damage", "damage"]),
  Object.freeze(["Hit speed", "hitSpeedTicks"]),
  Object.freeze(["Range", "rangeMillitiles"]),
  Object.freeze(["Targets", "targetMode"]),
  Object.freeze(["Moves", "movementMillitilesPerSecond"]),
]);
const card = projectSessionTroopBattleCard("brackenwheel");
const entity = card.entities[0];
const witnessQuestions = new Map(createSessionTroopWitnessQuestions(card.id)
  .map((record) => [record.key, record]));
const setup = createEditableGameSessionSetup([...PLAYABLE_CARD_IDS.slice(0, 7), card.id]);
const setupBattle = JSON.parse(setup.battleSetup);
const setupQuestions = new Map(setupBattle.questions.map((record) => [record.key, record]));
const visibleQuestionFacts = visibleFields.map(([label, field]) => {
  const policyField = entity.sourceConfidencePolicy.fields.find((candidate) =>
    candidate.field === field);
  const questionKey = policyField?.questionKey ??
    (field === "damage" && entity.damagePolicy?.kind === "question"
      ? entity.damagePolicy.questionKey : null);
  if (questionKey === null || questionKey === undefined) {
    return { label, field, receipt: null, setupReceiptMatches: null };
  }
  const receipt = witnessQuestions.get(questionKey);
  assert.ok(receipt, `${field} has a session troop witness receipt`);
  assert.deepEqual(setupQuestions.get(questionKey), receipt,
    `${field} witness receipt matches the selected GameSession setup`);
  return {
    label,
    field,
    key: receipt.key,
    value: receipt.value,
    disposition: receipt.disposition,
    authoritative: receipt.authoritative,
    confidence: receipt.confidence,
    source: receipt.source,
    setupReceiptMatches: true,
  };
});

assert.equal(setup.deck.at(-1), card.id);
assert.ok(!entity.sourceConfidencePolicy.fields.some(({ field }) => field === "cost"));
console.log(JSON.stringify({
  probe: "canonical per-field question receipts vs selected editable setup",
  cardId: card.id,
  actualSetupDeckIds: setup.deck,
  sourceBackedCost: card.cost,
  costHasFieldQuestion: false,
  visibleQuestionFacts,
}, null, 2));
