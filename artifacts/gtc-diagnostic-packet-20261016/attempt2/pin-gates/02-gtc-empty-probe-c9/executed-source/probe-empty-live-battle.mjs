import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const sourceRoot = resolve(process.argv[2] ?? "");
const outputRoot = resolve(process.argv[3] ?? "");
if (!sourceRoot || !outputRoot) {
  throw new TypeError("usage: node probe-empty-live-battle.mjs SOURCE_ROOT OUTPUT_ROOT");
}
const load = (relative) => import(pathToFileURL(join(sourceRoot, relative)).href);
const [{ createPlayableRoster, createPlayableRosterQuestionRecords },
  { LiveBattle, parseLiveBattleSetup }] = await Promise.all([
  load("src/content/playable-roster.js"),
  load("src/sim/live-battle.js"),
]);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const roster = clone(createPlayableRoster());
const questions = clone(createPlayableRosterQuestionRecords());
const setup = { initialWindupTicks: { central: 0, lane: 0 }, questions, roster };
const bytes = new LiveBattle(parseLiveBattleSetup(canonical(setup))).serialize();
const snapshot = JSON.parse(bytes);
mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, "setup.json"), `${JSON.stringify(setup, null, 2)}\n`);
writeFileSync(join(outputRoot, "roster.json"), `${JSON.stringify(roster, null, 2)}\n`);
writeFileSync(join(outputRoot, "questions.json"), `${JSON.stringify(questions, null, 2)}\n`);
writeFileSync(join(outputRoot, "snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
writeFileSync(join(outputRoot, "snapshot.raw"), bytes);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: sourceRoot, encoding: "utf8" }).trim();
const briar = roster.find(({ id }) => id === "briar-band");
const report = {
  sourceRoot,
  sourceCommit,
  outputRoot,
  exactSetupFiles: ["setup.json", "roster.json", "questions.json", "snapshot.json", "snapshot.raw"],
  rosterCount: roster.length,
  rosterIds: roster.map(({ id }) => id),
  questionCount: questions.length,
  briarPolicies: (briar?.entities ?? []).map(({ archetypeId, sourceConfidencePolicy }) => ({
    archetypeId,
    sourceConfidenceQuestionKeys: (sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
  })),
  serializedVersion: JSON.parse(bytes).version,
  serializedBytes: Buffer.byteLength(bytes),
  serializedSha256: createHash("sha256").update(bytes).digest("hex"),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
