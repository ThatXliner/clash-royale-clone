import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { OpponentController } from "../../src/sim/opponent-controller.js";

const base = new URL("./", import.meta.url);
const sessionSnapshot = JSON.parse(await readFile(new URL("accepted-player-command-snapshot.json", base), "utf8"));
const sessionSetup = sessionSnapshot.setup;
const report = JSON.parse(await readFile(new URL("probe-report.json", base), "utf8"));
const roster = JSON.parse(sessionSetup.battleSetup).roster;
const northHand = report.sessionAdmission.initial.north.deckHand;
const observation = {
  legalNorthDeployments: sessionSetup.legalNorthDeployments.filter(({ cardId }) => northHand.includes(cardId)),
  northCardCosts: northHand.map((cardId) => ({ cardId,
    cost: roster.find((entry) => entry.id === cardId).cost })).sort((left, right) =>
      left.cardId < right.cardId ? -1 : 1),
  northElixir: report.sessionAdmission.initial.north.elixir,
  northHand,
  tick: 0,
};
const controller = new OpponentController({ seed: sessionSetup.seed,
  thinkIntervalTicks: sessionSetup.thinkIntervalTicks,
  thinkOffsetTicks: sessionSetup.thinkOffsetTicks });
const proposal = controller.step(observation)[0] ?? null;
const expected = report.sessionAdmission.northAiAetherDeployment;
const matchesObservedSession = proposal?.cardId === expected.route.cardId &&
  proposal?.point.x === expected.route.point.x && proposal?.point.y === expected.route.point.y &&
  proposal?.tick === expected.tick && proposal?.sequence === 0 && proposal?.side === expected.side;
if (!matchesObservedSession) throw new Error("natural controller proposal did not match the actual GameSession deployment");
const result = {
  path: "public OpponentController replayed against the exact initial north observation from the accepted GameSession setup",
  gameSessionSetupSHA256: report.sessionAdmission.setupSHA256,
  observation,
  proposal,
  controllerReplayLog: controller.replayLog,
  matchingGameSessionDeployment: expected,
  matchesObservedSession,
  note: "GameSession does not expose raw controller proposal in its replay; this public deterministic controller call reproduces it exactly and is cross-checked against the actual GameSession route/spend/materialization event.",
};
await writeFile(new URL("natural-ai-decision.json", base), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ path: result.path, observation, proposal,
  matchingGameSessionDeployment: expected, matchesObservedSession }, null, 2));
