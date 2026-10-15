import {
  createPlayableRoster,
  PLAYABLE_CARD_IDS,
} from "../../../src/content/playable-roster.js";
import { EDITABLE_DECK_CARD_IDS } from "../../../src/content/session-troop-roster.js";
import {
  createSessionTroopWitnessQuestions,
  projectSessionTroopBattleCard,
} from "../../../src/content/session-troop-roster.js";

const visibleFields = Object.freeze([
  "count",
  "hitpoints",
  "damage",
  "hitSpeedTicks",
  "rangeMillitiles",
  "targetMode",
  "movementMillitilesPerSecond",
]);
const cards = [
  ...createPlayableRoster(),
  ...EDITABLE_DECK_CARD_IDS
    .filter((id) => !PLAYABLE_CARD_IDS.includes(id))
    .map((id) => projectSessionTroopBattleCard(id)),
];
const results = cards.map((card) => {
  const receipts = new Map(createSessionTroopWitnessQuestions(card.id)
    .map((record) => [record.key, record]));
  return {
    id: card.id,
    entities: card.entities.map((entity) => ({
      archetypeId: entity.archetypeId,
      visibleFields: visibleFields.map((field) => {
        const sourceField = entity.sourceConfidencePolicy?.fields?.find((candidate) =>
          candidate.field === field);
        const damagePolicy = field === "damage" ? entity.damagePolicy : null;
        const questionKey = sourceField?.questionKey ??
          (damagePolicy?.kind === "question" ? damagePolicy.questionKey : null);
        const receipt = questionKey === null || questionKey === undefined
          ? null : receipts.get(questionKey);
        return {
          field,
          questionKey,
          disposition: receipt?.disposition ?? null,
          authoritative: receipt?.authoritative ?? null,
          confidence: receipt?.confidence ?? null,
        };
      }),
    })),
  };
});
console.log(JSON.stringify({ cardCount: cards.length, results }, null, 2));
