import assert from "node:assert/strict";
import test from "node:test";

import { position, radius } from "../src/sim/spatial.js";
import {
  ATTACK_TARGET_MODES,
  acquireTarget,
  retainOrAcquireTarget,
  targetCandidate,
} from "../src/sim/targeting.js";

function origin(x = 0, y = 0, tileRadius = 0.5) {
  return { position: position(x, y), radius: radius(tileRadius) };
}

function candidate(
  id,
  {
    alive = true,
    kind = "troop",
    layer = "ground",
    radiusTiles = 0.5,
    targetable = true,
    x = 0,
    y = 0,
  } = {},
) {
  return targetCandidate({
    alive,
    id,
    kind,
    layer,
    position: position(x, y),
    radius: radius(radiusTiles),
    targetable,
  });
}

test("targeting: attack modes have explicit layer and structure semantics", () => {
  assert.deepEqual(ATTACK_TARGET_MODES, [
    "ground",
    "air",
    "air_and_ground",
    "buildings",
    "none",
  ]);
  const candidates = [
    candidate(1, { layer: "air", x: 1 }),
    candidate(2, { layer: "ground", x: 2 }),
    candidate(3, { kind: "structure", layer: "ground", x: 3 }),
  ];
  const select = (mode) =>
    acquireTarget(origin(), candidates, {
      mode,
      sightRange: radius(10),
    });

  assert.equal(select("ground").id, 2);
  assert.equal(select("air").id, 1);
  assert.equal(select("air_and_ground").id, 1);
  assert.equal(select("buildings").id, 3);
  assert.equal(select("none"), null);
});

test("targeting: dead and untargetable candidates are never eligible", () => {
  const found = acquireTarget(
    origin(),
    [
      candidate(1, { alive: false, x: 1 }),
      candidate(2, { targetable: false, x: 2 }),
      candidate(3, { x: 3 }),
    ],
    { mode: "ground", sightRange: radius(10) },
  );
  assert.equal(found.id, 3);
  assert.equal(
    acquireTarget(origin(), [candidate(1, { alive: false })], {
      mode: "air_and_ground",
      sightRange: radius(10),
    }),
    null,
  );
});

test("targeting: sight is inclusive circle-edge range from spatial", () => {
  const touching = candidate(1, { radiusTiles: 0.5, x: 2 });
  assert.equal(
    acquireTarget(origin(), [touching], {
      mode: "ground",
      sightRange: radius(1),
    }).id,
    1,
  );
  assert.equal(
    acquireTarget(origin(), [touching], {
      mode: "ground",
      sightRange: radius(1) - 1,
    }),
    null,
  );
});

test("targeting: nearest acquisition ties use ascending ID in any order", () => {
  const low = candidate(2, { x: -2 });
  const high = candidate(20, { x: 2 });
  const far = candidate(1, { x: 3 });
  for (const candidates of [
    [high, far, low],
    [low, high, far],
    [far, high, low],
  ]) {
    assert.equal(
      acquireTarget(origin(), candidates, {
        mode: "ground",
        sightRange: radius(10),
      }).id,
      2,
    );
  }
});

test("targeting: a valid current target is retained over a nearer target", () => {
  const current = candidate(9, { x: 4 });
  const nearer = candidate(1, { x: 1 });
  const selected = retainOrAcquireTarget(origin(), [nearer, current], {
    currentTargetId: 9,
    mode: "ground",
    sightRange: radius(10),
  });
  assert.equal(selected.id, 9);
});

test("targeting: invalid current targets deterministically reacquire", () => {
  const fallbackHigh = candidate(20, { x: 2 });
  const fallbackLow = candidate(2, { x: -2 });
  const cases = [
    [candidate(9, { alive: false, x: 1 }), "ground"],
    [candidate(9, { targetable: false, x: 1 }), "ground"],
    [candidate(9, { layer: "air", x: 1 }), "ground"],
    [candidate(9, { x: 20 }), "ground"],
  ];
  for (const [current, mode] of cases) {
    const selected = retainOrAcquireTarget(
      origin(),
      [fallbackHigh, current, fallbackLow],
      {
        currentTargetId: 9,
        mode,
        sightRange: radius(5),
      },
    );
    assert.equal(selected.id, 2);
  }
  assert.equal(
    retainOrAcquireTarget(origin(), [fallbackLow], {
      currentTargetId: null,
      mode: "none",
      sightRange: radius(5),
    }),
    null,
  );
});

test("targeting: candidates and returned values are isolated", () => {
  const raw = {
    alive: true,
    id: 4,
    kind: "troop",
    layer: "ground",
    position: position(1, 0),
    radius: radius(0.5),
    targetable: true,
  };
  const checked = targetCandidate(raw);
  raw.position.x = 9000;
  assert.equal(checked.position.x, 1000);

  const found = acquireTarget(origin(), [checked], {
    mode: "ground",
    sightRange: radius(5),
  });
  found.position.x = 8000;
  assert.equal(checked.position.x, 1000);
});

test("targeting: malformed, duplicate, and accessor inputs are rejected", () => {
  const valid = candidate(1, { x: 1 });
  assert.throws(
    () => acquireTarget(origin(), [valid, { ...valid }], {
      mode: "ground",
      sightRange: radius(5),
    }),
    /unique entity IDs/,
  );
  assert.throws(
    () => acquireTarget(origin(), [{ ...valid, kind: "spell" }], {
      mode: "ground",
      sightRange: radius(5),
    }),
    /troop.*structure/,
  );
  assert.throws(
    () => acquireTarget(origin(), [{ ...valid, alive: 1 }], {
      mode: "ground",
      sightRange: radius(5),
    }),
    /alive must be a boolean/,
  );
  assert.throws(
    () => acquireTarget(origin(), [valid], {
      mode: "water",
      sightRange: radius(5),
    }),
    /mode must be/,
  );
  assert.throws(
    () => retainOrAcquireTarget(origin(), [valid], {
      currentTargetId: 0,
      mode: "ground",
      sightRange: radius(5),
    }),
    /positive safe integer/,
  );

  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => acquireTarget(origin(), sparse, {
      mode: "ground",
      sightRange: radius(5),
    }),
    /enumerable data property/,
  );

  let getterCalls = 0;
  const accessorCandidate = { ...valid };
  Object.defineProperty(accessorCandidate, "alive", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  assert.throws(
    () => acquireTarget(origin(), [accessorCandidate], {
      mode: "ground",
      sightRange: radius(5),
    }),
    /enumerable data property/,
  );
  assert.equal(getterCalls, 0);

  const accessorOptions = {
    sightRange: radius(5),
  };
  Object.defineProperty(accessorOptions, "mode", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "ground";
    },
  });
  assert.throws(
    () => acquireTarget(origin(), [valid], accessorOptions),
    /enumerable data property/,
  );
  assert.equal(getterCalls, 0);
});
