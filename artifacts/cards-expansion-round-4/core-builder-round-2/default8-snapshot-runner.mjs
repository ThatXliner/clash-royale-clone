import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const fromRoot = (path) => pathToFileURL(resolve(root, path)).href;
const [{ GameSession }, rosterModule] = await Promise.all([
  import(fromRoot("src/sim/game-session.js")),
  import(fromRoot("src/content/playable-roster.js")),
]);
const roster = rosterModule.createPlayableRoster();
const deck = roster.map(({ id }) => id);
const questions = rosterModule.createPlayableRosterQuestionRecords();

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

assert.equal(deck.length, 8, "default playable roster remains eight cards");
const battleSetup = canonical({
  initialWindupTicks: { central: 0, lane: 0 },
  questions,
  roster,
});
const legalNorthDeployments = deck.flatMap((cardId) => [
  { cardId, point: { x: 3_500, y: 17_500 } },
  { cardId, point: { x: 14_500, y: 17_500 } },
]).sort((left, right) => left.cardId < right.cardId ? -1 :
  left.cardId > right.cardId ? 1 : left.point.x - right.point.x);

const snapshots = [];
for (const seed of [0, 23]) {
  const session = new GameSession(canonical({
    battleSetup,
    deck,
    legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  }));
  let tick = 0;
  for (const targetTick of [0, 120, 900]) {
    session.stepMany(targetTick - tick);
    tick = targetTick;
    const snapshot = session.serialize();
    snapshots.push({
      seed,
      tick,
      byteLength: Buffer.byteLength(snapshot),
      sha256: hash(snapshot),
    });
  }
}

process.stdout.write(`${JSON.stringify({ deck, snapshots }, null, 2)}\n`);
