import assert from "node:assert/strict";
import test from "node:test";

import {
  DeathConversionEncounter,
  createDeathConversionFixture,
  createDeathConversionQuestionRecords,
} from "../src/content/cards/death-conversion.js";
import { DeathSpawnEncounter } from "../src/content/cards/death-spawns.js";
import { SpawnBatchMaterializer } from "../src/content/cards/spawn-placement.js";

// The call is synchronous so the Node runner regains its global before yielding.
function withoutNodeBuffer(callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
  Object.defineProperty(globalThis, "Buffer", {
    configurable: true, value: undefined, writable: true,
  });
  try {
    return callback();
  } finally {
    if (descriptor === undefined) delete globalThis.Buffer;
    else Object.defineProperty(globalThis, "Buffer", descriptor);
  }
}

test("conversion: constructor, replacement spawn and continuation work without Node Buffer", () => {
  const setup = createDeathConversionFixture();
  // Non-ASCII original identifiers exercise the actual UTF-8 snapshot path.
  setup.entities[1].archetypeId = "reed-guard-é";
  setup.entities[0].replacementChildren[0].archetypeId = "umber-whelp-🌿";
  const expected = new DeathConversionEncounter(setup);
  expected.stepMany(8);
  const expectedBytes = expected.serialize();

  const observed = withoutNodeBuffer(() => {
    const encounter = new DeathConversionEncounter(setup);
    encounter.stepMany(2);
    const restored = DeathConversionEncounter.restore(encounter.serialize());
    restored.stepMany(6);
    const bytes = restored.serialize();
    return {
      bytes,
      children: restored.children,
      replay: restored.replay,
      roundTrip: DeathConversionEncounter.restore(bytes).serialize(),
    };
  });

  assert.equal(observed.bytes, expectedBytes);
  assert.equal(observed.roundTrip, expectedBytes);
  assert.equal(observed.children.length, 1);
  assert.equal(observed.children[0].data.archetypeId, "umber-whelp-🌿");
  assert.equal(observed.children[0].data.ownerId, 7);
  assert.equal(observed.replay.filter(({ type }) => type === "conversion-triggered").length, 1);
  const questions = createDeathConversionQuestionRecords();
  assert.equal(questions.childHealth.authoritative, false);
  assert.equal(questions.childHealth.disposition, "question");
});

test("conversion: portable guards still reject oversized UTF-8 before JSON parsing", () => {
  // Each string is below the character bound but exceeds the corresponding
  // byte bound by two. SyntaxError/TypeError would mean the byte gate was lost.
  withoutNodeBuffer(() => {
    assert.throws(() => DeathConversionEncounter.restore("é".repeat(262_145)), {
      name: "RangeError", message: /byte bound/,
    });
    assert.throws(() => DeathSpawnEncounter.restore("é".repeat(262_145)), {
      name: "RangeError", message: /byte bound/,
    });
    assert.throws(() => SpawnBatchMaterializer.restore("é".repeat(65_537)), {
      name: "RangeError", message: /UTF-8 bytes/,
    });
  });
});
