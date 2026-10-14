import { EDITABLE_DECK_CARD_IDS } from "../../src/content/session-troop-roster.js";
import { EDITABLE_MIXED_DECK_CARD_IDS } from "../../src/content/editable-deck.js";
import { createSessionCardManifest } from "../../src/content/session-card-catalog.js";
import { createSessionTroopProfileManifest } from "../../src/content/session-troop-profile-catalog.js";
import { writeFileSync } from "node:fs";
const cards = createSessionCardManifest();
const troops = createSessionTroopProfileManifest();
const summary = {
  sourceCommit: "1413220847b8f05051cce7e1fa10f7eb90cad3a1",
  editableTroopChoiceCount: EDITABLE_DECK_CARD_IDS.length,
  editableTroopChoiceIds: [...EDITABLE_DECK_CARD_IDS],
  editableMixedDeckChoiceCount: EDITABLE_MIXED_DECK_CARD_IDS.length,
  editableMixedDeckChoiceIds: [...EDITABLE_MIXED_DECK_CARD_IDS],
  cardManifestCounts: cards.counts,
  admittedCardIds: cards.cards.map(({ id, kind }) => ({ id, kind })),
  troopProfileCounts: troops.counts,
  admittedTroopProfileIds: troops.profiles.map(({ id }) => id),
  troopQuestionIds: troops.questions.map(({ id, reason }) => ({ id, reason })),
  excludedCardClaims: cards.excludedClaims,
  questionOnlyExports: cards.questionOnly,
  historicalParityExecutions: 0,
  is109CardHistoricalExecution: false,
};
writeFileSync(new URL("./current-runtime-manifest.json", import.meta.url), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({
  editableTroopChoices: summary.editableTroopChoiceCount,
  editableMixedChoices: summary.editableMixedDeckChoiceCount,
  cardManifestCounts: summary.cardManifestCounts,
  troopProfileCounts: summary.troopProfileCounts,
  historicalParityExecutions: 0,
}, null, 2));
