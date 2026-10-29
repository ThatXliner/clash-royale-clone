import assert from "node:assert/strict";
import test from "node:test";

import {
  ChampionAbilityController,
  createChampionAbilityFixture,
} from "../src/content/cards/champion-abilities.js";
import {
  InvisibilityRevealEncounter,
  createInvisibilityFixture,
} from "../src/content/cards/combat-status-invisibility.js";

function controller() {
  return new ChampionAbilityController(createChampionAbilityFixture(
    [{ id: 1, elixir: 10 }],
    [{ archetypeId: "dusk-ranger", entityId: 101, ownerId: 1 }],
    [
      { entityId: 101, tick: 0, type: "deploy" },
      { entityId: 101, tick: 1, type: "activate" },
    ],
  ));
}

// This exercises the existing QUESTION fixture, not historical ability parity.
test("Dusk Ranger activates and resumes without the Node Buffer global", () => {
  const expected = controller();
  expected.stepMany(5);
  const expectedBytes = expected.serialize();
  const bufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
  try {
    Object.defineProperty(globalThis, "Buffer", {
      configurable: true, writable: true, value: undefined,
    });
    const actual = controller();
    actual.stepMany(2);
    assert.equal(actual.state.champions[0].phase, "active");
    assert.equal(actual.state.champions[0].primitives[0].name, "invisibility");
    assert.equal(actual.state.owners[0].elixir, 9);
    const bytes = actual.serialize();
    const resumed = ChampionAbilityController.restore(bytes);
    assert.equal(resumed.serialize(), bytes);
    resumed.stepMany(3);
    assert.equal(resumed.serialize(), expectedBytes);
    assert.deepEqual(resumed.replay, expected.replay);

    const visibility = new InvisibilityRevealEncounter(createInvisibilityFixture());
    visibility.stepMany(2);
    const visibilityBytes = visibility.serialize();
    const visibilityResumed = InvisibilityRevealEncounter.restore(visibilityBytes);
    visibility.stepMany(3);
    visibilityResumed.stepMany(3);
    assert.equal(visibilityResumed.serialize(), visibility.serialize());

    // Keep the UTF-8 byte bound, including multi-byte input rejected before JSON parsing.
    const tooManyBytes = "é".repeat(262_145);
    for (const restore of [
      (value) => ChampionAbilityController.restore(value),
      (value) => InvisibilityRevealEncounter.restore(value),
    ]) {
      assert.throws(() => restore(tooManyBytes), {
        name: "RangeError", message: /byte bound/,
      });
    }
  } finally {
    if (bufferDescriptor === undefined) delete globalThis.Buffer;
    else Object.defineProperty(globalThis, "Buffer", bufferDescriptor);
  }
});
