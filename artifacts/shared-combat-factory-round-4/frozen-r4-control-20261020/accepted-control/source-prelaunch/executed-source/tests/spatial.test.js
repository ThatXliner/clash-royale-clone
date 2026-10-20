import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SPATIAL_MILLITILES,
  MILLITILES_PER_TILE,
  circlesOverlap,
  millitilesToTiles,
  nearestSpatialEntity,
  position,
  radius,
  spatialEntity,
  squaredDistance,
  tilesToMillitiles,
  validateCircle,
  validatePosition,
} from "../src/sim/spatial.js";

function entity(id, layer, x, y, tileRadius = 0.5) {
  return spatialEntity({
    id,
    layer,
    position: position(x, y),
    radius: radius(tileRadius),
  });
}

test("spatial: tile conversion uses exact integer millitiles", () => {
  assert.equal(MILLITILES_PER_TILE, 1000);
  assert.equal(tilesToMillitiles(3.5), 3500);
  assert.equal(tilesToMillitiles(-1.125), -1125);
  assert.equal(tilesToMillitiles(-0), 0);
  assert.equal(millitilesToTiles(14500), 14.5);
  assert.deepEqual(position(3.5, 16), { x: 3500, y: 16000 });
  assert.equal(radius(0.75), 750);
  assert.throws(
    () => tilesToMillitiles(1.0001),
    /exactly representable/,
  );
  assert.throws(() => tilesToMillitiles(Number.NaN), /finite number/);
  assert.throws(() => tilesToMillitiles("1"), /finite number/);
  assert.throws(() => radius(-0.001), /non-negative/);
  assert.throws(
    () => millitilesToTiles(MAX_SPATIAL_MILLITILES + 1),
    /spatial bounds/,
  );
});

test("spatial: positions, radii, and layers have isolated JSON shapes", () => {
  const inputPosition = { x: 1000, y: 2000 };
  const input = {
    id: 7,
    layer: "ground",
    position: inputPosition,
    radius: 500,
  };
  const checked = spatialEntity(input);
  inputPosition.x = 9000;
  assert.deepEqual(checked, {
    id: 7,
    layer: "ground",
    position: { x: 1000, y: 2000 },
    radius: 500,
  });
  assert.deepEqual(validatePosition({ x: -10, y: 20 }), { x: -10, y: 20 });
  assert.deepEqual(
    validateCircle({ position: { x: 1, y: 2 }, radius: 3 }),
    { position: { x: 1, y: 2 }, radius: 3 },
  );
  assert.throws(
    () => spatialEntity({ ...input, layer: "water" }),
    /ground.*air/,
  );
  assert.throws(
    () => validatePosition({ x: 1, y: 2, z: 3 }),
    /invalid shape/,
  );
  assert.throws(
    () => spatialEntity({ ...input, id: 0 }),
    /positive safe integer/,
  );
});

test("spatial: squared center distance is exact and needs no square root", () => {
  assert.equal(squaredDistance(position(1, 1), position(4, 5)), 25_000_000);
  assert.equal(
    squaredDistance(
      { x: -MAX_SPATIAL_MILLITILES, y: -MAX_SPATIAL_MILLITILES },
      { x: MAX_SPATIAL_MILLITILES, y: MAX_SPATIAL_MILLITILES },
    ),
    Number(8n * BigInt(MAX_SPATIAL_MILLITILES) ** 2n),
  );
});

test("spatial: circle contact is inclusively or strictly selectable", () => {
  const left = { position: position(0, 0), radius: radius(0.5) };
  const tangent = { position: position(1, 0), radius: radius(0.5) };
  const overlap = { position: position(0.999, 0), radius: radius(0.5) };
  const separate = { position: position(1.001, 0), radius: radius(0.5) };

  assert.equal(circlesOverlap(left, tangent), true);
  assert.equal(
    circlesOverlap(left, tangent, { includeBoundary: false }),
    false,
  );
  assert.equal(
    circlesOverlap(left, overlap, { includeBoundary: false }),
    true,
  );
  assert.equal(circlesOverlap(left, separate), false);
});

test("spatial: nearest query is stable by ID across candidate order", () => {
  const origin = { position: position(0, 0), radius: radius(0.5) };
  const highId = entity(20, "ground", -2, 0);
  const lowId = entity(3, "ground", 2, 0);
  const farther = entity(1, "ground", 3, 0);

  for (const candidates of [
    [highId, farther, lowId],
    [lowId, highId, farther],
    [farther, highId, lowId],
  ]) {
    assert.equal(
      nearestSpatialEntity(origin, candidates, { layer: "ground" }).id,
      3,
    );
  }
});

test("spatial: ground, air, and both layer queries are explicit", () => {
  const origin = { position: position(0, 0), radius: 0 };
  const ground = entity(10, "ground", 2, 0);
  const air = entity(20, "air", 1, 0);
  assert.equal(
    nearestSpatialEntity(origin, [air, ground], { layer: "ground" }).id,
    10,
  );
  assert.equal(
    nearestSpatialEntity(origin, [ground, air], { layer: "air" }).id,
    20,
  );
  assert.equal(
    nearestSpatialEntity(origin, [ground, air], { layer: "both" }).id,
    20,
  );
  assert.equal(nearestSpatialEntity(origin, [], { layer: "both" }), null);
});

test("spatial: optional edge range has a documented boundary", () => {
  const origin = { position: position(0, 0), radius: radius(0.25) };
  const touching = entity(2, "ground", 2, 0, 0.5);
  const reach = radius(1.25);

  assert.equal(
    nearestSpatialEntity(origin, [touching], {
      layer: "ground",
      range: reach,
    }).id,
    2,
  );
  assert.equal(
    nearestSpatialEntity(origin, [touching], {
      includeRangeBoundary: false,
      layer: "ground",
      range: reach,
    }),
    null,
  );
  assert.equal(
    nearestSpatialEntity(origin, [touching], {
      layer: "ground",
      range: reach - 1,
    }),
    null,
  );
});

test("spatial: nearest results are isolated from inputs and later callers", () => {
  const candidate = entity(2, "air", 1, 1);
  const found = nearestSpatialEntity(
    { position: position(0, 0), radius: 0 },
    [candidate],
  );
  found.position.x = 9999;
  assert.equal(candidate.position.x, 1000);
  assert.deepEqual(
    nearestSpatialEntity(
      { position: position(0, 0), radius: 0 },
      [candidate],
    ),
    candidate,
  );
});

test("spatial: malformed and unsafe query values are rejected before use", () => {
  const origin = { position: position(0, 0), radius: 0 };
  const valid = entity(1, "ground", 1, 0);
  const invalid = { ...valid, radius: -1 };
  assert.throws(
    () => nearestSpatialEntity(origin, [valid, invalid]),
    /non-negative/,
  );
  assert.throws(
    () => nearestSpatialEntity(origin, {}, {}),
    /must be an array/,
  );
  assert.throws(
    () => nearestSpatialEntity(origin, [valid], { layer: "water" }),
    /ground.*air.*both/,
  );
  assert.throws(
    () => nearestSpatialEntity(origin, [valid], { surprise: true }),
    /invalid shape/,
  );
  assert.throws(
    () => nearestSpatialEntity(origin, [valid], { range: 0.5 }),
    /integer millitile/,
  );
  assert.throws(
    () => nearestSpatialEntity(origin, [valid, { ...valid }]),
    /unique entity IDs/,
  );
  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => nearestSpatialEntity(origin, sparse),
    /sparse array/,
  );
  assert.throws(
    () => circlesOverlap(origin, origin, { surprise: true }),
    /invalid shape/,
  );
  assert.throws(
    () => squaredDistance({ x: Number.MAX_SAFE_INTEGER, y: 0 }, position(0, 0)),
    /spatial bounds/,
  );
});
