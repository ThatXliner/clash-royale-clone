import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateDeployment,
  getDeploymentPolicy,
} from "../src/sim/deployment.js";
import {
  ARENA_LENGTH_MILLITILES,
  ARENA_WIDTH_MILLITILES,
  getArenaGeometry,
  rotateArenaPoint180,
} from "../src/sim/arena-geometry.js";

const reference = JSON.parse(readFileSync(
  new URL("../reference/stats/arena.json", import.meta.url),
  "utf8",
));

function request(
  side,
  placementClass,
  point,
  destroyedOpposingLaneTowers = [],
) {
  return { side, placementClass, point, destroyedOpposingLaneTowers };
}

test("deployment: ordinary entities use estimated own-side ground masks", () => {
  assert.deepEqual(
    evaluateDeployment(request("south", "ground_entity", {
      x: 9_000, y: 12_000,
    })),
    { legal: true, reason: "own_side_ground", confidence: "estimate" },
  );
  assert.deepEqual(
    evaluateDeployment(request("north", "ground_entity", {
      x: 9_000, y: 20_000,
    })),
    { legal: true, reason: "own_side_ground", confidence: "estimate" },
  );
  assert.equal(
    evaluateDeployment(request("south", "ground_entity", {
      x: 9_000, y: 20_000,
    })).legal,
    false,
  );
});

test("deployment: river is rejected even at estimated bridges", () => {
  for (const x of [3_500, 9_000, 14_500]) {
    assert.deepEqual(
      evaluateDeployment(request("south", "ground_entity", {
        x, y: 16_000,
      })),
      { legal: false, reason: "river_excluded", confidence: "high" },
    );
  }
});

test("deployment: estimated tower footprints and arena edge strips reject", () => {
  assert.deepEqual(
    evaluateDeployment(request("south", "ground_entity", {
      x: 3_500, y: 7_500,
    })),
    { legal: false, reason: "tower_footprint", confidence: "estimate" },
  );
  assert.deepEqual(
    evaluateDeployment(request("south", "ground_entity", { x: 0, y: 10_000 })),
    {
      legal: false,
      reason: "estimated_edge_exclusion",
      confidence: "estimate",
    },
  );
});

test("deployment: global effects may target either side, towers, and river", () => {
  for (const point of [
    { x: 9_000, y: 3_000 },
    { x: 9_000, y: 16_000 },
    { x: 9_000, y: 29_000 },
    { x: 18_000, y: 32_000 },
  ]) {
    assert.deepEqual(
      evaluateDeployment(request("south", "global_effect", point)),
      { legal: true, reason: "full_playfield_effect", confidence: "high" },
    );
  }
});

test("deployment: hard arena bounds reject both placement classes", () => {
  for (const placementClass of ["ground_entity", "global_effect"]) {
    assert.deepEqual(
      evaluateDeployment(request("north", placementClass, {
        x: 18_001, y: 16_000,
      })),
      { legal: false, reason: "outside_playfield", confidence: "high" },
    );
  }
});

test("deployment: destroyed opposing lane unlocks only its estimated pocket", () => {
  const westPocket = { x: 6_000, y: 20_000 };
  assert.equal(
    evaluateDeployment(request(
      "south", "ground_entity", westPocket,
    )).legal,
    false,
  );
  assert.deepEqual(
    evaluateDeployment(request(
      "south", "ground_entity", westPocket, ["west"],
    )),
    {
      legal: true,
      reason: "destroyed_lane_pocket",
      confidence: "estimate",
    },
  );
  assert.deepEqual(
    evaluateDeployment(request(
      "south",
      "ground_entity",
      { x: 12_000, y: 20_000 },
      ["west"],
    )),
    {
      legal: false,
      reason: "opposing_side_locked",
      confidence: "estimate",
    },
  );
});

test("deployment: opposing central area and tower footprints remain unavailable", () => {
  assert.deepEqual(
    evaluateDeployment(request(
      "south",
      "ground_entity",
      { x: 9_000, y: 29_000 },
      ["west", "east"],
    )),
    { legal: false, reason: "tower_footprint", confidence: "estimate" },
  );
  assert.equal(
    evaluateDeployment(request(
      "south",
      "ground_entity",
      { x: 9_000, y: 26_000 },
      ["west", "east"],
    )).legal,
    false,
  );
});

test("deployment: side and absolute-lane decisions have 180-degree symmetry", () => {
  const cases = [
    ["south", { x: 6_000, y: 12_000 }, [], "north", {
      x: 12_000, y: 20_000,
    }, []],
    ["south", { x: 6_000, y: 20_000 }, ["west"], "north", {
      x: 12_000, y: 12_000,
    }, ["east"]],
    ["south", { x: 12_000, y: 20_000 }, ["west"], "north", {
      x: 6_000, y: 12_000,
    }, ["east"]],
  ];
  for (const [
    side,
    point,
    lanes,
    rotatedSide,
    rotatedPoint,
    rotatedLanes,
  ] of cases) {
    assert.deepEqual(
      evaluateDeployment(request(side, "ground_entity", point, lanes)),
      evaluateDeployment(request(
        rotatedSide,
        "ground_entity",
        rotatedPoint,
        rotatedLanes,
      )),
    );
  }
});

function oppositeSide(side) {
  return side === "south" ? "north" : "south";
}

function oppositeLane(lane) {
  return lane === "west" ? "east" : "west";
}

function rectangleBoundaryProbes(rectangle) {
  const middleX = Math.trunc((rectangle.minX + rectangle.maxX) / 2);
  const middleY = Math.trunc((rectangle.minY + rectangle.maxY) / 2);
  return [
    // All four exact corners.
    { x: rectangle.minX, y: rectangle.minY },
    { x: rectangle.minX, y: rectangle.maxY },
    { x: rectangle.maxX, y: rectangle.minY },
    { x: rectangle.maxX, y: rectangle.maxY },
    // An exact point on each edge.
    { x: rectangle.minX, y: middleY },
    { x: rectangle.maxX, y: middleY },
    { x: middleX, y: rectangle.minY },
    { x: middleX, y: rectangle.maxY },
    // One integer millitile inside and outside each edge.
    { x: rectangle.minX + 1, y: middleY },
    { x: rectangle.minX - 1, y: middleY },
    { x: rectangle.maxX - 1, y: middleY },
    { x: rectangle.maxX + 1, y: middleY },
    { x: middleX, y: rectangle.minY + 1 },
    { x: middleX, y: rectangle.minY - 1 },
    { x: middleX, y: rectangle.maxY - 1 },
    { x: middleX, y: rectangle.maxY + 1 },
  ];
}

function rotatePossiblyOutsidePoint(point) {
  return {
    x: ARENA_WIDTH_MILLITILES - point.x,
    y: ARENA_LENGTH_MILLITILES - point.y,
  };
}

function assertRotationInvariant({
  label,
  rectangle,
  side,
  lanes,
}) {
  for (const point of rectangleBoundaryProbes(rectangle)) {
    const rotatedPoint = (
      point.x >= 0 &&
      point.x <= ARENA_WIDTH_MILLITILES &&
      point.y >= 0 &&
      point.y <= ARENA_LENGTH_MILLITILES
    )
      ? rotateArenaPoint180(point)
      : rotatePossiblyOutsidePoint(point);
    const actual = evaluateDeployment(request(
      side,
      "ground_entity",
      point,
      lanes,
    ));
    const rotated = evaluateDeployment(request(
      oppositeSide(side),
      "ground_entity",
      rotatedPoint,
      lanes.map(oppositeLane),
    ));
    assert.deepEqual(
      actual,
      rotated,
      `${label} at ${JSON.stringify(point)} rotates to ` +
        `${JSON.stringify(rotatedPoint)}`,
    );
  }
}

test("deployment: every estimated rectangle boundary is 180-degree symmetric", () => {
  const policy = getDeploymentPolicy();
  const masks = policy.estimatedMasksNotCollisionAuthoritative;
  const geometry = getArenaGeometry();

  for (const side of ["south", "north"]) {
    for (const lane of ["west", "east"]) {
      assertRotationInvariant({
        label: `${side} ${lane} pocket`,
        rectangle: masks.forwardPockets[side][lane],
        side,
        lanes: [lane],
      });
    }
  }

  assertRotationInvariant({
    label: "river",
    rectangle: geometry.river,
    side: "south",
    lanes: [],
  });

  for (const tower of geometry.towers) {
    assertRotationInvariant({
      label: `${tower.side} ${tower.role} ${tower.lane ?? ""} tower`,
      rectangle: tower.bounds,
      side: "south",
      lanes: ["west", "east"],
    });
  }

  assertRotationInvariant({
    label: "edge inset",
    rectangle: {
      minX: masks.edgeInset,
      maxX: ARENA_WIDTH_MILLITILES - masks.edgeInset,
      minY: masks.edgeInset,
      maxY: ARENA_LENGTH_MILLITILES - masks.edgeInset,
    },
    side: "south",
    lanes: ["west", "east"],
  });

  for (const side of ["south", "north"]) {
    assertRotationInvariant({
      label: `${side} king strip`,
      rectangle: masks.kingBehindStrips[side],
      side,
      lanes: ["west", "east"],
    });
  }
});

test("deployment: exact mask edges use documented closed boundary semantics", () => {
  const cases = [
    ["south west pocket edge", "south", { x: 500, y: 20_000 }, ["west"]],
    ["south east pocket split", "south", { x: 9_000, y: 20_000 }, ["east"]],
    ["south pocket river edge", "south", { x: 6_000, y: 17_000 }, ["west"]],
    ["south west tower corner", "south", { x: 2_000, y: 6_000 }, []],
  ];
  for (const [label, side, point, lanes] of cases) {
    assert.deepEqual(
      evaluateDeployment(request(side, "ground_entity", point, lanes)),
      evaluateDeployment(request(
        oppositeSide(side),
        "ground_entity",
        rotateArenaPoint180(point),
        lanes.map(oppositeLane),
      )),
      label,
    );
  }

  assert.equal(
    getDeploymentPolicy().estimatedMasksNotCollisionAuthoritative
      .rectangleBoundarySemantics,
    "closed [min, max] edges; membership commutes with 180-degree rotation",
  );
});

test("deployment: hard facts and unverified masks are visibly separated", () => {
  const policy = getDeploymentPolicy();
  assert.equal(policy.hardRules.confidence, "high");
  assert.equal(
    policy.estimatedMasksNotCollisionAuthoritative.confidence,
    "estimate",
  );
  assert.match(
    reference.deployment.initial_unit_and_building_zone,
    /Own-side walkable ground/,
  );
  assert.match(
    reference.deployment.after_enemy_princess_tower_destroyed,
    /opposite lane/,
  );
  assert.match(reference.deployment.spells, /full 18x32 playfield/);
  assert.ok(reference.unverified_fields.some((field) =>
    field.includes("exact cell mask")
  ));

  policy.hardRules.playfield.maxX = 1;
  policy.estimatedMasksNotCollisionAuthoritative
    .forwardPockets.south.west.minX = 1;
  const fresh = getDeploymentPolicy();
  assert.equal(fresh.hardRules.playfield.maxX, 18_000);
  assert.equal(
    fresh.estimatedMasksNotCollisionAuthoritative
      .forwardPockets.south.west.minX,
    500,
  );
});

test("deployment: malformed and accessor-bearing input is rejected unopened", () => {
  assert.throws(
    () => evaluateDeployment({}),
    /invalid shape/,
  );
  assert.throws(
    () => evaluateDeployment(request(
      "middle", "ground_entity", { x: 1_000, y: 1_000 },
    )),
    /south or north/,
  );
  assert.throws(
    () => evaluateDeployment(request(
      "south", "special_card", { x: 1_000, y: 1_000 },
    )),
    /ground_entity or global_effect/,
  );
  assert.throws(
    () => evaluateDeployment(request(
      "south", "ground_entity", { x: 1_000, y: 1_000 }, ["west", "west"],
    )),
    /duplicates/,
  );

  let getterCalls = 0;
  const accessorPoint = {
    get x() {
      getterCalls += 1;
      return 1_000;
    },
    y: 1_000,
  };
  assert.throws(
    () => evaluateDeployment(request(
      "south", "ground_entity", accessorPoint,
    )),
    /data property/,
  );
  const lanes = [];
  Object.defineProperty(lanes, "0", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "west";
    },
  });
  Object.defineProperty(lanes, "length", { value: 1 });
  assert.throws(
    () => evaluateDeployment(request(
      "south", "ground_entity", { x: 1_000, y: 1_000 }, lanes,
    )),
    /data values/,
  );
  assert.equal(getterCalls, 0);
});
