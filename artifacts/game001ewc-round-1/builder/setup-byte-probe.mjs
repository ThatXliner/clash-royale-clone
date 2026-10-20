import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../../../src/content/playable-roster.js";
import { exactEnduranceSetupBytes } from "../../../tests/helpers/endurance-workload.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const oldTestUrl = new URL("./accepted-control.test.js", import.meta.url);
const oldTestSource = readFileSync(oldTestUrl, "utf8");
const oldSetupSource = oldTestSource.match(/^function setup\(\) \{[\s\S]*?^\}/m)?.[0];
assert.ok(oldSetupSource, "the accepted control source contains its frozen setup builder");

const oldRoster = createPlayableRoster();
const buildFrozenSetup = new Function("canonical", "createPlayableRoster",
  "createPlayableRosterQuestionRecords", "DECK", `${oldSetupSource}\nreturn setup;`)(
  canonical, createPlayableRoster, createPlayableRosterQuestionRecords,
  oldRoster.map(({ id }) => id));
const frozenSetupBytes = buildFrozenSetup();
const sharedSetupBytes = exactEnduranceSetupBytes();
assert.equal(frozenSetupBytes, sharedSetupBytes,
  "the frozen accepted setup bytes match the shared helper exactly");

console.log(JSON.stringify({
  frozenSourceSha256: createHash("sha256").update(oldTestSource).digest("hex"),
  setupBytes: Buffer.byteLength(sharedSetupBytes),
  setupSha256: createHash("sha256").update(sharedSetupBytes).digest("hex"),
  setupBytesEqual: true,
}));
