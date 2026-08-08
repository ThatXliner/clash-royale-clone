import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getArenaGeometry,
  isGroundStaticallyBlocked,
  rotateArenaPoint180,
} from "../src/sim/arena-geometry.js";
import {
  findGroundPath,
  GROUND_PATH_GRID_STEP_MILLITILES,
  isGroundNavigationNode,
} from "../src/sim/pathfinding.js";

const reference = JSON.parse(readFileSync(
  new URL("../reference/stats/arena.json", import.meta.url),
  "utf8",
));

function segmentMidpoint(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function assertLegalRoute(route, start, end) {
  assert.ok(Array.isArray(route));
  assert.deepEqual(route[0], start);
  assert.deepEqual(route.at(-1), end);
  for (let index = 0; index < route.length; index += 1) {
    const point = route[index];
    assert.equal(isGroundNavigationNode(point), true);
    assert.equal(isGroundStaticallyBlocked(point), false);
    if (index === 0) continue;
    const previous = route[index - 1];
    assert.equal(
      Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y),
      GROUND_PATH_GRID_STEP_MILLITILES,
    );
    assert.equal(isGroundStaticallyBlocked(segmentMidpoint(previous, point)), false);
  }
}

function assertTileCenter(point) {
  assert.equal(point.x % GROUND_PATH_GRID_STEP_MILLITILES, 500);
  assert.equal(point.y % GROUND_PATH_GRID_STEP_MILLITILES, 500);
}

function bridgeLaneForRiverPoint(point) {
  if (point.y < 15_000 || point.y >= 17_000) return null;
  const bridge = getArenaGeometry().bridges.find((candidate) =>
    point.x >= candidate.bounds.minX &&
    point.x < candidate.bounds.maxX &&
    point.y >= candidate.bounds.minY &&
    point.y < candidate.bounds.maxY
  );
  return bridge?.lane ?? "blocked";
}

test("pathfinding: representative cross-river routes occupy bridge cells only", () => {
  const cases = [
    [{ x: 2_500, y: 10_500 }, { x: 2_500, y: 21_500 }, "west"],
    [{ x: 15_500, y: 10_500 }, { x: 15_500, y: 21_500 }, "east"],
  ];
  for (const [start, end, expectedLane] of cases) {
    const route = findGroundPath(start, end);
    assertLegalRoute(route, start, end);
    const riverLanes = route
      .map(bridgeLaneForRiverPoint)
      .filter((lane) => lane !== null);
    assert.ok(riverLanes.length > 0);
    assert.deepEqual([...new Set(riverLanes)], [expectedLane]);
  }
});

test("pathfinding: equal bridge ties have a documented stable west winner", () => {
  const start = { x: 8_500, y: 10_500 };
  const end = { x: 9_500, y: 21_500 };
  const first = findGroundPath(start, end);
  const second = findGroundPath(start, end);
  const reorderedData = findGroundPath(
    { y: start.y, x: start.x },
    { y: end.y, x: end.x },
  );
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(first), JSON.stringify(reorderedData));
  assert.deepEqual(
    [...new Set(first.map(bridgeLaneForRiverPoint).filter(Boolean))],
    ["west"],
  );
});

test("pathfinding: same-side shortest routes stay in arena and avoid towers", () => {
  const start = { x: 500, y: 7_500 };
  const end = { x: 5_500, y: 7_500 };
  const route = findGroundPath(start, end);
  assertLegalRoute(route, start, end);
  assert.ok(route.some((point) => point.y < 6_000 || point.y >= 9_000));
  for (const point of route) {
    assert.equal(isGroundStaticallyBlocked(point), false);
  }
});

test("pathfinding: rotated scenarios have equal shortest length", () => {
  const start = { x: 8_500, y: 10_500 };
  const end = { x: 9_500, y: 21_500 };
  const forward = findGroundPath(start, end);
  const rotated = findGroundPath(
    rotateArenaPoint180(start),
    rotateArenaPoint180(end),
  );
  assert.equal(forward.length, rotated.length);
  // The fixed west-first order intentionally chooses west in both exact ties,
  // rather than changing its tie rule to force route reflection.
  assert.deepEqual(
    [...new Set(rotated.map(bridgeLaneForRiverPoint).filter(Boolean))],
    ["west"],
  );

  const asymmetricStart = { x: 2_500, y: 10_500 };
  const asymmetricEnd = { x: 2_500, y: 21_500 };
  const asymmetric = findGroundPath(asymmetricStart, asymmetricEnd);
  const asymmetricRotated = findGroundPath(
    rotateArenaPoint180(asymmetricStart),
    rotateArenaPoint180(asymmetricEnd),
  );
  assert.equal(asymmetric.length, asymmetricRotated.length);
  assert.deepEqual(asymmetricRotated[0], rotateArenaPoint180(asymmetricStart));
  assert.deepEqual(
    asymmetricRotated.at(-1),
    rotateArenaPoint180(asymmetricEnd),
  );
  assert.deepEqual(
    [...new Set(asymmetricRotated.map(bridgeLaneForRiverPoint).filter(Boolean))],
    ["east"],
  );
});

test("pathfinding: blocked, off-grid, outside, and malformed inputs are explicit", () => {
  assert.throws(
    () => findGroundPath({ x: 8_500, y: 15_500 }, { x: 500, y: 500 }),
    /start is blocked/,
  );
  assert.throws(
    () => findGroundPath({ x: 500, y: 500 }, { x: 3_500, y: 7_500 }),
    /end is blocked/,
  );
  assert.throws(
    () => findGroundPath({ x: 500, y: 1_000 }, { x: 500, y: 500 }),
    /navigation lattice/,
  );
  assert.throws(
    () => findGroundPath({ x: -500, y: 500 }, { x: 500, y: 500 }),
    /inside the arena/,
  );
  assert.throws(
    () => findGroundPath({ x: 500 }, { x: 500, y: 500 }),
    /invalid shape/,
  );
});

test("pathfinding: output is isolated JSON and singleton routes are explicit", () => {
  const point = { x: 500, y: 500 };
  const first = findGroundPath(point, point);
  assert.deepEqual(first, [point]);
  assert.doesNotThrow(() => JSON.stringify(first));
  first[0].x = 99;
  assert.deepEqual(findGroundPath(point, point), [point]);
});

test("pathfinding: every graph node is a tile center away from outer boundaries", () => {
  let legalNodeCount = 0;
  for (let y = 0; y <= 32_000; y += 500) {
    for (let x = 0; x <= 18_000; x += 500) {
      const point = { x, y };
      if (!isGroundNavigationNode(point)) continue;
      legalNodeCount += 1;
      assertTileCenter(point);
      assert.ok(point.x > 0 && point.x < 18_000);
      assert.ok(point.y > 0 && point.y < 32_000);
    }
  }
  assert.ok(legalNodeCount > 0);
  assert.equal(isGroundNavigationNode({ x: 0, y: 500 }), false);
  assert.equal(isGroundNavigationNode({ x: 17_500, y: 32_000 }), false);
});

test("pathfinding: declared bridge centers are traversable crossing midpoints", () => {
  for (const bridge of getArenaGeometry().bridges) {
    const southNode = { x: bridge.center.x, y: 15_500 };
    const northNode = { x: bridge.center.x, y: 16_500 };
    assert.equal(isGroundNavigationNode(southNode), true);
    assert.equal(isGroundNavigationNode(northNode), true);
    assert.deepEqual(segmentMidpoint(southNode, northNode), bridge.center);
    assert.equal(isGroundStaticallyBlocked(bridge.center), false);

    const crossing = findGroundPath(southNode, northNode);
    assert.deepEqual(crossing, [southNode, northNode]);
    assertLegalRoute(crossing, southNode, northNode);
  }
});

test("pathfinding: routes have independently known shortest lengths", () => {
  const straight = findGroundPath(
    { x: 3_500, y: 14_500 },
    { x: 3_500, y: 17_500 },
  );
  assert.equal(straight.length, 4);

  const detour = findGroundPath(
    { x: 8_500, y: 14_500 },
    { x: 8_500, y: 17_500 },
  );
  // Three vertical moves plus ten horizontal moves to and from the nearest
  // bridge column; waypoint count is move count plus one.
  assert.equal(detour.length, 14);
  assert.deepEqual(
    [...new Set(detour.map(bridgeLaneForRiverPoint).filter(Boolean))],
    ["west"],
  );
});

test("pathfinding: calibration caveat remains visible beside reference facts", () => {
  const geometry = getArenaGeometry();
  assert.equal(reference.playfield.width_tiles, 18);
  assert.equal(reference.playfield.length_tiles, 32);
  assert.equal(reference.playfield.river.crossable_only_at_bridges_for_ground_units, true);
  assert.ok(
    reference.unverified_fields.includes(
      "playfield.bridges[*].approximate_footprint",
    ),
  );
  assert.ok(
    reference.unverified_fields.some((field) =>
      field.includes("tower_positions")
    ),
  );
  assert.ok(geometry.bridges.every((bridge) => bridge.confidence === "estimate"));
  assert.ok(geometry.towers.every((tower) => tower.confidence === "estimate"));
});
