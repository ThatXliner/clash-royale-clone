import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ARENA_LENGTH_MILLITILES,
  ARENA_MILLITILES_PER_TILE,
  ARENA_WIDTH_MILLITILES,
  getArenaGeometry,
  isGroundStaticallyBlocked,
  isPointInArena,
  isRectangleInArena,
  rectangleContainsPoint,
  rotateArenaPoint180,
  rotateArenaRectangle180,
  validateArenaPoint,
  validateArenaRectangle,
} from "../src/sim/arena-geometry.js";

const reference = JSON.parse(readFileSync(
  new URL("../reference/stats/arena.json", import.meta.url),
  "utf8",
));

function referenceRectangle(bounds) {
  return {
    minX: bounds.x_bounds[0] * 1000,
    maxX: bounds.x_bounds[1] * 1000,
    minY: bounds.y_bounds[0] * 1000,
    maxY: bounds.y_bounds[1] * 1000,
  };
}

function estimatedComparisonReport() {
  const runtime = getArenaGeometry();
  const playfield = reference.playfield;
  const referenceTowers = [
    ["south", "central", null, playfield.tower_positions.blue.king],
    ["south", "lane", "west", playfield.tower_positions.blue.left_princess],
    ["south", "lane", "east", playfield.tower_positions.blue.right_princess],
    ["north", "central", null, playfield.tower_positions.red.king],
    ["north", "lane", "west", playfield.tower_positions.red.right_princess],
    ["north", "lane", "east", playfield.tower_positions.red.left_princess],
  ];
  return {
    hard_high_confidence: {
      runtime_tiles: {
        width: runtime.bounds.maxX / 1000,
        length: runtime.bounds.maxY / 1000,
        river_y: [runtime.river.minY / 1000, runtime.river.maxY / 1000],
        ground_crossing: "river blocked except at two bridge estimates",
      },
      reference_tiles: {
        width: playfield.width_tiles,
        length: playfield.length_tiles,
        river_y: playfield.river.y_bounds,
        ground_crossing: playfield.river
          .crossable_only_at_bridges_for_ground_units,
      },
    },
    low_medium_confidence_estimates_not_fidelity_proof: {
      confidence_labels: [
        "approximate_center",
        "approximate_footprint",
        "unverified_fields",
      ],
      reference_unverified_fields: reference.unverified_fields.filter((field) =>
        field.includes("bridges") || field.includes("tower_positions")
      ),
      bridges: runtime.bridges.map((bridge, index) => ({
        lane: bridge.lane,
        confidence: bridge.confidence,
        runtime_millitiles: {
          center: bridge.center,
          bounds: bridge.bounds,
        },
        reference_estimate_millitiles: {
          approximate_center: {
            x: playfield.bridges[index].approximate_center[0] * 1000,
            y: playfield.bridges[index].approximate_center[1] * 1000,
          },
          approximate_footprint: referenceRectangle(
            playfield.bridges[index].approximate_footprint,
          ),
        },
      })),
      towers: runtime.towers.map((tower, index) => {
        const [side, role, lane, estimate] = referenceTowers[index];
        const halfWidth = estimate.nominal_footprint_tiles[0] * 500;
        const halfHeight = estimate.nominal_footprint_tiles[1] * 500;
        const center = {
          x: estimate.approximate_center[0] * 1000,
          y: estimate.approximate_center[1] * 1000,
        };
        return {
          side,
          role,
          ...(lane === null ? {} : { lane }),
          confidence: tower.confidence,
          runtime_millitiles: {
            center: tower.center,
            bounds: tower.bounds,
          },
          reference_estimate_millitiles: {
            approximate_center: center,
            nominal_footprint_estimate: {
              minX: center.x - halfWidth,
              maxX: center.x + halfWidth,
              minY: center.y - halfHeight,
              maxY: center.y + halfHeight,
            },
          },
        };
      }),
    },
  };
}

test("arena geometry: hard high-confidence dimensions and river rules match", () => {
  const playfield = reference.playfield;
  assert.equal(ARENA_MILLITILES_PER_TILE, 1000);
  assert.equal(ARENA_WIDTH_MILLITILES, playfield.width_tiles * 1000);
  assert.equal(ARENA_LENGTH_MILLITILES, playfield.length_tiles * 1000);
  assert.deepEqual(
    [getArenaGeometry().river.minY, getArenaGeometry().river.maxY],
    playfield.river.y_bounds.map((value) => value * 1000),
  );
  assert.equal(
    playfield.river.crossable_only_at_bridges_for_ground_units,
    true,
  );
  assert.equal(getArenaGeometry().bridges.length, 2);
});

test("arena geometry: estimated coordinates are reported side by side", () => {
  const report = estimatedComparisonReport();
  console.log(`ARENA REFERENCE COMPARISON\n${JSON.stringify(report, null, 2)}`);
  for (
    const item of [
      ...report.low_medium_confidence_estimates_not_fidelity_proof.bridges,
      ...report.low_medium_confidence_estimates_not_fidelity_proof.towers,
    ]
  ) {
    assert.equal(item.confidence, "estimate");
  }
  assert.ok(
    report.low_medium_confidence_estimates_not_fidelity_proof
      .reference_unverified_fields.length >= 4,
  );
});

test("arena geometry: all static rectangles are in bounds and separate", () => {
  const geometry = getArenaGeometry();
  assert.equal(isRectangleInArena(geometry.river), true);
  for (const bridge of geometry.bridges) {
    assert.equal(isRectangleInArena(bridge.bounds), true);
    assert.equal(rectangleContainsPoint(geometry.river, bridge.center), true);
  }
  for (let left = 0; left < geometry.towers.length; left += 1) {
    const tower = geometry.towers[left];
    assert.equal(isRectangleInArena(tower.bounds), true);
    assert.equal(rectangleContainsPoint(tower.bounds, tower.center), true);
    for (let right = left + 1; right < geometry.towers.length; right += 1) {
      const other = geometry.towers[right];
      const overlap = !(
        tower.bounds.maxX <= other.bounds.minX ||
        other.bounds.maxX <= tower.bounds.minX ||
        tower.bounds.maxY <= other.bounds.minY ||
        other.bounds.maxY <= tower.bounds.minY
      );
      assert.equal(overlap, false, `tower rectangles ${left}/${right} overlap`);
    }
  }
});

test("arena geometry: ground river crossing is open only inside bridges", () => {
  assert.equal(isGroundStaticallyBlocked({ x: 9_000, y: 16_000 }), true);
  assert.equal(isGroundStaticallyBlocked({ x: 3_500, y: 16_000 }), false);
  assert.equal(isGroundStaticallyBlocked({ x: 14_500, y: 16_000 }), false);
  assert.equal(isGroundStaticallyBlocked({ x: 2_500, y: 15_000 }), false);
  assert.equal(isGroundStaticallyBlocked({ x: 4_499, y: 16_999 }), false);
  assert.equal(isGroundStaticallyBlocked({ x: 4_500, y: 16_000 }), true);
  assert.equal(isGroundStaticallyBlocked({ x: 3_500, y: 17_000 }), false);
});

test("arena geometry: tower centers, interiors, and half-open edges block exactly", () => {
  const tower = getArenaGeometry().towers[0];
  assert.equal(isGroundStaticallyBlocked(tower.center), true);
  assert.equal(
    isGroundStaticallyBlocked({ x: tower.bounds.minX, y: tower.bounds.minY }),
    true,
  );
  assert.equal(
    isGroundStaticallyBlocked({
      x: tower.bounds.maxX - 1,
      y: tower.bounds.maxY - 1,
    }),
    true,
  );
  assert.equal(
    isGroundStaticallyBlocked({
      x: tower.bounds.maxX,
      y: tower.bounds.maxY - 1,
    }),
    false,
  );
  assert.equal(
    rectangleContainsPoint(tower.bounds, {
      x: tower.bounds.minX,
      y: tower.bounds.maxY,
    }),
    false,
  );
});

test("arena geometry: closed outer bounds and shape edges are explicit", () => {
  assert.equal(isPointInArena({ x: 0, y: 0 }), true);
  assert.equal(isPointInArena({ x: 18_000, y: 32_000 }), true);
  assert.equal(isPointInArena({ x: 18_001, y: 32_000 }), false);
  assert.equal(isRectangleInArena({
    minX: 0, maxX: 18_000, minY: 0, maxY: 32_000,
  }), true);
  assert.equal(rectangleContainsPoint(
    { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
    { x: 0, y: 0 },
  ), true);
  assert.equal(rectangleContainsPoint(
    { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
    { x: 1000, y: 999 },
  ), false);
  assert.equal(isGroundStaticallyBlocked({ x: -1, y: 0 }), true);
});

test("arena geometry: every estimate has exact 180-degree symmetry", () => {
  const geometry = getArenaGeometry();
  for (const bridge of geometry.bridges) {
    const rotatedCenter = rotateArenaPoint180(bridge.center);
    const counterpart = geometry.bridges.find((candidate) =>
      candidate.center.x === rotatedCenter.x &&
      candidate.center.y === rotatedCenter.y
    );
    assert.ok(counterpart);
    assert.deepEqual(
      rotateArenaRectangle180(bridge.bounds),
      counterpart.bounds,
    );
  }
  for (const tower of geometry.towers) {
    const rotatedCenter = rotateArenaPoint180(tower.center);
    const counterpart = geometry.towers.find((candidate) =>
      candidate.center.x === rotatedCenter.x &&
      candidate.center.y === rotatedCenter.y
    );
    assert.ok(counterpart);
    assert.deepEqual(
      rotateArenaRectangle180(tower.bounds),
      counterpart.bounds,
    );
  }
  const point = { x: 1234, y: 5678 };
  assert.deepEqual(rotateArenaPoint180(rotateArenaPoint180(point)), point);
});

test("arena geometry: returned JSON is isolated from inputs and callers", () => {
  const first = getArenaGeometry();
  assert.doesNotThrow(() => JSON.stringify(first));
  first.bounds.maxX = 1;
  first.bridges[0].bounds.minX = 1;
  first.towers[0].center.x = 1;
  const second = getArenaGeometry();
  assert.equal(second.bounds.maxX, 18_000);
  assert.equal(second.bridges[0].bounds.minX, 2_500);
  assert.equal(second.towers[0].center.x, 9_000);

  const input = { x: 3_500, y: 16_000 };
  const checked = validateArenaPoint(input);
  input.x = 0;
  assert.deepEqual(checked, { x: 3_500, y: 16_000 });
});

test("arena geometry: malformed, unsafe, and accessor data is rejected safely", () => {
  assert.throws(() => validateArenaPoint(null), /plain/);
  assert.throws(() => validateArenaPoint({ x: 0 }), /invalid shape/);
  assert.throws(
    () => validateArenaPoint({ x: Number.MAX_SAFE_INTEGER + 1, y: 0 }),
    /safe integer/,
  );
  assert.throws(
    () => validateArenaRectangle({ minX: 0, maxX: 0, minY: 0, maxY: 1 }),
    /positive width/,
  );
  assert.throws(
    () => rotateArenaPoint180({ x: -1, y: 0 }),
    /within the closed arena/,
  );
  assert.throws(
    () => rotateArenaRectangle180({
      minX: 0, maxX: 18_001, minY: 0, maxY: 1,
    }),
    /within the closed arena/,
  );

  let getterCalls = 0;
  const accessorPoint = {
    get x() {
      getterCalls += 1;
      return 0;
    },
    y: 0,
  };
  assert.throws(() => isPointInArena(accessorPoint), /data property/);
  assert.equal(getterCalls, 0);
});
