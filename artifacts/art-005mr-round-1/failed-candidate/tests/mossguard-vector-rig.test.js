import assert from "node:assert/strict";
import test from "node:test";
import {
  getMossguardVectorPose,
  MOSS_GUARD_DIRECTIONS,
  MOSS_GUARD_POSES,
  MOSS_GUARD_VECTOR_GEOMETRY,
  renderMossguardVectorPose,
} from "../demo/mossguard-vector-rig.js";

test("Mossguard vector poses stay deterministic, anchored, self-contained, and bounded", () => {
  const observed = new Set();
  for (const direction of MOSS_GUARD_DIRECTIONS) {
    for (const pose of MOSS_GUARD_POSES) {
      const team = direction === "north" || direction === "west" ? "ember" : "jade";
      const input = { direction, pose, team, tick: 73 };
      const first = getMossguardVectorPose(input);
      const second = getMossguardVectorPose(input);
      const svg = renderMossguardVectorPose(input);
      assert.deepEqual(first, second, `${direction}/${pose} has stable pose metadata`);
      assert.equal(svg, renderMossguardVectorPose(input), `${direction}/${pose} has stable SVG output`);
      assert.match(svg, new RegExp(`data-direction="${direction}"`));
      assert.match(svg, new RegExp(`data-pose="${pose}"`));
      assert.match(svg, /data-sole-anchor="32 58"/);
      assert.match(svg, /data-safe-bounds="4 6 56 52"/);
      assert.doesNotMatch(svg, /<(?:image|use|foreignObject)\b|\bhref=/i);
      observed.add(`${direction}/${pose}`);
    }
  }
  assert.equal(observed.size, 16);
  assert.deepEqual(MOSS_GUARD_VECTOR_GEOMETRY.soleAnchor, { x: 32, y: 58 });
  assert.deepEqual(MOSS_GUARD_VECTOR_GEOMETRY.safeBounds, { x: 4, y: 6, width: 56, height: 52 });
  assert.equal(MOSS_GUARD_VECTOR_GEOMETRY.bodyHeightUnits, 52);
  assert.equal(MOSS_GUARD_VECTOR_GEOMETRY.nativeBodyHeight, 13);
  assert.match(renderMossguardVectorPose({ direction: "south", pose: "walkA", team: "jade", tick: 74 }), /data-tick="74"/);
  assert.throws(() => getMossguardVectorPose({ direction: "diagonal", pose: "walkA", team: "jade", tick: 0 }), RangeError);
  assert.throws(() => getMossguardVectorPose({ direction: "south", pose: "idle", team: "jade", tick: 0 }), RangeError);
  assert.throws(() => getMossguardVectorPose({ direction: "south", pose: "walkA", team: "blue", tick: 0 }), RangeError);
  assert.throws(() => getMossguardVectorPose({ direction: "south", pose: "walkA", team: "jade", tick: -1 }), RangeError);
});
