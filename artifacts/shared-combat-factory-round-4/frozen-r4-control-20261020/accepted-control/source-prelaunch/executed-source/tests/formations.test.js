import assert from "node:assert/strict";
import test from "node:test";

import { layoutFormation } from "../src/sim/formations.js";
import {
  MAX_SPATIAL_MILLITILES,
  circlesOverlap,
} from "../src/sim/spatial.js";

function members(count, radius = 250) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    role: "primary",
    radius,
  }));
}

function offsets(count, radius = 250) {
  return layoutFormation({ x: 10_000, y: 20_000 }, members(count, radius))
    .map((member) => member.offset);
}

test("formations: pinned 2/3/4/5/6 member templates are exact", () => {
  assert.deepEqual(offsets(2), [
    { x: -251, y: 0 }, { x: 251, y: 0 },
  ]);
  assert.deepEqual(offsets(3), [
    { x: 0, y: -502 },
    { x: -251, y: 251 },
    { x: 251, y: 251 },
  ]);
  assert.deepEqual(offsets(4), [
    { x: -251, y: -251 }, { x: 251, y: -251 },
    { x: -251, y: 251 }, { x: 251, y: 251 },
  ]);
  assert.deepEqual(offsets(5), [
    { x: -251, y: -753 }, { x: 251, y: -753 },
    { x: -502, y: 502 }, { x: 0, y: 502 },
    { x: 502, y: 502 },
  ]);
  assert.deepEqual(offsets(6), [
    { x: -502, y: -251 }, { x: 0, y: -251 },
    { x: 502, y: -251 }, { x: -502, y: 251 },
    { x: 0, y: 251 }, { x: 502, y: 251 },
  ]);
});

test("formations: pinned 15 member template is three stable rows", () => {
  assert.deepEqual(offsets(15), [
    { x: -1004, y: -502 }, { x: -502, y: -502 },
    { x: 0, y: -502 }, { x: 502, y: -502 },
    { x: 1004, y: -502 },
    { x: -1004, y: 0 }, { x: -502, y: 0 },
    { x: 0, y: 0 }, { x: 502, y: 0 }, { x: 1004, y: 0 },
    { x: -1004, y: 502 }, { x: -502, y: 502 },
    { x: 0, y: 502 }, { x: 502, y: 502 },
    { x: 1004, y: 502 },
  ]);
});

test("formations: every count 1-15 is centered and deterministic", () => {
  for (let count = 1; count <= 15; count += 1) {
    const input = members(count, 137);
    const first = layoutFormation({ x: -900, y: 3100 }, input);
    const second = layoutFormation({ x: -900, y: 3100 }, input);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.reduce((sum, item) => sum + item.offset.x, 0), 0);
    assert.equal(first.reduce((sum, item) => sum + item.offset.y, 0), 0);
  }
});

test("formations: heterogeneous collision circles are strictly separate", () => {
  const input = members(15).map((member, index) => ({
    ...member,
    radius: [0, 3, 90, 250, 499][index % 5],
  }));
  const result = layoutFormation({ x: 0, y: 0 }, input);
  for (let left = 0; left < result.length; left += 1) {
    for (let right = left + 1; right < result.length; right += 1) {
      assert.equal(
        circlesOverlap(
          { position: result[left].position, radius: result[left].radius },
          { position: result[right].position, radius: result[right].radius },
        ),
        false,
        `members ${left} and ${right} overlap`,
      );
    }
  }
});

test("formations: mixed roles preserve ordered member-to-slot assignment", () => {
  const input = [
    { id: 41, role: "primary", radius: 100 },
    { id: 17, role: "secondary", radius: 200 },
    { id: 99, role: "secondary", radius: 50 },
    { id: 3, role: "primary", radius: 125 },
  ];
  assert.deepEqual(layoutFormation({ x: 1000, y: 2000 }, input), [
    {
      id: 41, role: "primary", radius: 100,
      offset: { x: -201, y: -201 },
      position: { x: 799, y: 1799 },
    },
    {
      id: 17, role: "secondary", radius: 200,
      offset: { x: 201, y: -201 },
      position: { x: 1201, y: 1799 },
    },
    {
      id: 99, role: "secondary", radius: 50,
      offset: { x: -201, y: 201 },
      position: { x: 799, y: 2201 },
    },
    {
      id: 3, role: "primary", radius: 125,
      offset: { x: 201, y: 201 },
      position: { x: 1201, y: 2201 },
    },
  ]);
});

test("formations: results are isolated from inputs and callers", () => {
  const anchor = { x: 100, y: 200 };
  const input = members(2, 10);
  const result = layoutFormation(anchor, input);
  anchor.x = 900;
  input[0].radius = 999;
  result[0].offset.x = 444;
  result[0].position.x = 555;
  assert.deepEqual(layoutFormation({ x: 100, y: 200 }, members(2, 10))[0], {
    id: 1,
    role: "primary",
    radius: 10,
    offset: { x: -11, y: 0 },
    position: { x: 89, y: 200 },
  });
});

test("formations: malformed, sparse, accessor, and duplicate data is rejected", () => {
  assert.throws(() => layoutFormation({ x: 0, y: 0 }, []), /between 1 and 15/);
  assert.throws(
    () => layoutFormation({ x: 0, y: 0 }, members(16)),
    /between 1 and 15/,
  );
  const sparse = members(2);
  delete sparse[0];
  assert.throws(() => layoutFormation({ x: 0, y: 0 }, sparse), /sparse/);
  const duplicate = members(2);
  duplicate[1].id = 1;
  assert.throws(
    () => layoutFormation({ x: 0, y: 0 }, duplicate),
    /unique IDs/,
  );
  assert.throws(
    () => layoutFormation({ x: 0, y: 0 }, [
      { id: 1, role: "leader", radius: 1 },
    ]),
    /primary.*secondary/,
  );
  let getterCalls = 0;
  const accessorMember = { id: 1, role: "primary" };
  Object.defineProperty(accessorMember, "radius", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  assert.throws(
    () => layoutFormation({ x: 0, y: 0 }, [accessorMember]),
    /data property/,
  );
  assert.equal(getterCalls, 0);
  const accessorArray = [];
  Object.defineProperty(accessorArray, "0", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return members(1)[0];
    },
  });
  assert.throws(
    () => layoutFormation({ x: 0, y: 0 }, accessorArray),
    /data property/,
  );
  assert.equal(getterCalls, 0);
});

test("formations: anchor and generated positions stay within spatial bounds", () => {
  assert.throws(
    () => layoutFormation(
      { x: MAX_SPATIAL_MILLITILES, y: 0 },
      members(2, 1),
    ),
    /outside.*spatial bounds/,
  );
  assert.throws(
    () => layoutFormation(
      { x: MAX_SPATIAL_MILLITILES + 1, y: 0 },
      members(1, 1),
    ),
    /spatial bounds/,
  );
  assert.deepEqual(
    layoutFormation(
      { x: MAX_SPATIAL_MILLITILES, y: -MAX_SPATIAL_MILLITILES },
      members(1, MAX_SPATIAL_MILLITILES),
    )[0].position,
    { x: MAX_SPATIAL_MILLITILES, y: -MAX_SPATIAL_MILLITILES },
  );
});
