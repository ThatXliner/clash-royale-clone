import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [baselineRoot, candidateRoot] = process.argv.slice(2).map((value) => resolve(value));
if (!baselineRoot || !candidateRoot) throw new TypeError("provide baseline and candidate roots");

async function load(root) {
  const [{ GameSession }, { createShippedGameSessionSetup }] = await Promise.all([
    import(pathToFileURL(join(root, "src/sim/game-session.js"))),
    import(pathToFileURL(join(root, "src/ui/game-browser-entry.js"))),
  ]);
  return { GameSession, createShippedGameSessionSetup };
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run({ GameSession, createShippedGameSessionSetup }, seed) {
  const setup = createShippedGameSessionSetup(seed);
  const session = new GameSession(setup);
  const initial = session.serialize();
  const initialReplay = session.replayBytes();
  session.stepMany(120);
  return {
    after120: session.serialize(),
    replay: session.replayBytes(),
    initial,
    initialReplay,
    setup,
  };
}

const [baseline, candidate] = await Promise.all([load(baselineRoot), load(candidateRoot)]);
const results = [];
for (const seed of [0, 23]) {
  const left = run(baseline, seed);
  const right = run(candidate, seed);
  const fields = {};
  for (const field of ["setup", "initial", "initialReplay", "after120", "replay"]) {
    fields[field] = {
      baselineLength: Buffer.byteLength(left[field]),
      baselineSha256: hash(left[field]),
      candidateLength: Buffer.byteLength(right[field]),
      candidateSha256: hash(right[field]),
      exactBytesEqual: left[field] === right[field],
    };
    assert.equal(fields[field].exactBytesEqual, true, `seed ${seed} ${field} bytes changed`);
  }
  results.push({ seed, fields });
}
console.log(JSON.stringify({ baseline: "a142ec8", candidate: "d20938f", results }, null, 2));
