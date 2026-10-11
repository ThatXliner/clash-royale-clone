import assert from "node:assert/strict";
import { createSessionTroopWitness } from "/tmp/ship-current-round-1-critic.g950BG/src/content/session-troop-roster.js";
import { GameSession } from "/tmp/ship-current-round-1-critic.g950BG/src/sim/game-session.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function makeSetup(cardId) {
  const witness = createSessionTroopWitness(cardId);
  const roster = structuredClone(witness.roster);
  const questions = structuredClone(witness.questions);
  const deck = roster.map(({ id }) => id);
  const battleSetup = canonical({
    initialWindupTicks: witness.initialWindupTicks,
    questions,
    roster,
  });
  return {
    battleSetup,
    deck,
    legalNorthDeployments: [...deck].sort().map((id) => ({
      cardId: id,
      point: { x: 3_500, y: 17_500 },
    })),
    rosterWitness: canonical({ questions, roster }),
    seed: 0,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  };
}

function mutateBoth(setup, mutate) {
  const battle = JSON.parse(setup.battleSetup);
  const witness = JSON.parse(setup.rosterWitness);
  mutate(battle);
  mutate(witness);
  setup.battleSetup = canonical(battle);
  setup.rosterWitness = canonical(witness);
  return canonical(setup);
}

const cases = [];
for (const [cardId, archetype] of [
  ["gloamwing-cluster", "gloamwing"],
  ["coppershade-flock", "coppershade"],
]) {
  for (const [caseName, mutate] of [
    ["missing-policy", (part) => {
      delete part.roster.find(({ id }) => id === cardId).entities[0].sourceConfidencePolicy;
    }],
    ["forged-confidence", (part) => {
      part.questions.find(({ key }) => key === `${archetype}.hitpoints`).confidence = "high";
    }],
    ["dangling-question", (part) => {
      part.questions.push({
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key: `${archetype}.unsupported-confidence-field`,
        source: "runtime-playability-estimate-not-comparison-corpus",
        value: 1,
      });
    }],
    ["wrong-value", (part) => {
      part.questions.find(({ key }) => key === `${archetype}.hitpoints`).value += 1;
    }],
  ]) {
    const input = mutateBoth(makeSetup(cardId), mutate);
    let message = "";
    assert.throws(() => new GameSession(input), (error) => {
      message = error.message;
      return true;
    }, `${cardId} ${caseName} must fail at the GameSession/kernel boundary`);
    cases.push({ cardId, case: caseName, rejected: true, error: message });
  }
}

console.log(JSON.stringify({ boundary: "new GameSession / canonical kernel admission", cases }, null, 2));
