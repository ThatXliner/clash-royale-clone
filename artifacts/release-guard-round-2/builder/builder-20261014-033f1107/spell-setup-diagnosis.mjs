import { createPlayableRoster, createPlayableRosterQuestionRecords } from "/private/tmp/release-guard-round2-builder-033f1107/src/content/playable-roster.js";
import { createSessionSpellProfileReceipts } from "/private/tmp/release-guard-round2-builder-033f1107/src/content/session-spell-profile-receipts.js";
import { projectSessionNonUnitBattleCard } from "/private/tmp/release-guard-round2-builder-033f1107/src/content/session-card-catalog.js";
import { GameSession } from "/private/tmp/release-guard-round2-builder-033f1107/src/sim/game-session.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function referencedKeys(roster, { includeSourceConfidence }) {
  return new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) => [
    entity.bodyRadiusPolicy,
    entity.projectileSpeedPolicy,
    ...(includeSourceConfidence ? (entity.sourceConfidencePolicy?.fields ?? []) : []),
  ].filter((item) => item?.kind === "question" || item?.questionKey)
    .map((item) => item.questionKey))));
}
function setup(roster, questions, { spellReceipts = true } = {}) {
  const battle = { initialWindupTicks: { central: 0, lane: 0 }, questions, roster };
  if (spellReceipts) battle.spellProfileReceipts = createSessionSpellProfileReceipts();
  return canonical({
    battleSetup: canonical(battle),
    deck: roster.map(({ id }) => id),
    rosterWitness: canonical({ questions, roster }),
    seed: 0,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3600,
    thinkOffsetTicks: 0,
  });
}
function construct(label, configured) {
  try {
    const session = new GameSession(configured);
    return { label, accepted: true, tick: session.state.tick,
      deck: session.state.decks.south.deck };
  } catch (error) {
    return { label, accepted: false, error: error.message };
  }
}
const catalog = createPlayableRosterQuestionRecords();
const originalRoster = structuredClone(createPlayableRoster());
const fixtureRoster = structuredClone(originalRoster);
fixtureRoster[0] = structuredClone(projectSessionNonUnitBattleCard("squall-orb"));
const fixtureExpected = referencedKeys(fixtureRoster, { includeSourceConfidence: false });
const fixtureMissing = [...new Set(fixtureRoster.flatMap(({ entities }) => entities.flatMap((entity) =>
  entity.sourceConfidencePolicy?.fields?.map(({ questionKey }) => questionKey) ?? [])))].filter((key) =>
    !fixtureExpected.has(key));
const fixtureQuestions = catalog.filter(({ key }) => fixtureExpected.has(key));
const correctedExpected = referencedKeys(fixtureRoster, { includeSourceConfidence: true });
const correctedQuestions = catalog.filter(({ key }) => correctedExpected.has(key));
const output = {
  rosterIds: originalRoster.map(({ id }) => id),
  fixtureRosterIds: fixtureRoster.map(({ id }) => id),
  offendingSlot: {
    index: 6,
    cardId: fixtureRoster[6]?.id,
    entityCount: fixtureRoster[6]?.entities?.length,
    sourceConfidenceFields: fixtureRoster[6]?.entities?.[0]?.sourceConfidencePolicy?.fields?.map(({ field, questionKey }) => ({ field, questionKey })) ?? [],
  },
  catalogQuestionCount: catalog.length,
  omittedPolicyQuestionKeys: fixtureMissing,
  currentFixtureQuestionCount: fixtureQuestions.length,
  correctedFixtureQuestionCount: correctedQuestions.length,
  currentFixture: construct("current-game-spell-test-fixture", setup(fixtureRoster, fixtureQuestions)),
  sameFixturePlusOnlyRequiredPolicyQuestions: construct("same-fixture-plus-canonical-source-confidence-question-records", setup(fixtureRoster, correctedQuestions)),
  currentCanonicalRoster: construct("unmodified-current-playable-roster-with-full-canonical-questions", setup(originalRoster, catalog, { spellReceipts: false })),
};
console.log(JSON.stringify(output, null, 2));
if (output.currentFixture.accepted || !output.sameFixturePlusOnlyRequiredPolicyQuestions.accepted || !output.currentCanonicalRoster.accepted) process.exitCode = 2;
