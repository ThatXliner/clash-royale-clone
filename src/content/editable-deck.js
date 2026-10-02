import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
  PLAYABLE_CARD_IDS,
} from "./playable-roster.js";
import { createEditableDeckWitness } from "./session-troop-roster.js";

export { EDITABLE_DECK_CARD_IDS } from "./session-troop-roster.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameIds(left, right) {
  return left.length === right.length &&
    left.every((id, index) => id === right[index]);
}

function checkedSeed(seed) {
  if (typeof seed !== "string" && !Number.isSafeInteger(seed)) {
    throw new TypeError("editable deck seed must be a string or safe integer");
  }
  return seed;
}

/**
 * Builds the canonical GameSession setup for a selected editable deck.
 * The exact standard order keeps the legacy shipped roster and question bytes.
 */
export function createEditableGameSessionSetup(deckIds, seed = 0, ...args) {
  if (args.length !== 0) {
    throw new TypeError("editable game session setup takes at most two arguments");
  }
  const witness = createEditableDeckWitness(deckIds);
  const checked = checkedSeed(seed);
  const selectedIds = witness.roster.map(({ id }) => id);
  const standard = sameIds(selectedIds, PLAYABLE_CARD_IDS);
  const roster = standard ? createPlayableRoster() : witness.roster;
  const questions = standard
    ? createPlayableRosterQuestionRecords()
    : witness.questions;
  const initialWindupTicks = standard
    ? { central: 0, lane: 0 }
    : witness.initialWindupTicks;
  const battleSetup = canonical({ initialWindupTicks, questions, roster });
  return canonical({
    battleSetup,
    deck: selectedIds,
    legalNorthDeployments: selectedIds.map((cardId) => ({
      cardId,
      point: { x: 3_500, y: 17_500 },
    })).sort((left, right) => left.cardId.localeCompare(right.cardId)),
    rosterWitness: canonical({ questions, roster }),
    seed: checked,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 60,
    thinkOffsetTicks: 0,
  });
}
